import { useCallback, useEffect, useRef, useState } from "react";
import { api, setToken } from "./api";
import { getInviteCode, requestLocation } from "./telegram";
import { changeTeam } from "./teamMutation";
import type {
  Coordinates,
  Invite,
  Me,
  Member,
  Quest,
  Ranking,
  Run,
} from "./types";

type Screen = "home" | "team" | "quests" | "quest" | "leaderboard" | "complete";
const tg = window.Telegram?.WebApp;
const inviteCode = getInviteCode(
  location.search,
  tg?.initDataUnsafe?.start_param,
);

export default function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [screen, setScreen] = useState<Screen>("home");
  const [quests, setQuests] = useState<Quest[]>([]);
  const [selected, setSelected] = useState<Quest | null>(null);
  const [ranking, setRanking] = useState<Ranking | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [invitation, setInvitation] = useState<Invite | null>(null);
  const [shareLink, setShareLink] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [development, setDevelopment] = useState(false);
  const [initData, setInitData] = useState("");
  const [awarded, setAwarded] = useState(0);
  const [coordinates, setCoordinates] = useState<Coordinates>({
    latitude: 0,
    longitude: 0,
    horizontal_accuracy: 25,
  });

  const action = useCallback(async (work: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Something went wrong. Please retry.",
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    const current = await api<Me>("/me");
    setMe(current);
    if (current.team) {
      const [board, people] = await Promise.all([
        api<Ranking>("/leaderboard"),
        api<Member[]>(`/teams/${current.team.id}/members`),
      ]);
      setRanking(board);
      setMembers(people);
    } else {
      setRanking(null);
      setMembers([]);
    }
    return current;
  }, []);

  const authenticate = useCallback(
    async (raw: string) => {
      const result = await api<{ access_token: string }>("/auth/telegram", {
        init_data: raw,
      });
      setToken(result.access_token);
      const current = await refresh();
      if (inviteCode && !current.team)
        setInvitation(await api<Invite>(`/invites/${inviteCode}`));
    },
    [refresh],
  );

  useEffect(() => {
    tg?.ready();
    tg?.expand();
    void action(async () => {
      try {
        const config = await api<{ development_gps_enabled: boolean }>(
          "/config",
        );
        setDevelopment(import.meta.env.DEV && config.development_gps_enabled);
        if (tg?.initData) await authenticate(tg.initData);
        else if (sessionStorage.getItem("ayloor-token")) {
          const current = await refresh();
          if (inviteCode && !current.team)
            setInvitation(await api<Invite>(`/invites/${inviteCode}`));
        }
      } finally {
        setLoading(false);
      }
    });
    const expired = () => {
      setMe(null);
      setError("Session expired. Reopen AYLOOR from the bot to sign in.");
    };
    window.addEventListener("ayloor-session-expired", expired);
    return () => window.removeEventListener("ayloor-session-expired", expired);
  }, [action, authenticate, refresh]);

  useEffect(() => {
    if (!me?.team || me.team.status !== "pending") return;
    const id = window.setInterval(() => {
      if (!busyRef.current) void refresh().catch((e) => setError(String(e)));
    }, 5000);
    return () => window.clearInterval(id);
  }, [me?.team?.id, me?.team?.status, refresh]);

  async function openQuests() {
    setQuests(await api<Quest[]>("/quests"));
    setScreen("quests");
  }

  async function updateTeam(
    mutate: () => Promise<unknown>,
    expectedTeamId?: string,
  ) {
    await changeTeam(
      mutate,
      async () => {
        const current = await refresh();
        if (current.team) setScreen("team");
        return current;
      },
      expectedTeamId,
    );
    setInvitation(null);
  }

  async function complete(data: Coordinates) {
    if (!selected?.run) return;
    const result = await api<{ run: Run; awarded_xp: number }>(
      `/quest-runs/${selected.run.id}/check-in`,
      data,
    );
    setSelected({ ...selected, run: result.run });
    setAwarded(result.awarded_xp);
    await refresh();
    setScreen("complete");
  }

  const team = me?.team;
  return (
    <main>
      <header>
        <a
          href="#"
          onClick={(event) => {
            event.preventDefault();
            setScreen("home");
          }}
        >
          AYLOOR<span>●</span>
        </a>
        <small>
          YEREVAN
          <br />
          SEASON ZERO
        </small>
      </header>
      {error && (
        <div role="alert" className="error">
          {error}
          <button
            className="quiet"
            onClick={() => setError("")}
            aria-label="Dismiss error"
          >
            ×
          </button>
        </div>
      )}
      {loading ? (
        <section>
          <p className="eyebrow">CONNECTING</p>
          <h1>
            The city is
            <br />
            your game.
          </h1>
          <p>Opening AYLOOR…</p>
        </section>
      ) : !me ? (
        <section>
          <p className="eyebrow">PLAY THE REAL WORLD.</p>
          <h1>
            The city is
            <br />
            your game.
          </h1>
          <p>Open AYLOOR from the Telegram bot to sign in.</p>
          <button
            disabled={busy || !tg?.initData}
            onClick={() =>
              void action(async () => {
                await authenticate(tg!.initData);
              })
            }
          >
            RETRY TELEGRAM SIGN IN
          </button>
          {import.meta.env.DEV && development && (
            <details>
              <summary>Development sign in</summary>
              <label>
                Signed Telegram initData
                <textarea
                  value={initData}
                  onChange={(e) => setInitData(e.target.value)}
                />
              </label>
              <button
                disabled={busy || !initData}
                onClick={() =>
                  void action(async () => {
                    await authenticate(initData);
                  })
                }
              >
                SIGN IN
              </button>
            </details>
          )}
        </section>
      ) : !team ? (
        <section>
          <p className="eyebrow">PLAY THE REAL WORLD.</p>
          <h1>
            The city is
            <br />
            your game.
          </h1>
          <p>Find your people. Take on Yerevan together.</p>
          {invitation && (
            <article>
              <p className="eyebrow">YOU'RE INVITED</p>
              <h2>{invitation.team.name}</h2>
              <p>{invitation.team.member_count} / 5 members</p>
              <button
                disabled={busy}
                onClick={() =>
                  void action(async () => {
                    await updateTeam(
                      () => api(`/invites/${invitation.code}/join`, {}),
                      invitation.team.id,
                    );
                  })
                }
              >
                JOIN TEAM
              </button>
            </article>
          )}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void action(async () => {
                await updateTeam(() => api("/teams", { name }));
              });
            }}
          >
            <label>
              Team name
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={80}
                placeholder="Kentron Mafia"
                required
              />
            </label>
            <button disabled={busy || !name.trim()}>CREATE TEAM</button>
          </form>
        </section>
      ) : (
        <>
          {team.status === "pending" || screen === "team" ? (
            <section>
              <p className="eyebrow">YOUR TEAM</p>
              <h1>{team.name}</h1>
              <div className="stat">
                <strong>
                  {team.member_count}
                  <span> / 5</span>
                </strong>
                <p>
                  {team.status === "pending"
                    ? "Waiting for teammates"
                    : "TEAM ACTIVE"}
                </p>
              </div>
              <ul className="members">
                {members.map((member) => (
                  <li key={member.user.id}>
                    {member.user.first_name || member.user.username || "Player"}
                    <small>{member.role}</small>
                  </li>
                ))}
              </ul>
              {team.member_count < 5 && (
                <button
                  disabled={busy}
                  onClick={() =>
                    void action(async () => {
                      const invite = await api<Invite>(
                        `/teams/${team.id}/invites`,
                        {},
                      );
                      if (!invite.link)
                        throw new Error(
                          "Invite links are not configured. Set TELEGRAM_BOT_USERNAME on the backend.",
                        );
                      setShareLink(invite.link);
                      tg?.openTelegramLink(
                        `https://t.me/share/url?url=${encodeURIComponent(invite.link)}&text=${encodeURIComponent(`Join ${team.name} on AYLOOR. The city is your game.`)}`,
                      );
                    })
                  }
                >
                  INVITE FRIENDS
                </button>
              )}
              {shareLink && (
                <div>
                  <label htmlFor="invite-link">Invite link</label>
                  <input
                    id="invite-link"
                    readOnly
                    value={shareLink}
                    onFocus={(e) => e.target.select()}
                  />
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() =>
                      void action(async () => {
                        await navigator.clipboard.writeText(shareLink);
                      })
                    }
                  >
                    COPY LINK
                  </button>
                </div>
              )}
              <button
                className="secondary"
                disabled={busy}
                onClick={() =>
                  void action(async () => {
                    await refresh();
                  })
                }
              >
                REFRESH TEAM
              </button>
            </section>
          ) : screen === "home" ? (
            <section>
              <p className="eyebrow">TEAM ACTIVE · SEASON ZERO</p>
              <h1>{team.name}</h1>
              <div className="score">
                <strong>
                  {ranking?.current_user_team_xp ?? 0}
                  <span> XP</span>
                </strong>
                <p>#{ranking?.current_user_team_rank ?? "—"} YEREVAN</p>
              </div>
              <p>
                The city is your game.
                <br />
                Your first checkpoint is waiting.
              </p>
              <button disabled={busy} onClick={() => void action(openQuests)}>
                QUESTS →
              </button>
              <button
                className="secondary"
                disabled={busy}
                onClick={() =>
                  void action(async () => {
                    await refresh();
                    setScreen("leaderboard");
                  })
                }
              >
                LEADERBOARD
              </button>
            </section>
          ) : screen === "quests" ? (
            <section>
              <p className="eyebrow">EXPLORE YEREVAN</p>
              <h1>Quests</h1>
              {!quests.length && <p>No quests are available right now.</p>}
              {quests.map((quest) => (
                <article key={quest.id}>
                  <span className="reward">+{quest.base_xp} XP</span>
                  <h2>{quest.title}</h2>
                  <p>{quest.description}</p>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() =>
                      void action(async () => {
                        setSelected(await api<Quest>(`/quests/${quest.id}`));
                        setScreen("quest");
                      })
                    }
                  >
                    {quest.run?.status === "completed"
                      ? "COMPLETED ✓"
                      : "OPEN →"}
                  </button>
                </article>
              ))}
            </section>
          ) : screen === "quest" && selected ? (
            <section>
              <p className="eyebrow">
                {selected.run?.status === "started"
                  ? "QUEST ACTIVE"
                  : "CITY CHECKPOINT"}
              </p>
              <h1>{selected.title}</h1>
              <p>{selected.description}</p>
              <div className="score">
                <strong>
                  +{selected.base_xp}
                  <span> XP</span>
                </strong>
              </div>
              <p>
                Checkpoint: {selected.latitude?.toFixed(5)},{" "}
                {selected.longitude?.toFixed(5)}
                <br />
                Check in within {selected.radius_m} m.
              </p>
              {selected.run?.status === "completed" ? (
                <p className="success">COMPLETED ✓</p>
              ) : selected.run?.status === "failed" ? (
                <p>This quest run is closed.</p>
              ) : !selected.run ? (
                <button
                  disabled={busy}
                  onClick={() =>
                    void action(async () => {
                      const run = await api<Run>(
                        `/quests/${selected.id}/start`,
                        {},
                      );
                      setSelected({ ...selected, run });
                    })
                  }
                >
                  START QUEST
                </button>
              ) : (
                <>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void action(async () => {
                        await complete(
                          await requestLocation(
                            tg,
                            import.meta.env.DEV && development,
                          ),
                        );
                      })
                    }
                  >
                    {busy ? "CHECKING…" : "CHECK IN"}
                  </button>
                  <p className="hint">
                    Location is requested only when you check in. Stay on public
                    paths and cross roads safely.
                  </p>
                  {tg?.LocationManager && tg.isVersionAtLeast("8.0") && (
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() => tg.LocationManager?.openSettings()}
                    >
                      LOCATION SETTINGS
                    </button>
                  )}
                  {import.meta.env.DEV && development && (
                    <details>
                      <summary>Development coordinates</summary>
                      <p>
                        Placeholder: 0, 0. Server verification remains enabled.
                      </p>
                      {(
                        [
                          "latitude",
                          "longitude",
                          "horizontal_accuracy",
                        ] as const
                      ).map((key) => (
                        <label key={key}>
                          {key}
                          <input
                            type="number"
                            step="any"
                            value={coordinates[key]}
                            onChange={(e) =>
                              setCoordinates({
                                ...coordinates,
                                [key]: Number(e.target.value),
                              })
                            }
                          />
                        </label>
                      ))}
                      <button
                        disabled={busy}
                        onClick={() =>
                          void action(async () => {
                            await complete(coordinates);
                          })
                        }
                      >
                        CHECK IN WITH DEV COORDINATES
                      </button>
                    </details>
                  )}
                </>
              )}
            </section>
          ) : screen === "complete" ? (
            <section>
              <p className="eyebrow">QUEST COMPLETE</p>
              <h1>
                City explored.
                <br />
                XP earned.
              </h1>
              <div className="score">
                <strong>
                  +{awarded}
                  <span> XP</span>
                </strong>
              </div>
              {awarded === 0 && (
                <p>This quest was already completed. Your XP is safe.</p>
              )}
              <p>
                {team.name}
                <br />#{ranking?.current_user_team_rank ?? "—"} YEREVAN
              </p>
              <button
                disabled={busy}
                onClick={() =>
                  void action(async () => {
                    await refresh();
                    setScreen("leaderboard");
                  })
                }
              >
                VIEW LEADERBOARD
              </button>
            </section>
          ) : screen === "leaderboard" ? (
            <section>
              <p className="eyebrow">AYLOOR YEREVAN · SEASON ZERO</p>
              <h1>Leaderboard</h1>
              {ranking?.xp_to_next_rank != null && (
                <p>
                  {ranking.xp_to_next_rank} XP to #
                  {(ranking.current_user_team_rank ?? 2) - 1}
                </p>
              )}
              <ol className="ranking">
                {ranking?.entries.map((entry) => (
                  <li
                    key={entry.team_id}
                    className={entry.team_id === team.id ? "own" : ""}
                  >
                    <span className="rank">{entry.rank}</span>
                    <span>{entry.team_name}</span>
                    <strong>
                      {entry.xp}
                      <small> XP</small>
                    </strong>
                  </li>
                ))}
              </ol>
              <button
                className="secondary"
                disabled={busy}
                onClick={() =>
                  void action(async () => {
                    await refresh();
                  })
                }
              >
                REFRESH
              </button>
            </section>
          ) : null}
          {team.status === "active" && (
            <nav aria-label="Main navigation">
              <button
                aria-current={screen === "home" ? "page" : undefined}
                disabled={busy}
                onClick={() =>
                  void action(async () => {
                    await refresh();
                    setScreen("home");
                  })
                }
              >
                HOME
              </button>
              <button
                aria-current={
                  ["quests", "quest"].includes(screen) ? "page" : undefined
                }
                disabled={busy}
                onClick={() => void action(openQuests)}
              >
                QUESTS
              </button>
              <button
                aria-current={screen === "leaderboard" ? "page" : undefined}
                disabled={busy}
                onClick={() =>
                  void action(async () => {
                    await refresh();
                    setScreen("leaderboard");
                  })
                }
              >
                RANKS
              </button>
              <button
                aria-current={screen === "team" ? "page" : undefined}
                disabled={busy}
                onClick={() =>
                  void action(async () => {
                    await refresh();
                    setScreen("team");
                  })
                }
              >
                TEAM
              </button>
            </nav>
          )}
        </>
      )}
      <footer>AYLOOR · PLAY THE REAL WORLD.</footer>
    </main>
  );
}
