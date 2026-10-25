import { useState } from "react";
import type { Quest, Team } from "../types";
import { ArrowIcon } from "../components/ui";

type Filter = "all" | "todo" | "done";
type State = "progress" | "available" | "completed" | "closed";
const stateOf = (quest: Quest): State => !quest.run ? "available" : quest.run.status === "started" ? "progress" : quest.run.status === "completed" ? "completed" : "closed";

export function QuestsScreen({ quests, busy, open, team, seasonXp, teamScreen }: {
  quests: Quest[] | null; busy: boolean; open: (quest: Quest) => void;
  team: Team | null; seasonName: string | null; seasonXp: number | null; teamScreen: () => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const ready = team?.status === "active";
  const rows = (quests ?? []).map((quest, index) => ({ quest, number: index + 1, state: stateOf(quest) }));
  const completed = rows.filter(row => row.state === "completed").length;
  const todo = rows.filter(row => row.state === "available" || row.state === "progress").length;
  const groups: { key: State; label: string }[] = [
    { key: "progress", label: "IN PROGRESS" }, { key: "available", label: "AVAILABLE" },
    { key: "completed", label: "COMPLETED" }, { key: "closed", label: "CLOSED" },
  ];
  const visible = rows.filter(row => filter === "all" || (filter === "done" ? row.state === "completed" : row.state === "available" || row.state === "progress"));
  return <section className="quests-screen">
    <p className="eyebrow">EXPLORE YEREVAN</p><h1 className="page-title">Quests<span>.</span></h1>
    {!ready ? <div className="gather-team">
      <div><h2>GATHER YOUR TEAM</h2><p id="quest-team-required">{team?.status === "blocked" ? "Your team is blocked. Open TEAM for details." : `Quests start with 2 players. You have ${team?.member_count ?? 0}.`}</p></div>
      <button disabled={busy} onClick={teamScreen}>TEAM <ArrowIcon direction="right" /></button>
    </div> : <div className="season-progress" role="region" aria-label="Season progress">
      <div className="season-summary"><span>SEASON PROGRESS</span><strong>{quests == null ? "— / —" : `${completed} / ${rows.length}`} · {seasonXp ?? "—"} XP</strong></div>
      {quests != null && <div className={`season-segments${rows.length > 20 ? " continuous" : ""}`} role="progressbar" aria-label="Completed checkpoints" aria-valuemin={0} aria-valuemax={Math.max(1, rows.length)} aria-valuenow={completed} aria-valuetext={`${completed} of ${rows.length} checkpoints completed`}>
        {rows.length > 20 ? <span className="filled" style={{ width: `${completed / rows.length * 100}%` }} /> : rows.map(row => <span key={row.quest.id} className={`checkpoint-segment${row.state === "completed" ? " filled" : ""}`} aria-hidden="true">{String(row.number).padStart(2, "0")}{row.state === "completed" ? " ✓" : ""}</span>)}
      </div>}
    </div>}
    <div className="quest-filters" role="group" aria-label="Quest filters">
      {([{ key: "all", label: "ALL", count: rows.length }, { key: "todo", label: "TO DO", count: todo }, { key: "done", label: "DONE", count: completed }] as const).map(item => <button key={item.key} aria-pressed={filter === item.key} onClick={() => setFilter(item.key)}>{item.label} <span>{quests == null ? "—" : item.count}</span></button>)}
    </div>
    {quests == null ? <p role="status">Loading quests…</p> : !rows.length ? <p>No quests are available right now.</p> : !visible.length ? <p>{filter === "done" ? "No completed quests yet." : "No quests left to do."}</p> : groups.map(group => {
      const entries = visible.filter(row => row.state === group.key);
      return entries.length > 0 && <div className="quest-group" key={group.key} role="group" aria-label={group.label}>
        <h2 className="quest-group-heading"><span>{group.label}</span><span>{entries.length}</span></h2>
        {entries.map(({ quest, number, state }) => {
          const card = <button key={quest.id} className={`quest-row ${state}${!ready && state !== "completed" ? " team-locked" : ""}`} disabled={busy} onClick={() => open(quest)} aria-describedby={state === "completed" ? `quest-done-${quest.id}` : !ready ? "quest-team-required" : undefined}>
            <span className="quest-number" aria-hidden="true">{String(number).padStart(2, "0")}</span>
            <span className="quest-row-main">{state === "progress" && <span className="quest-row-status"><span className="quest-chip">IN PROGRESS</span></span>}<span className="quest-title-line"><strong>{quest.title}</strong></span><span className="quest-row-meta">LOCATION · TEAM{quest.radius_m != null ? ` · ${quest.radius_m} M` : ""}</span></span>
            <span className="quest-row-end"><span>+{quest.base_xp} XP</span>{state === "closed" && <span className="quest-row-status"><span className="quest-chip">CLOSED</span></span>}<ArrowIcon direction="right" /></span>
          </button>;
          return state === "completed" ? <div className="completed-quest-row" key={quest.id}>
            {card}<span id={`quest-done-${quest.id}`} className="quest-done-stamp">DONE ✓</span>
          </div> : card;
        })}
      </div>;
    })}
  </section>;
}
