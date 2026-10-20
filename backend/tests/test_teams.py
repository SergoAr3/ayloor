import asyncio
from datetime import timedelta
from uuid import UUID

import pytest
from sqlalchemy import select

from app.models import Invite, TeamMember, utcnow


async def test_team_activation_and_duplicate_join(client, login):
    captain, member = await login(1), await login(2)
    created = await client.post("/api/v1/teams", headers=captain, json={"name": "Kentron Mafia"})
    assert created.status_code == 201
    team = created.json()
    assert team["status"] == "pending" and team["member_count"] == 1
    members = await client.get(f"/api/v1/teams/{team['id']}/members", headers=captain)
    assert members.json()[0]["role"] == "captain"
    assert members.json()[0]["user"]["id"] == team["captain_user_id"]
    invite = (
        await client.post(f"/api/v1/teams/{team['id']}/invites", headers=captain, json={})
    ).json()
    assert invite["link"].endswith(f"?start=join_{invite['code']}")
    assert (
        await client.get(f"/api/v1/invites/{invite['code']}", headers=member)
    ).status_code == 200
    result = await client.post(f"/api/v1/invites/{invite['code']}/join", headers=member)
    assert result.json()["status"] == "active" and result.json()["member_count"] == 2
    assert (
        await client.post(f"/api/v1/invites/{invite['code']}/join", headers=member)
    ).status_code == 409
    assert (await client.get("/api/v1/me", headers=captain)).json()["team"]["status"] == "active"


async def test_pending_cannot_create_or_join_another_team(client, login, active_team):
    captain = await login(50)
    assert (
        await client.post("/api/v1/teams", headers=captain, json={"name": "Pending"})
    ).status_code == 201
    assert (
        await client.post("/api/v1/teams", headers=captain, json={"name": "Bypass"})
    ).status_code == 409
    _, _, _, code = await active_team()
    assert (await client.post(f"/api/v1/invites/{code}/join", headers=captain)).status_code == 409


async def test_active_cannot_join_or_create_other_team(client, active_team):
    captain, _, _, _ = await active_team()
    _, _, _, code = await active_team(3, 4, "Other")
    assert (await client.post(f"/api/v1/invites/{code}/join", headers=captain)).status_code == 409
    assert (
        await client.post("/api/v1/teams", headers=captain, json={"name": "Other"})
    ).status_code == 409


async def test_sixth_member_rejected(client, login, active_team):
    captain, _, team, _ = await active_team()
    invite = (
        await client.post(
            f"/api/v1/teams/{team['id']}/invites", headers=captain, json={"max_uses": 10}
        )
    ).json()
    for number in range(3, 6):
        assert (
            await client.post(f"/api/v1/invites/{invite['code']}/join", headers=await login(number))
        ).status_code == 200
    assert (
        await client.post(f"/api/v1/invites/{invite['code']}/join", headers=await login(6))
    ).status_code == 409


async def test_invite_expiry_limit_and_unknown(client, login, active_team, database):
    captain, _, team, _ = await active_team()
    newcomer = await login(3)
    assert (await client.post("/api/v1/invites/missing/join", headers=newcomer)).status_code == 404
    invite = (
        await client.post(
            f"/api/v1/teams/{team['id']}/invites", headers=captain, json={"max_uses": 1}
        )
    ).json()
    assert (
        await client.post(f"/api/v1/invites/{invite['code']}/join", headers=newcomer)
    ).status_code == 200
    assert (
        await client.post(f"/api/v1/invites/{invite['code']}/join", headers=await login(4))
    ).status_code == 409
    async with database.begin() as db:
        row = await db.scalar(select(Invite).where(Invite.code == invite["code"]))
        row.expires_at = utcnow() - timedelta(seconds=1)
    assert (
        await client.get(f"/api/v1/invites/{invite['code']}", headers=newcomer)
    ).status_code == 410


async def test_team_privacy(client, login, active_team):
    _, _, team, _ = await active_team()
    stranger = await login(3)
    assert (
        await client.get(f"/api/v1/teams/{team['id']}/members", headers=stranger)
    ).status_code == 403
    assert (
        await client.post(f"/api/v1/teams/{team['id']}/invites", headers=stranger, json={})
    ).status_code == 403


async def test_concurrent_pending_creation(client, login):
    headers = await login(1)
    results = await asyncio.gather(
        *[
            client.post("/api/v1/teams", headers=headers, json={"name": f"Team {i}"})
            for i in range(3)
        ]
    )
    assert sorted(r.status_code for r in results) == [201, 409, 409]


async def test_concurrent_joins_respect_capacity(client, login, active_team, database):
    captain, _, team, _ = await active_team()
    invites = [
        (await client.post(f"/api/v1/teams/{team['id']}/invites", headers=captain, json={})).json()[
            "code"
        ]
        for _ in range(6)
    ]
    players = [await login(i) for i in range(3, 9)]
    results = await asyncio.gather(
        *[
            client.post(f"/api/v1/invites/{code}/join", headers=player)
            for code, player in zip(invites, players, strict=True)
        ]
    )
    assert sorted(r.status_code for r in results) == [200, 200, 200, 409, 409, 409]
    async with database() as db:
        rows = (
            await db.scalars(
                select(TeamMember).where(
                    TeamMember.team_id == UUID(team["id"]), TeamMember.released_at.is_(None)
                )
            )
        ).all()
        assert len(rows) == 5


async def test_concurrent_single_use_invite(client, login, active_team):
    captain, _, team, _ = await active_team()
    code = (
        await client.post(
            f"/api/v1/teams/{team['id']}/invites", headers=captain, json={"max_uses": 1}
        )
    ).json()["code"]
    players = [await login(3), await login(4)]
    results = await asyncio.gather(
        *[client.post(f"/api/v1/invites/{code}/join", headers=p) for p in players]
    )
    assert sorted(r.status_code for r in results) == [200, 409]


async def test_concurrent_join_different_teams_one_membership(client, login, active_team):
    _, _, _, one = await active_team()
    _, _, _, two = await active_team(3, 4, "Other")
    headers = await login(5)
    results = await asyncio.gather(
        *[client.post(f"/api/v1/invites/{code}/join", headers=headers) for code in (one, two)]
    )
    assert sorted(r.status_code for r in results) == [200, 409]


async def test_block_team_releases_membership(client, login, active_team):
    captain, member, team, code = await active_team()
    admin = await login(900001)
    result = await client.post(f"/api/v1/admin/teams/{team['id']}/block", headers=admin)
    assert result.status_code == 200 and result.json()["status"] == "blocked"
    assert (await client.get("/api/v1/me", headers=member)).json()["team"] is None
    assert (
        await client.post(f"/api/v1/invites/{code}/join", headers=await login(3))
    ).status_code == 403
    assert (
        await client.post("/api/v1/teams", headers=captain, json={"name": "New"})
    ).status_code == 201


@pytest.mark.parametrize("name", ["", "   ", "a" * 81])
async def test_invalid_team_name(client, login, name):
    assert (
        await client.post("/api/v1/teams", headers=await login(1), json={"name": name})
    ).status_code == 422
