import { useCallback, useEffect, useRef, useState } from "react";
import { api, setToken } from "./api";
import { ApiError, ApiTransportError } from "./apiErrors";
import { canOpenLocationSettings, getInviteCode, openLocationSettings, requestLocation } from "./telegram";
import { changeTeam } from "./teamMutation";
import { checkInAge, checkInFeedback, startQuest } from "./questState";
import { ActionButton, AppHeader, BottomNav, ErrorNotice, QuestDetailHeader, type Screen } from "./components/ui";
import HomeScreen from "./screens/HomeScreen";
import TeamScreen from "./screens/TeamScreen";
import RanksScreen from "./screens/RanksScreen";
import { QuestsScreen } from "./screens/QuestsScreen";
import { CompleteScreen, QuestScreen } from "./screens/QuestScreens";
import { MotionDiagnostics } from "./components/MotionDiagnostics";
import type { Coordinates, Invite, Me, Member, Quest, Ranking, Run } from "./types";

const tg = window.Telegram?.WebApp;
const inviteCode = getInviteCode(location.search, tg?.initDataUnsafe?.start_param);
const sessionMessage = "Session expired. Reopen AYLOOR from the bot to sign in.";
const message = (error: unknown) => error instanceof Error ? error.message : "Something went wrong. Please retry.";

export default function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [screen, setScreen] = useState<Screen>("home");
  const [quests, setQuests] = useState<Quest[] | null>(null);
  const [questLoading, setQuestLoading] = useState(false);
  const [questError, setQuestError] = useState("");
  const [selected, setSelected] = useState<Quest | null>(null);
  const [ranking, setRanking] = useState<Ranking | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [invitation, setInvitation] = useState<Invite | null>(null);
  const [shareLink, setShareLink] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [checkInError, setCheckInError] = useState<{ questId: string; message: string } | null>(null);
  const [locationSettingsAvailable, setLocationSettingsAvailable] = useState(false);
  const [refreshError, setRefreshError] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  // An in-flight success from a previous session must never restore gameplay after 401.
  const sessionEpoch = useRef(0);
  const teamId = useRef<string | undefined>(undefined);
  const questRequest = useRef(0);
  const [loading, setLoading] = useState(true);
  const [development, setDevelopment] = useState(false);
  const [initData, setInitData] = useState("");
  const [awarded, setAwarded] = useState<number | null>(null);
  const [stage, setStage] = useState<"" | "location" | "verification">("");
  const [sample, setSample] = useState<{ questId: string; data: Coordinates; checkedAt: number } | null>(null);
  const [sampleNow, setSampleNow] = useState(Date.now);
  useEffect(() => {
    if (!sample) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    const tick = () => {
      const now = Date.now();
      setSampleNow(now);
      if (checkInAge(sample.checkedAt, now) == null) { setSample(null); setCheckInError(null); }
    };
    const visibility = () => {
      clearInterval(timer); timer = undefined;
      if (!document.hidden) { tick(); timer = setInterval(tick, 60_000); }
    };
    visibility();
    document.addEventListener("visibilitychange", visibility);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", visibility); };
  }, [sample]);
  useEffect(() => {
    const leave = () => setSample(null);
    window.addEventListener("pagehide", leave);
    return () => window.removeEventListener("pagehide", leave);
  }, []);
  const [coordinates, setCoordinates] = useState<Coordinates>({ latitude: 0, longitude: 0, horizontal_accuracy: 25 });

  const request = useCallback(async <T,>(path: string, body?: unknown): Promise<T> => {
    const epoch = sessionEpoch.current;
    let result: T;
    try { result = await api<T>(path, body); }
    catch (error) {
      if (path === "/auth/telegram" && error instanceof ApiError && error.status === 401)
        setError(`Telegram sign in failed: ${error.message}. Reopen AYLOOR from the bot.`);
      throw error;
    }
    if (epoch !== sessionEpoch.current) throw new Error(sessionMessage);
    return result;
  }, []);

  const action = useCallback(async (work: () => Promise<void>, checkInQuestId?: string) => {
    if (busyRef.current) return;
    const epoch = sessionEpoch.current;
    busyRef.current = true;
    setBusy(true);
    setError("");
    if (checkInQuestId) setCheckInError(null);
    try { await work(); }
    catch (e) {
      if (epoch === sessionEpoch.current) {
        const appLevel = e instanceof ApiError && (e.status === 401 || e.status === 403 || e.message === "Team must be active");
        if (checkInQuestId && !appLevel) setCheckInError({ questId: checkInQuestId, message: message(e) });
        else setError(message(e));
      }
    }
    finally { busyRef.current = false; setBusy(false); setStage(""); }
  }, []);

  const loadQuests = useCallback(async () => {
    const epoch = sessionEpoch.current;
    const id = ++questRequest.current;
    setQuestLoading(true);
    setQuestError("");
    try {
      const list = await request<Quest[]>("/quests");
      if (id === questRequest.current) setQuests(list);
    } catch (e) {
      if (epoch === sessionEpoch.current && id === questRequest.current) setQuestError(message(e));
    } finally {
      if (epoch === sessionEpoch.current && id === questRequest.current) setQuestLoading(false);
    }
  }, [request]);

  const refresh = useCallback(async () => {
    const epoch = sessionEpoch.current;
    const current = await request<Me>("/me");
    if (teamId.current !== current.team?.id) {
      if (teamId.current) setScreen("team");
      setCheckInError(null);
      setRanking(null); setMembers([]); setShareLink(""); setSelected(null); setSample(null);
    }
    teamId.current = current.team?.id;
    setMe(current);
    setRefreshError("");
    // Auxiliary data must not prevent /me from confirming membership.
    const [board, people] = await Promise.allSettled([
      request<Ranking>("/leaderboard"),
      current.team ? request<Member[]>(`/teams/${current.team.id}/members`) : Promise.resolve([] as Member[]),
    ]);
    if (epoch !== sessionEpoch.current || teamId.current !== current.team?.id) throw new Error(sessionMessage);
    if (board.status === "fulfilled") setRanking(board.value);
    if (people.status === "fulfilled") setMembers(people.value);
    const failures = [board, people].filter(result => result.status === "rejected");
    if (failures.length) setRefreshError("Team or leaderboard refresh failed. Previously loaded data may be out of date. Please retry.");
    return current;
  }, [request]);

  const authenticate = useCallback(async (raw: string) => {
    const result = await request<{ access_token: string }>("/auth/telegram", { init_data: raw });
    setToken(result.access_token);
    const current = await refresh();
    if (!current.team) setScreen("team");
    if (inviteCode && !current.team) setInvitation(await request<Invite>(`/invites/${inviteCode}`));
  }, [refresh, request]);

  const connect = useCallback(async () => {
    const config = await request<{ development_gps_enabled: boolean }>("/config");
    setDevelopment(import.meta.env.DEV && config.development_gps_enabled);
    if (tg?.initData) await authenticate(tg.initData);
    else if (sessionStorage.getItem("ayloor-token")) {
      const current = await refresh();
      if (!current.team) setScreen("team");
      if (inviteCode && !current.team) setInvitation(await request<Invite>(`/invites/${inviteCode}`));
    }
  }, [authenticate, refresh, request]);

  useEffect(() => {
    const expired = () => {
      sessionEpoch.current++;
      questRequest.current++;
      teamId.current = undefined;
      setMe(null); setQuests(null); setSelected(null); setRanking(null); setMembers([]);
      setInvitation(null); setShareLink(""); setSample(null); setAwarded(null);
      setCheckInError(null);
      setQuestError(""); setRefreshError(""); setQuestLoading(false); setScreen("home");
      setError(sessionMessage);
    };
    window.addEventListener("ayloor-session-expired", expired);
    tg?.ready(); tg?.expand();
    void action(async () => {
      try { await connect();
      } finally { setLoading(false); }
    });
    return () => window.removeEventListener("ayloor-session-expired", expired);
  }, [action, connect]);

  useEffect(() => {
    if (me) void loadQuests();
  // Home data loads independently; membership reconciliation never awaits it.
  }, [me?.user.id, me?.team?.id, loadQuests]);

  useEffect(() => {
    const update = () => setLocationSettingsAvailable(canOpenLocationSettings(tg));
    update();
    if (!tg?.onEvent || !tg.offEvent) return;
    tg.onEvent("locationManagerUpdated", update);
    return () => tg.offEvent?.("locationManagerUpdated", update);
  }, [checkInError]);

  useEffect(() => {
    if (me?.team?.status !== "pending") return;
    const id = window.setInterval(() => {
      if (!busyRef.current) void refresh().catch(e => setError(message(e)));
    }, 5000);
    return () => window.clearInterval(id);
  }, [me?.team?.id, me?.team?.status, refresh]);

  function navigate(next: Screen) {
    if (busyRef.current) return;
    setScreen(next);
    setError("");
    setCheckInError(null);
    window.scrollTo({ top: 0 });
    void action(async () => {
      await refresh();
      if (next === "home" || next === "quests") await loadQuests();
    });
  }

  async function updateTeam(mutate: () => Promise<unknown>, expectedTeamId?: string) {
    await changeTeam(mutate, refresh, expectedTeamId);
    setInvitation(null); setScreen("team");
  }

  function rememberQuest(quest: Quest) {
    setCheckInError(null);
    setSelected(quest);
    setQuests(list => list?.map(item => item.id === quest.id ? quest : item) ?? null);
  }

  async function openQuest(quest: Quest) {
    const detail = await request<Quest>(`/quests/${quest.id}`);
    setSample(null); // A reopened quest must not present an old fix as current.
    rememberQuest(detail);
    setScreen("quest"); window.scrollTo({ top: 0 });
  }

  async function play(quest: Quest) {
    const detail = await request<Quest>(`/quests/${quest.id}`);
    setSample(null);
    if (detail.run) { rememberQuest(detail); setScreen("quest"); return; }
    const run = await startQuest(
      () => request<Run>(`/quests/${detail.id}/start`, {}),
      () => request<Quest>(`/quests/${detail.id}`),
    );
    rememberQuest({ ...detail, run }); setScreen("quest"); window.scrollTo({ top: 0 });
  }

  function confirmed(quest: Quest, amount: number | null) {
    rememberQuest(quest); setAwarded(amount); setStage(""); setScreen("complete");
    window.scrollTo({ top: 0 });
    // Completion is already confirmed. These read failures never undo it.
    void refresh().catch(e => setRefreshError(message(e)));
    void loadQuests();
  }

  async function complete(data: Coordinates) {
    if (!selected?.run) return;
    setStage("verification");
    try {
      const result = await request<{ run: Run; awarded_xp: number }>(`/quest-runs/${selected.run.id}/check-in`, data);
      confirmed({ ...selected, run: result.run }, result.awarded_xp);
    } catch (e) {
      if (!(e instanceof ApiTransportError)) throw e;
      let detail: Quest;
      try { detail = await request<Quest>(`/quests/${selected.id}`); } catch { throw e; }
      if (detail.run?.status !== "completed") throw e;
      confirmed(detail, null);
    }
  }

  async function checkIn() {
    if (!selected) return;
    const epoch = sessionEpoch.current;
    setSample(null);
    setStage("location");
    const data = await requestLocation(tg, import.meta.env.DEV && development);
    if (epoch !== sessionEpoch.current) throw new Error(sessionMessage);
    setSample({ questId: selected.id, data, checkedAt: Date.now() });
    await complete(data);
  }

  async function invite() {
    if (!me?.team) return;
    const result = await request<Invite>(`/teams/${me.team.id}/invites`, {});
    if (!result.link) throw new Error("Invite links are not configured. Please contact the game organizer.");
    setShareLink(result.link);
    tg?.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(result.link)}&text=${encodeURIComponent(`Join ${me.team.name} on AYLOOR. The city is your game.`)}`);
  }

  function locationSettings() {
    if (!selected || busyRef.current) return;
    if (!openLocationSettings(tg)) {
      setCheckInError({ questId: selected.id, message: "Location settings could not be opened in this Telegram client. Check location permissions manually, then press CHECK IN again." });
    }
  }

  const runAction = (work: () => Promise<void>) => { void action(work); };
  const team = me?.team;
  const focused = me && ((selected && (screen === "quest" || screen === "complete")) || (team && screen === "team"));
  const detailScreen = !!(me && selected && screen === "quest");
  const header = <AppHeader busy={busy} showTicker={screen === "home" || screen === "quests"} home={() => me ? navigate("home") : setScreen("home")} />;
  const feedback = selected && checkInError?.questId === selected.id ? checkInFeedback(checkInError.message) : null;
  return <main className={`app${screen === "home" ? " home-page" : ""}${detailScreen ? " quest-detail-screen" : ""}${focused ? " focused-screen" : ""}${screen === "quest" && feedback ? " result-screen" : ""}${me && selected && screen === "complete" ? " reward-screen" : ""}`}>
    {me && selected && screen === "complete" && <div className="reward-halftone" aria-hidden="true" />}
    {!detailScreen && header}
    {error && <ErrorNotice dismiss={() => setError("")}>{error}</ErrorNotice>}
    {me && refreshError && <ErrorNotice>{refreshError}<ActionButton secondary disabled={busy} onClick={() => runAction(async () => { await refresh(); })}>RETRY REFRESH</ActionButton></ErrorNotice>}
    {loading ? <section><p className="eyebrow">CONNECTING</p><h1>The city is<br />your game.</h1><p role="status">Opening AYLOOR…</p></section>
      : !me ? <section><p className="eyebrow">PLAY THE REAL WORLD.</p><h1>The city is<br />your game.</h1><p>Open AYLOOR from the Telegram bot to sign in.</p>
        <ActionButton disabled={busy} secondary onClick={() => runAction(connect)}>RETRY TELEGRAM SIGN IN</ActionButton>
        {import.meta.env.DEV && development && <details><summary>Development sign in</summary><label>Signed Telegram initData<textarea value={initData} onChange={e => setInitData(e.target.value)} /></label><ActionButton disabled={busy || !initData} onClick={() => runAction(() => authenticate(initData))}>SIGN IN</ActionButton></details>}
      </section>
      : <>
        {screen === "team" ? <TeamScreen team={team ?? null} members={members} invitation={invitation} name={name} setName={setName} busy={busy} shareLink={shareLink}
          userId={me.user.id} cancelInvite={() => setInvitation(null)} quests={() => navigate("quests")}
          create={() => runAction(() => updateTeam(() => request("/teams", { name })))}
          join={() => invitation && runAction(() => updateTeam(() => request(`/invites/${invitation.code}/join`, {}), invitation.team.id))}
          invite={() => runAction(invite)} copy={() => runAction(async () => { await navigator.clipboard.writeText(shareLink); })} refresh={() => runAction(async () => { await refresh(); })} />
          : screen === "home" ? <HomeScreen me={me} quests={quests} ranking={ranking} busy={busy} questLoading={questLoading} questError={questError} reload={() => runAction(loadQuests)} play={quest => runAction(() => play(quest))} team={() => navigate("team")} ranks={() => navigate("leaderboard")} />
          : screen === "quests" ? <><QuestsScreen quests={quests} busy={busy} team={team ?? null} seasonName={me.season?.name ?? null} seasonXp={ranking?.current_user_team_xp ?? null} teamScreen={() => navigate("team")} open={quest => runAction(() => openQuest(quest))} />{questError && <ErrorNotice>{questError}<ActionButton secondary disabled={busy} onClick={() => runAction(loadQuests)}>RETRY QUESTS</ActionButton></ErrorNotice>}</>
          : screen === "quest" && selected ? <QuestScreen header={<QuestDetailHeader busy={busy} back={() => navigate("quests")} home={() => navigate("home")} />} quest={selected} questCount={quests?.length ?? 0} team={team} teamActive={team?.status === "active"} busy={busy} stage={stage} sample={sample} sampleAge={sample ? checkInAge(sample.checkedAt, sampleNow) : null} development={import.meta.env.DEV && development} coordinates={coordinates} setCoordinates={setCoordinates}
            feedback={feedback} dismiss={() => { if (!busyRef.current) setCheckInError(null); }}
            start={() => runAction(() => play(selected))} checkIn={() => { void action(checkIn, selected.id); }} devCheckIn={() => { void action(async () => { setSample(null); await complete(coordinates); }, selected.id); }}
            settings={feedback?.locationAccessIssue && locationSettingsAvailable ? locationSettings : undefined} back={() => navigate("quests")} />
          : screen === "complete" && selected && team ? <CompleteScreen cityName={me.city.name} quest={selected} awarded={awarded} team={team} ranking={ranking} busy={busy} ranks={() => navigate("leaderboard")} crew={() => navigate("team")} />
          : screen === "leaderboard" ? <RanksScreen ranking={ranking} teamId={team?.id} busy={busy} refresh={() => runAction(async () => { await refresh(); })} /> : null}
        {!detailScreen && <BottomNav screen={screen} busy={busy} navigate={navigate} />}
      </>}
    <footer>AYLOOR · PLAY THE REAL WORLD.</footer>
    {import.meta.env.DEV && new URLSearchParams(location.search).get("motion_debug") === "1" && <MotionDiagnostics />}
  </main>;
}
