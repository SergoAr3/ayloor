import { ActionButton, CopyIcon, TeamStatus } from "../components/ui";
import type { Invite, Member, Team } from "../types";

export default function TeamScreen({ team, members, invitation, name, setName, busy, shareLink, create, join, invite, copy, refresh, userId, cancelInvite, quests }: {
  team: Team | null; members: Member[]; invitation: Invite | null; name: string; setName: (name: string) => void;
  busy: boolean; shareLink: string; create: () => void; join: () => void; invite: () => void; copy: () => void; refresh: () => void;
  userId?: string; cancelInvite?: () => void; quests?: () => void;
}) {
  if (team) return <div className="focused-view team-view">
    <section className="quest-scroll team-screen">
      <p className="eyebrow">YOUR CREW / YEREVAN</p><h1 className="page-title">Team<span>.</span></h1>
      <div className="team-summary"><span>{team.member_count} / 5 MEMBERS</span><TeamStatus team={team} /></div>
      <h2 className="team-name">{team.name}</h2>
      <ul className="members" aria-label={`${team.member_count} of 5 team members`}>
        {members.map(member => <li key={member.user.id} className={member.user.id === userId ? "self" : ""}><span className="member-initial" aria-hidden="true">{(member.user.first_name || member.user.username || "Player").slice(0, 1).toUpperCase()}</span><div><strong>{member.user.first_name || member.user.username || "Player"}</strong><small>{member.role === "captain" ? "CAPTAIN" : "MEMBER"}</small></div>{member.user.id === userId && <span className="you-badge">YOU</span>}</li>)}
        {members.length < team.member_count && <li className="hint">Member details unavailable. Refresh your team.</li>}
        {team.member_count < 5 && <li className="open-slot"><span className="slot-number" aria-hidden="true">+</span><div><strong>OPEN SLOT</strong><small>INVITE A FRIEND</small></div><span className="slots-left">{5 - team.member_count} LEFT</span></li>}
      </ul>
      {team.status === "pending" && <p className="hint">Your team becomes active with 2 players.</p>}
      {shareLink && <div className="invite-card"><label htmlFor="invite-link">Invite link</label><div className="invite-link-row"><input id="invite-link" readOnly value={shareLink} onFocus={e => e.target.select()} /><button className="copy-link" aria-label="COPY LINK" disabled={busy} onClick={copy}><CopyIcon /></button></div></div>}
    </section>
    <div className="quest-dock team-actions">{team.member_count < 5 && <ActionButton disabled={busy} onClick={invite}>INVITE FRIENDS</ActionButton>}
      <div className="team-support-actions"><ActionButton secondary arrow={false} disabled={busy} onClick={refresh}>REFRESH TEAM</ActionButton>
      {team.status === "active" && quests && <button className="text-action" disabled={busy} onClick={quests}>BACK TO QUESTS</button>}</div>
    </div>
  </div>;
  return <section className="team-screen no-team">
    <p className="eyebrow">PLAY THE REAL WORLD.</p><h1 aria-label={invitation ? "Your crew is calling." : "Make a crew."}>{invitation ? "Your crew is calling." : <>Make<br />a crew.</>}</h1>
    {invitation && <article className="invite-preview"><p className="eyebrow">YOU'RE INVITED</p><h2>{invitation.team.name}</h2><p>{invitation.team.member_count} / 5 members</p><ActionButton disabled={busy} onClick={join}>JOIN TEAM</ActionButton>{cancelInvite && <button className="text-action" disabled={busy} onClick={cancelInvite}>CANCEL / CREATE A TEAM</button>}</article>}
    <form onSubmit={e => { e.preventDefault(); create(); }}><div className="team-name-field"><label htmlFor="team-name">Team name</label><input id="team-name" value={name} onChange={e => setName(e.target.value)} maxLength={80} placeholder="Type a name…" required /></div><p className="hint">Teams have 2–5 players. Already invited? Open your friend’s invite link.</p><ActionButton disabled={busy || !name.trim()}>CREATE TEAM</ActionButton></form>
  </section>;
}
