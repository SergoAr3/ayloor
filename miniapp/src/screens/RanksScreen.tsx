import { ActionButton } from "../components/ui";
import type { Ranking } from "../types";

export default function RanksScreen({ ranking, teamId, busy, refresh }: { ranking: Ranking | null; teamId?: string; busy: boolean; refresh: () => void }) {
  return <section className="ranks-screen"><p className="eyebrow spread"><span>YEREVAN</span><span>SEASON ZERO</span></p><h1 className="page-title">Ranks<span>.</span></h1>
    <p className="eyebrow spread"><span>TEAM LEADERBOARD</span><span>{ranking ? `${ranking.entries.length} TEAMS` : "—"}</span></p>
    {!ranking ? <p>Rankings are unavailable. Please refresh.</p> : !ranking.entries.length ? <p>No ranked teams right now.</p> : <ol className="ranking">{ranking.entries.map(entry => <li key={entry.team_id} className={entry.team_id === teamId ? "own" : ""}><b>{entry.rank}</b><div><strong>{entry.team_name}</strong><span>{entry.xp} XP</span></div>{entry.team_id === teamId && <small>YOU</small>}</li>)}</ol>}
    {ranking?.xp_to_next_rank != null && ranking.current_user_team_rank != null && <p>{ranking.xp_to_next_rank} XP to #{ranking.current_user_team_rank - 1}</p>}
    <p className="hint">Same XP? The team created first ranks higher.</p><ActionButton className="refresh-ranks" secondary arrow={false} disabled={busy} onClick={refresh}>REFRESH</ActionButton>
  </section>;
}
