import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { QuestTitle } from "../components/QuestTitle";
import { QuestContent } from "../components/QuestContent";
import { CheckInScan } from "../components/CheckInScan";
import { zoneFix } from "../components/QuestZoneMap";
import { ActionButton, ArrowIcon } from "../components/ui";
import { formatCheckInDistance, mapsLink, outsideZoneMeters, type CheckInFeedback } from "../questState";
import type { Coordinates, Quest, Ranking, Team } from "../types";

export function QuestScreen({ header, fieldStatus, fieldAnswer, quest, questCount = 0, team, teamActive, busy, stage, feedback, sample, sampleAge = "JUST NOW", development, coordinates, setCoordinates, start, checkIn, devCheckIn, settings, dismiss, back }: {
  header?: ReactNode;
  fieldStatus?: ReactNode;
  fieldAnswer?: ReactNode;
  team?: Team | null;
  questCount?: number;
  quest: Quest; teamActive: boolean; busy: boolean; stage: "" | "location" | "verification";
  feedback: CheckInFeedback | null;
  sampleAge?: string | null;
  sample: { questId: string; data: Coordinates } | null; development: boolean; coordinates: Coordinates;
  setCoordinates: (data: Coordinates) => void; start: () => void; checkIn: () => void; devCheckIn: () => void;
  dismiss?: () => void; settings?: () => void; back: () => void;
}) {
  const done = quest.run?.status === "completed";
  const failed = quest.run?.status === "failed" || !!quest.locked;
  const active = quest.run?.status === "started";
  const awaitingAnswer = !!quest.field_test_step && !!quest.run?.gps_verified_at;
  const questSample = active && sampleAge && sample?.questId === quest.id ? sample.data : null;
  const fix = questSample ? zoneFix(quest, questSample) : null;
  const outside = feedback?.title === "OUTSIDE CHECK-IN ZONE";
  const farOutside = outside && !!fix?.far;
  const maps = mapsLink(quest);
  const detail = useRef<HTMLDivElement>(null);
  const dock = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const root = detail.current, bar = root?.querySelector<HTMLElement>(":scope > .quest-dock");
    if (!root) return;
    // Measured dock height already includes its safe-area padding.
    const measure = () => root.style.setProperty("--quest-cta-height", `${bar?.getBoundingClientRect().height ?? 0}px`);
    measure();
    const observer = new ResizeObserver(measure);
    if (bar) observer.observe(bar, { box: "border-box" });
    return () => observer.disconnect();
  }, [active, done, failed, teamActive, awaitingAnswer]);
  useEffect(() => {
    if (!feedback || busy || stage || failed || done || !active || awaitingAnswer) return;
    const background = Array.from(document.querySelectorAll<HTMLElement>(".quest-scroll, .brand, .app > nav"));
    background.forEach(el => { el.inert = true; });
    dialog.current?.querySelector<HTMLButtonElement>(".result-close")?.focus({ preventScroll: true });
    // Re-align after dock/map resize as well as the first result frame. The dock
    // observer updates scroll-padding before this scheduled geometry read.
    const scroll = detail.current?.querySelector<HTMLElement>(".quest-scroll");
    const content = scroll?.querySelector<HTMLElement>(".quest-content");
    let frame = 0;
    const reveal = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (scroll && content) scroll.scrollTop += content.getBoundingClientRect().top - scroll.getBoundingClientRect().top - 12;
      });
    };
    const observer = new ResizeObserver(reveal);
    for (const el of [scroll, content, dock.current]) if (el) observer.observe(el, { box: "border-box" });
    reveal();
    return () => { cancelAnimationFrame(frame); observer.disconnect(); background.forEach(el => { el.inert = false; }); };
  }, [feedback?.title, feedback?.description, busy, stage, questCount, failed, done, active, awaitingAnswer]);
  function closeResult() {
    if (busy || stage || !dismiss) return;
    dismiss();
    requestAnimationFrame(() => dock.current?.querySelector<HTMLButtonElement>(".action")?.focus({ preventScroll: true }));
  }
  function dialogKey(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!feedback || busy || stage) return;
    if (event.key === "Escape") { event.preventDefault(); closeResult(); }
    if (event.key !== "Tab") return;
    const targets = Array.from(dialog.current?.querySelectorAll<HTMLElement>("button:not(:disabled), a[href]") ?? []);
    const first = targets[0], last = targets[targets.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
  return <div ref={detail} className={`focused-view quest-detail${done ? " quest-record" : !failed ? " compact-quest-hero" : ""}${feedback && active ? " has-result" : ""}`} role={done ? "region" : undefined} aria-label={done ? "Quest completion" : undefined}>
    <div className="quest-scroll">
      {header}
      {fieldStatus}
      <section className="quest-heading">
        {!header && <button className="back quest-back" onClick={back} disabled={busy}><ArrowIcon direction="left" />ALL QUESTS</button>}
        <p className={`eyebrow quest-state${active ? " active" : done ? " confirmed" : ""}`}>{active && !stage && !failed && <span className="quest-live-beacon" aria-hidden="true"><span className="status-dot" /><span className="quest-idle-ring" /></span>}{done ? "QUEST COMPLETE ✓" : quest.locked ? "LOCKED / UP NEXT" : active ? "QUEST ACTIVE" : "LOCATION QUEST"}</p>
        <QuestTitle key={quest.id} title={quest.title} />
        <p className="quest-facts"><span>TEAM QUEST</span><span>{quest.radius_m != null ? `${quest.radius_m} M RADIUS` : "CHECKPOINT NOT CONFIGURED"}</span><span className="quest-reward">+{quest.base_xp} XP</span></p>
      </section>
      <QuestContent key={quest.id} quest={quest} sample={questSample} sampleAge={sampleAge} revealMap={!!feedback && !!fix} />
      {!done && !failed && <ol className="quest-check-in-steps" aria-label="How to complete this quest">
        <li><strong>01</strong><span>REACH THE<br />ZONE</span></li>
        <li><strong>02</strong><span>{active ? "TAP CHECK IN" : "START QUEST"}</span></li>
        <li><strong>03</strong><span>{quest.field_test_step ? <>ENTER CODE FOR<br />+{quest.base_xp} XP</> : active ? <>TEAM EARNS<br />+{quest.base_xp} XP</> : <>CHECK IN FOR<br />+{quest.base_xp} XP</>}</span></li>
      </ol>}
      {team && <div className={`quest-crew-card ${team.status}`}><span className={`status-dot ${team.status}`} aria-hidden="true" /><div><strong>{team.name} · {team.member_count} / 5</strong><span>{done ? "CHECKPOINT CLAIMED BY YOUR TEAM" : teamActive ? "ANY TEAMMATE CAN CHECK IN" : "GATHER AT LEAST TWO TEAMMATES"}</span></div></div>}
      {fieldAnswer}
      <section className="quest-description">
        <div className="quest-briefing"><p className="eyebrow">BRIEFING</p><p>{quest.description}</p><p className="quest-safety"><span aria-hidden="true">!</span>Walk, don’t rush. Use crossings and public paths.</p></div>
        {done ? <p className="hint">Completion confirmed · read-only.</p>
          : failed ? <p>{quest.locked ? "Complete the previous quest first. Expired runs cannot continue." : "This quest run is closed."}</p>
          : !teamActive ? <p>Gather at least two teammates to start a quest.</p> : null}
        {active && !failed && !awaitingAnswer && teamActive && import.meta.env.DEV && development && <details><summary>Development coordinates</summary><p>Development input only. Server radius and accuracy verification remains enabled.</p>{(["latitude", "longitude", "horizontal_accuracy"] as const).map(key => <label key={key}>{key}<input type="number" step="any" value={coordinates[key]} onChange={e => setCoordinates({ ...coordinates, [key]: Number(e.target.value) })} /></label>)}<ActionButton disabled={busy} onClick={devCheckIn}>CHECK IN WITH DEV COORDINATES</ActionButton></details>}
      </section>
    </div>
    {done ? <div className="quest-dock completed-actions"><ActionButton secondary arrow={false} disabled={busy} onClick={back}>BACK TO QUESTS</ActionButton></div>
      : !failed && teamActive && !quest.run ? <div className="quest-dock unstarted-actions"><ActionButton disabled={busy} onClick={start}>START QUEST</ActionButton><p className="hint">Location is requested only when you check in.</p></div>
      : !failed && teamActive && active && awaitingAnswer ? <div className="quest-dock"><p className="hint">GPS verified by server. Enter your test code above.</p><ActionButton secondary onClick={back} disabled={busy}>BACK TO QUESTS</ActionButton></div>
      : !failed && teamActive && active ? <div ref={dock} className={`quest-dock check-in-action${feedback ? " has-feedback" : ""}`} role="region" aria-label="Quest check-in">
        <div ref={dialog} className="check-in-dialog" role={feedback ? "dialog" : undefined} aria-modal={feedback ? true : undefined} aria-label={feedback ? "Check-in result" : undefined} onKeyDown={dialogKey}>
        {feedback && <div className="check-in-feedback">{questCount > 1 && <p className="result-quest-context">{quest.title} · +{quest.base_xp} XP</p>}<div className={`result-message${farOutside ? " is-far" : ""}`} role="alert" aria-live="polite">{dismiss && !busy && !stage && <button type="button" className="result-close" aria-label="Close check-in result" onClick={closeResult}>×</button>}<strong>{farOutside ? "FAR FROM THE CHECKPOINT." : outside ? "NOT THERE YET." : `${feedback.title}.`}</strong><p>{farOutside ? `Your location was about ${formatCheckInDistance(fix!.distance).toLowerCase()} away. Open the map to find your way.` : outside && fix ? `You’re about ${formatCheckInDistance(outsideZoneMeters(fix.distance, quest.radius_m!), true).toLowerCase()} outside the check-in zone. Walk closer and try again.` : feedback.description}</p></div>{fix && <div className="result-metrics">{outside && fix.outside > 0 && <div className="outside-distance"><strong>{formatCheckInDistance(fix.distance)}</strong><span>FROM CHECKPOINT</span></div>}<div role="group" aria-label="GPS accuracy from last explicit check-in sample"><strong>±{formatCheckInDistance(fix.accuracy, true)}</strong><span>GPS SAMPLE</span></div></div>}</div>}
        {stage && <CheckInScan stage={stage} />}
        {settings && <ActionButton disabled={busy} onClick={settings}>LOCATION SETTINGS</ActionButton>}
        {farOutside && maps && <a className="action" href={maps} target="_blank" rel="noopener noreferrer"><span>OPEN IN MAPS</span><ArrowIcon direction="right" /></a>}
        <ActionButton arrow={!farOutside} secondary={!!settings || farOutside} disabled={busy} onClick={checkIn}>{stage === "location" ? "GETTING LOCATION…" : stage === "verification" ? "VERIFYING CHECKPOINT…" : feedback ? "TRY AGAIN" : "CHECK IN"}</ActionButton>
        {feedback && fix && <p className="hint last-check-in">Last check-in only · {sampleAge?.toLowerCase()} · Not a live position.</p>}
        {feedback?.locationAccessIssue && !settings && <p className="hint">Location settings cannot be opened from this client. Check Telegram/device location permissions manually or update Telegram, then press CHECK IN again.</p>}
        {!feedback && !fix && <p className="hint">Location is requested only when you tap CHECK IN.</p>}
        </div>
      </div> : null}
  </div>;
}

export function CompleteScreen({ quest, awarded, team, ranking, busy, ranks, crew, cityName, fieldStatus, next }: { quest: Quest; awarded: number | null; team: Team; ranking: Ranking | null; busy: boolean; ranks: () => void; crew: () => void; cityName: string; fieldStatus?: ReactNode; next?: () => void }) {
  return <div className="focused-view quest-complete-view">
    <div className="reward-backdrop" aria-hidden="true"><div className="reward-sunburst"><div className="reward-sunburst-rays" /></div></div>
    <section className="quest-scroll completion">
      <p className="eyebrow confirmed">CHECKPOINT CLAIMED</p>
      <div className="completion-heading"><h1>Quest<br />complete.</h1><div className="completion-check" aria-hidden="true"><svg viewBox="0 0 64 64" focusable="false"><path d="m15 32 12 12 24-27" /></svg></div></div>
      <div className="completion-reward">
        {awarded != null && awarded > 0 ? <div className="xp">+{awarded}<span>XP</span></div> : <p className="success">{awarded === 0 ? "This quest was already completed. No new XP was awarded." : "Completion confirmed by the server. Your season score will refresh separately."}</p>}
      </div>
      <p className="completion-quest-title">{quest.title}</p>
      {fieldStatus}
      <div className="completion-team"><div className="completion-crew"><span className="eyebrow">YOUR TEAM</span><strong>{team.name}</strong><span>{ranking?.current_user_team_xp ?? "—"} XP THIS SEASON</span></div><div className="completion-rank">{ranking?.current_user_team_rank != null ? <><strong>#{ranking.current_user_team_rank}</strong><span>{cityName}</span></> : <><strong>—</strong><span>Rank unavailable</span></>}</div></div>
    </section>
    <div className="quest-dock completion-actions">{next && <ActionButton disabled={busy} onClick={next}>NEXT QUEST UNLOCKED</ActionButton>}<ActionButton disabled={busy} onClick={ranks}>VIEW LEADERBOARD</ActionButton><button className="text-action" disabled={busy} onClick={crew}>BACK TO TEAM</button></div>
  </div>;
}
