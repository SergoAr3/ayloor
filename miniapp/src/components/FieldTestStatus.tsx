import { useEffect, useMemo, useState } from "react";
import type { FieldTest } from "../types";

export function duration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

// Tick from the latest server snapshot. This is display only; all mutations still
// use backend time, including when the phone's clock is wrong or the page resumes.
export function fieldClock(field: FieldTest, secondsSinceRead: number) {
  const elapsed = field.status === "running"
    ? Math.min(5400, field.elapsed_seconds + Math.max(0, Math.floor(secondsSinceRead)))
    : field.elapsed_seconds;
  return { elapsed, remaining: Math.max(0, field.remaining_seconds - (elapsed - field.elapsed_seconds)) };
}

export function FieldTestStatus({ field, refresh, busy }: {
  field: FieldTest; refresh: () => void; busy: boolean;
}) {
  const receivedAt = useMemo(() => performance.now(), [field]);
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    const tick = () => setNow(performance.now());
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, []);
  const clock = fieldClock(field, (now - receivedAt) / 1000);
  const ended = field.status === "finished" || field.status === "expired";
  return <section className={`field-test-status ${field.status}`} aria-label="FIELD TEST 0 progress">
    <div className="spread"><p className="eyebrow">FIELD TEST 0</p><strong>{field.status === "finished" ? "FINISHED ✓" : field.status === "expired" ? "TIME EXPIRED" : field.status === "ready" ? "90 MIN RUN" : `${duration(clock.remaining)} LEFT`}</strong></div>
    <p className="field-score"><strong>{field.score} / {field.maximum_score} XP</strong><span>{field.completed_quests} / {field.total_quests} quests</span></p>
    {field.started_at ? <p>Elapsed {duration(clock.elapsed)} · {field.leaderboard_position == null ? "Rank unavailable" : `Leaderboard #${field.leaderboard_position}`}</p> : <p>Timer begins when your team starts the first quest.</p>}
    {field.status === "expired" && <p>The run is closed. Your earned XP is saved.</p>}
    {field.status === "running" && clock.remaining === 0 && <p role="status">Time reached. Refresh to confirm server state.</p>}
    {field.status === "finished" && <p>Route complete. Walk safely; elapsed time gives no bonus.</p>}
    <button className="text-action" disabled={busy} onClick={refresh}>{ended ? "REFRESH SUMMARY" : "REFRESH RUN"}</button>
  </section>;
}
