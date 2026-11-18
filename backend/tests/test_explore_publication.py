"""Publication, version pinning and migration contracts against PostgreSQL."""

import asyncio
import json
import secrets
import sys
from copy import deepcopy
from uuid import UUID

import pytest
from pydantic import ValidationError
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError
from test_explore import ROOT, post, start
from test_field_test_migration import alembic

from app.core.config import ROOT as REPO
from app.models import ExploreRun, Guide, GuideStop
from app.publish_guide import GuideSpec, PublicationConflict, publish, read_spec

EXAMPLE = REPO / "backend/guides/example-walk-v1.json"


@pytest.fixture
def spec():
    return read_spec(EXAMPLE)


async def test_publish_repeat_preserves_ids_content_and_timestamp(database, spec):
    async with database.begin() as db:
        guide = await publish(db, spec)
        original = (guide.id, guide.published_at)
        stops = list((await db.scalars(select(GuideStop.id).order_by(GuideStop.position))).all())
    async with database.begin() as db:
        repeated = await publish(db, spec)
        assert (repeated.id, repeated.published_at) == original
        assert (
            list((await db.scalars(select(GuideStop.id).order_by(GuideStop.position))).all())
            == stops
        )
        assert await db.scalar(select(func.count()).select_from(Guide)) == 1


@pytest.mark.parametrize("change", ["title", "answer", "reveal", "directions", "remove_stop"])
async def test_changed_publication_refused_without_touching_old_version(database, spec, change):
    async with database.begin() as db:
        await publish(db, spec)
    changed = spec.model_dump()
    if change == "title":
        changed[change] = "Changed title"
    elif change == "remove_stop":
        changed["stops"].pop()
    else:
        changed["stops"][0][change] = "Changed content"
    with pytest.raises(PublicationConflict):
        async with database.begin() as db:
            await publish(db, GuideSpec.model_validate(changed))
    async with database.begin() as db:
        # Exact original still matches, including all private answer fields.
        await publish(db, spec)


async def test_concurrent_publication_is_atomic(database, spec):
    async def install(value):
        async with database.begin() as db:
            guide = await publish(db, value)
            return guide.id

    ids = await asyncio.gather(*(install(spec) for _ in range(4)))
    assert len(set(ids)) == 1
    second = spec.model_dump()
    second.update(slug="race-v1", title="First proposal")
    conflicting = deepcopy(second)
    conflicting["title"] = "Conflicting proposal"
    results = await asyncio.gather(
        install(GuideSpec.model_validate(second)),
        install(GuideSpec.model_validate(conflicting)),
        return_exceptions=True,
    )
    assert sum(isinstance(value, UUID) for value in results) == 1
    assert sum(isinstance(value, PublicationConflict) for value in results) == 1


@pytest.mark.parametrize(
    "field,value",
    [
        ("slug", "../walk"),
        ("slug", "a" * 101),
        ("title", "  "),
        ("description", "\n"),
        ("stops", []),
        ("unknown", True),
    ],
)
def test_invalid_guide_rejected(spec, field, value):
    data = spec.model_dump()
    data[field] = value
    with pytest.raises(ValidationError):
        GuideSpec.model_validate(data)


@pytest.mark.parametrize(
    "field,value",
    [
        ("position", 2),
        ("position", 1.5),
        ("title", ""),
        ("clue", " "),
        ("clue", "bad\x00text"),
        ("clue", "bad\ud800text"),
        ("answer", "\t"),
        ("answer", "a" * 201),
        ("hint", ""),
        ("reveal", ""),
        ("latitude", 0),
        ("latitude", 91),
        ("radius_m", float("inf")),
        ("directions", ""),
        ("unknown", "ignored?"),
    ],
)
def test_invalid_stop_rejected(spec, field, value):
    data = spec.model_dump()
    data["stops"][0][field] = value
    with pytest.raises(ValidationError):
        GuideSpec.model_validate(data)


async def test_invalid_programmatic_import_cannot_write_partial_data(database, spec):
    bad = spec.model_copy(update={"stops": []})
    with pytest.raises(ValidationError):
        async with database.begin() as db:
            await publish(db, bad)
    async with database() as db:
        assert await db.scalar(select(func.count()).select_from(Guide)) == 0
        assert await db.scalar(select(func.count()).select_from(GuideStop)) == 0


@pytest.mark.parametrize(
    "operation",
    [
        "UPDATE explore_guides SET title='changed'",
        "UPDATE explore_guides SET published_at=NULL",
        "DELETE FROM explore_guides",
        "UPDATE explore_stops SET answer='changed'",
        "DELETE FROM explore_stops",
        (
            "INSERT INTO explore_stops (id,guide_id,position,title,clue,answer,hint,reveal) "
            "SELECT gen_random_uuid(),id,4,'x','x','x','x','x' FROM explore_guides"
        ),
    ],
)
async def test_database_rejects_published_content_edits(database, spec, operation):
    async with database.begin() as db:
        await publish(db, spec)
    with pytest.raises(IntegrityError, match="immutable|cannot be deleted"):
        async with database.begin() as db:
            await db.execute(text(operation))


async def test_two_versions_keep_original_runs_and_three_stop_flow(client, database, spec):
    async with database.begin() as db:
        await publish(db, spec)
    first, headers = await start(client, spec.slug)
    reveal = (await post(client, first, headers, "answer", answer="closer")).json()["run"]
    newer = spec.model_dump()
    newer.update(slug="example-walk-v2", title="New version")
    newer["stops"][0]["answer"] = "different"
    newer["stops"][0]["reveal"] = "New story"
    async with database.begin() as db:
        await publish(db, GuideSpec.model_validate(newer))
    second, second_headers = await start(client, newer["slug"])
    assert first["id"] != second["id"] and first["stop"]["id"] != second["stop"]["id"]
    assert second["guide"]["slug"] == newer["slug"]
    assert not (await post(client, second, second_headers, "answer", answer="closer")).json()[
        "accepted"
    ]
    assert (await client.get(f"{ROOT}/runs/{first['id']}", headers=headers)).json() == reveal
    current = (await post(client, first, headers, "continue")).json()
    for position, answer in [(2, "3"), (3, "notice")]:
        assert current["stop"]["position"] == position
        accepted = await post(client, current, headers, "answer", answer=answer)
        assert accepted.json()["run"]["phase"] == "reveal"
        current = (await post(client, current, headers, "continue")).json()
    assert current["phase"] == "finished" and current["guide"]["slug"] == spec.slug
    assert (
        await client.get(f"{ROOT}/runs/{second['id']}", headers=second_headers)
    ).json() == second


async def test_unknown_unpublished_and_cross_version_start_retry(client, database, spec):
    async with database.begin() as db:
        draft = Guide(slug=spec.slug, title=spec.title, description=spec.description)
        db.add(draft)
        await db.flush()
        db.add_all(GuideStop(guide_id=draft.id, **stop.model_dump()) for stop in spec.stops)
    for slug in (spec.slug, "unknown-v1"):
        assert (await client.get(f"{ROOT}/guides/{slug}")).status_code == 404
        result = await client.post(
            f"{ROOT}/guides/{slug}/runs", json={"start_key": secrets.token_hex(32)}
        )
        assert result.status_code == 404
    async with database.begin() as db:
        assert await db.scalar(select(func.count()).select_from(ExploreRun)) == 0
        await publish(db, spec)  # Identical valid draft becomes published atomically.
        data = spec.model_dump() | {"slug": "another-v1"}
        await publish(db, GuideSpec.model_validate(data))
    key = secrets.token_hex(32)
    await start(client, spec.slug, key)
    response = await client.post(f"{ROOT}/guides/another-v1/runs", json={"start_key": key})
    assert response.status_code == 409
    public = await client.get(f"{ROOT}/guides/{spec.slug}")
    assert public.status_code == 200 and public.json()["stop_count"] == 3
    assert "answer" not in public.text and "reveal" not in public.text


async def test_migration_preserves_pre_publication_run_and_content(client, database, spec):
    async with database.begin() as db:
        await publish(db, spec)
    run, headers = await start(client, spec.slug)
    await post(client, run, headers, "hint")
    expected = (await post(client, run, headers, "answer", answer="closer")).json()["run"]
    await alembic("downgrade", "0005")
    # This row is created under the original, implicitly-public schema.
    async with database.begin() as db:
        await db.execute(
            text(
                "INSERT INTO explore_guides (id,created_at,slug,title,description) "
                "VALUES (gen_random_uuid(),now(),'old-draft-v1','Old','Previously public')"
            )
        )
    await alembic("upgrade", "head")
    await alembic("check")
    assert (await client.get(f"{ROOT}/runs/{run['id']}", headers=headers)).json() == expected
    async with database() as db:
        original = await db.get(ExploreRun, UUID(run["id"]))
        guide = await db.get(Guide, original.guide_id)
        assert guide.published_at == guide.created_at
        old = await db.scalar(select(Guide).where(Guide.slug == "old-draft-v1"))
        assert old.published_at is not None


async def test_cli_check_import_retry_conflict_and_redacted_errors(database, tmp_path, spec):
    async def cli(path, *args):
        process = await asyncio.create_subprocess_exec(
            sys.executable,
            "-m",
            "app.publish_guide",
            str(path),
            *args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        output, _ = await process.communicate()
        return process.returncode, output.decode()

    assert (await cli(EXAMPLE, "--check"))[0] == 0
    async with database() as db:
        assert await db.scalar(select(func.count()).select_from(Guide)) == 0
    assert (await cli(EXAMPLE))[0] == 0
    assert (await cli(EXAMPLE))[0] == 0
    changed = tmp_path / "changed.json"
    changed.write_text(json.dumps(spec.model_dump() | {"title": "Changed"}))
    code, output = await cli(changed)
    assert code == 2 and "new slug" in output
    data = spec.model_dump()
    data["stops"][0]["answer"] = "private-answer-" * 100
    changed.write_text(json.dumps(data))
    code, output = await cli(changed)
    assert code == 2 and "stops.0.answer" in output and "private-answer" not in output
    changed.write_text('{"slug":"first","slug":"second"}')
    assert (await cli(changed, "--check"))[0] == 2
    changed.write_bytes(json.dumps(spec.model_dump()).encode("utf-16"))
    assert (await cli(changed, "--check"))[0] == 2
