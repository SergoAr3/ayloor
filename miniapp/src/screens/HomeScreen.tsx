import { ActionButton, ArrowIcon, ErrorNotice, StatBlock } from "../components/ui";
import { homeHero, HOME_COPY as copy } from "./homeState";
import type { Me, Quest, Ranking } from "../types";

export default function HomeScreen({ me, quests, ranking, busy, questLoading, questError, reload, play, team, ranks }: {
  me: Me; quests: Quest[] | null; ranking: Ranking | null; busy: boolean; questLoading: boolean; questError: string;
  reload: () => void; play: (quest: Quest) => void; team: () => void; ranks: () => void;
}) {
  const hero = homeHero(me.team, quests);
  const quest = "quest" in hero ? hero.quest : null;
  const done = quests?.filter(item => item.run?.status === "completed").length ?? 0;
  const started = hero.kind === "active";
  const leaders = ranking?.entries.slice(0, 3) ?? [];
  return <section className="home-screen">
    <div className="home-kicker"><p className="eyebrow">{copy.nextMove}</p>{me.team && <button className="home-crew" onClick={team} disabled={busy} aria-label={`${me.team.name}, ${me.team.member_count} of 5 members, ${me.team.status} team`}><span className="status-dot active" aria-hidden="true" /><strong>{me.team.name}</strong><span>· {me.team.member_count} / 5</span></button>}</div>
    <article className={`home-mission is-${hero.kind}`}>
      {!me.season && <p>{copy.noSeason}</p>}
      {["pending", "no-team", "blocked"].includes(hero.kind) ? <><h1>{hero.kind === "pending" ? copy.pendingTitle : hero.kind === "blocked" ? copy.blockedTitle : copy.noTeamTitle}</h1><p className="home-description">{hero.kind === "pending" ? copy.pendingDescription : hero.kind === "blocked" ? copy.blockedDescription : copy.noTeamDescription}</p><ActionButton disabled={busy} onClick={team}>{hero.kind === "no-team" ? copy.noTeamAction : copy.teamAction}</ActionButton></>
        : hero.kind === "done" ? <><p className="confirmed home-all-done">{copy.doneStatus}</p><h1>{copy.doneTitle}</h1><p className="home-description">{copy.doneDescription}</p><ActionButton disabled={busy} onClick={ranks}>{copy.ranksAction}</ActionButton></>
        : hero.kind === "empty" ? <><div className="home-mission-head"><div className="home-mission-copy"><p className="eyebrow empty-status">{copy.emptyStatus}</p><h1>{copy.emptyTitle}</h1></div><div className="home-zone empty-zone" aria-hidden="true"><span className="home-zone-ring">?</span><span>{copy.emptyZone}</span></div></div><p className="empty-description">{copy.emptyDescription}</p><ActionButton secondary disabled={busy} onClick={ranks}>{copy.ranksAction}</ActionButton></>
        : <>{quest && <div className="home-mission-head"><div className="home-mission-copy"><p className="reward">+{quest.base_xp} XP</p><p className={`eyebrow mission-state${started ? " is-live" : ""}`}><span className={`status-dot${started ? "" : " is-unstarted"}`} aria-hidden="true" />{started ? copy.activeStatus : copy.availableStatus}</p><h1 title={quest.title}>{quest.title}</h1></div>{quest.radius_m != null && <div className="home-zone" aria-label={`${quest.radius_m} metre checkpoint zone`}><span className="home-zone-ring"><span className="status-dot" /></span><span>{quest.radius_m} M ZONE</span></div>}</div>}
          {quest && <><p className="home-description" title={quest.description}>{quest.description}</p><ActionButton disabled={busy || questLoading} onClick={() => play(quest)}>{started ? copy.activeAction : copy.availableAction}</ActionButton></>}
          {hero.kind === "closed" && <><h1>{copy.closedTitle}</h1><p>{copy.closedDescription}</p></>}
        </>}
      {questLoading && <p role="status">{copy.loading}</p>}
      {questError && <ErrorNotice>{questError}<ActionButton secondary disabled={busy} onClick={reload}>{copy.retry}</ActionButton></ErrorNotice>}
    </article>
    <div className="home-progress">
      <StatBlock label={copy.seasonXp}>{ranking?.current_user_team_xp ?? "—"}<small> XP</small></StatBlock>
      <StatBlock label={copy.cityRank}>{ranking?.current_user_team_rank != null ? `#${ranking.current_user_team_rank}` : "—"}</StatBlock>
      <div className="stat home-checkpoints"><strong>{quests ? `${done} / ${quests.length}` : "—"}</strong><span>{copy.checkpoints}</span>{!!quests?.length && (quests.length <= 8 ? <div className="home-checkpoint-tiles" aria-label={`${done} of ${quests.length} checkpoints completed`}>{quests.map(item => <i key={item.id} className={item.run?.status === "completed" ? "done" : undefined} />)}</div> : <progress aria-label="Completed checkpoints" max={quests.length} value={done} />)}{quests?.length === 0 && <small className="home-none-yet">{copy.emptySegments}</small>}</div>
    </div>
    {leaders.length > 0 && <div className="home-top-teams"><div className="spread"><p className="eyebrow">{copy.topTeams}</p><button className="home-ranks-link" onClick={ranks} disabled={busy}>{copy.ranks} <ArrowIcon /></button></div><ol>{leaders.map(entry => <li key={entry.team_id} className={entry.team_id === me.team?.id ? "own" : undefined}><span className="home-team-rank">{entry.rank}</span><strong title={entry.team_name}>{entry.team_name}</strong>{entry.team_id === me.team?.id && <small>{copy.you}</small>}<span className="home-team-xp">{entry.xp} XP</span></li>)}</ol></div>}
  </section>;
}
