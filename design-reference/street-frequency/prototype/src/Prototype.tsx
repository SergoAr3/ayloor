import { useState, useEffect, useRef } from 'react';
import { ArrowRightIcon, ArrowLeftIcon, PlusIcon, PersonIcon, ReaderIcon, BarChartIcon, HomeIcon, CheckIcon, Share1Icon, ExternalLinkIcon, InfoCircledIcon, Cross2Icon } from '@radix-ui/react-icons';
import { MobileScroll, BottomSheet, KeyboardInput, useKeyboard } from './mobile';
import '@fontsource/barlow/400.css';
import '@fontsource/barlow/500.css';
import '@fontsource/barlow/600.css';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource/barlow-condensed/800.css';

type Page = 'team'|'quests'|'quest'|'ranks'|'home'|'complete';
export default function Prototype(){
 const root=useRef<HTMLDivElement>(null);
 useEffect(()=>{const screen=root.current?.closest('[data-phone-screen]');if(!screen)return;const keepViewport=()=>{screen.scrollTop=0;};screen.addEventListener('scroll',keepViewport);keepViewport();return()=>screen.removeEventListener('scroll',keepViewport);},[]);
 const [page,setPage]=useState<Page>('home');
 const [sheet,setSheet]=useState<'invite'|'check'|'create'|null>(null);
 const [team,setTeam]=useState('KENTRON MAFIA'); const [draft,setDraft]=useState('');
 const [members,setMembers]=useState(2); const [started,setStarted]=useState(false); const [done,setDone]=useState(false);
 const [checking,setChecking]=useState(false);const [error,setError]=useState(''); const [copied,setCopied]=useState(false);
 const keyboard=useKeyboard();
 const go=(p:Page)=>{keyboard.hide();setPage(p);setError('');};
 const active=members>=2;
 const btn=(label:string,action:()=>void,secondary=false,disabled=false)=> <button className={secondary?'action secondary':'action'} onClick={action} disabled={disabled}><span>{label}</span><ArrowRightIcon/></button>;
 const finish=()=>{setChecking(true);setError('');window.setTimeout(()=>{setChecking(false);setDone(true);setSheet(null);go('complete');},850);};
 return <div className="ayloor" ref={root}>
  <header className="brand"><img src="/assets/wordmark.png" alt="AYLOOR — The city is your game"/><div>YEREVAN<span>SEASON ZERO</span></div></header>
  <MobileScroll key={page} className="app-screen street-scroll"><main className={'street-content '+page} key={page}>
  {page==='home'&&<>
   <section className="home-heading"><div className="eyebrow spread"><span>YOUR CITY. YOUR PLAYGROUND.</span><span>S0</span></div><h1>GO OUT.<br/>PLAY YEREVAN.</h1></section>
   <div className="home-city"><img src="/assets/yerevan-collage.png" alt="Yerevan and Ararat in a halftone urban collage"/><span>YEREVAN / SEASON ZERO</span></div>
   <section className="home-mission"><div className="eyebrow spread"><span>{done?'CHECKPOINT CLAIMED':started?'YOUR QUEST IN PROGRESS':'YOUR NEXT MOVE'}</span><span>{done?'01 / 01':'+100 XP'}</span></div><h2>FIRST CHECKPOINT.</h2><p>{done?'First spot claimed. See where your crew stands.':started?'Your crew is on a quest. Head to the marked spot and check in.':'One spot in the city. Your crew. A hundred XP. Ready?'}</p>
   {btn(done?'VIEW LEADERBOARD':!active?'GATHER YOUR TEAM':started?'CONTINUE QUEST':'START QUEST',()=>{if(done){go('ranks');}else if(!active){go('team');}else{setStarted(true);go('quest');}})}
   <div className="home-progress"><div><span>SEASON XP</span><strong>{done?'100':'0'}<small> XP</small></strong></div><button onClick={()=>go('ranks')}><span>CITY RANK</span><strong>{!active?'—':done?'#1':'#2'}<ArrowRightIcon/></strong></button><div><span>CHECKPOINTS</span><strong>{done?'1':'0'}<small> / 1</small></strong></div></div>
   <button className="home-crew" onClick={()=>go('team')}><div><span>YOUR CREW</span><strong>{team}</strong><small>{active?'TEAM ACTIVE':'WAITING FOR TEAMMATES'} · {members}/5 MEMBERS</small></div><ArrowRightIcon/></button>
   </section>
  </>}
  {page==='team'&&<>
   <div className="city-hero"><img src="/assets/yerevan-collage.png" alt="Yerevan skyline and Ararat in a street poster collage"/><div className="city-label">YEREVAN<span>S0</span></div><span className="edition">THE CITY IS YOUR GAME.</span></div>
   <section className="team-section"><div className="eyebrow spread"><span>YOUR TEAM</span><span className="count">{members} / 5</span></div><h1>{team.split(' ').map((w,i)=><span key={i}>{w} </span>)}</h1>
   <div className="team-state"><span className={active?'dot':'dot pending'}/>{active?'TEAM ACTIVE':'WAITING FOR TEAMMATES'}</div>
   <div className="members" aria-label={`${members} of 5 team members`}>{Array.from({length:5},(_,i)=>i<members?<div className="avatar" key={i}>{['AK','LM','NV','DS','AR'][i]}</div>:<button className="empty-avatar" key={i} aria-label="Invite teammate" onClick={()=>setSheet('invite')}><PlusIcon/></button>)}</div>
   {btn('INVITE FRIENDS',()=>setSheet('invite'))}
   {btn(done?'CHECKPOINT COMPLETE': 'FIRST CHECKPOINT',()=>go('quest'),true)}
   {!active&&<p className="note">One more teammate and the city is yours. Teams need at least 2 players.</p>}
   <button className="text-button" onClick={()=>{setDraft('');setSheet('create');}}>Preview creating a new team</button><div className="team-footer"><span>CREW UP. GO OUT.</span><span>{done?'100':'000'} XP</span></div>
   </section>
  </>}
  {(page==='quests'||page==='quest')&&<>
   <section className="quest-title"><button className="back" onClick={()=>go(page==='quest'?'quests':'team')}><ArrowLeftIcon/>{page==='quest'?'ALL QUESTS':'YOUR TEAM'}</button><div className="eyebrow spread"><span>{done?'QUEST COMPLETE':started?'QUEST ACTIVE':'LOCATION QUEST'}</span><span>01 / 01</span></div><h1>FIRST<br/>CHECKPOINT.</h1><div className="reward">+100 XP</div></section>
   <div className="quest-art"><img src="/assets/cascade.png" alt="Illustrative Cascade checkpoint in Yerevan"/><span>CONCEPT LOCATION · CASCADE</span></div>
   <section className="quest-body"><p className="brief">Reach the marked spot.<br/>Check in within 100 m.</p><div className="quest-facts"><span>TEAM QUEST</span><span>100 M RADIUS</span></div>
   {done?btn('VIEW LEADERBOARD',()=>go('ranks')):!started?btn(active?'START QUEST':'WAITING FOR TEAM',()=>{setStarted(true);go('quest');},false,!active):btn('CHECK IN',()=>{setError('');setSheet('check');})}
   <button className="action secondary" onClick={()=>window.open('https://www.google.com/maps/search/?api=1&query=Cascade+Yerevan','_blank','noopener,noreferrer')}><span><ExternalLinkIcon/> OPEN IN MAPS</span><ArrowRightIcon/></button>
   <p className="privacy"><InfoCircledIcon/>Location requested only at check-in.</p><p className="demo-label">Illustrative location. Final checkpoint to be confirmed.</p>
   </section>
  </>}
  {page==='complete'&&<>
   <section className="completion"><div className="eyebrow">YEREVAN · SEASON ZERO</div><h1>QUEST<br/>COMPLETE.</h1><div className="xp">+100<span>XP</span></div><p>First Checkpoint. Claimed together.</p><div className="completion-team"><span>YOUR TEAM</span><strong>{team}</strong><span>100 XP THIS SEASON</span></div>{btn('VIEW LEADERBOARD',()=>go('ranks'))}{btn('BACK TO TEAM',()=>go('team'),true)}</section><img className="completion-art" src="/assets/yerevan-collage.png" alt="Yerevan city collage"/>
  </>}
  {page==='ranks'&&<>
   <section className="ranks-heading"><div className="eyebrow spread"><span>YEREVAN</span><span>SEASON ZERO</span></div><h1>THE CITY.<br/>YOUR RANK.</h1><div className="standings-meta"><span>TEAM LEADERBOARD</span><span>3 TEAMS</span></div></section>
   <section className="leaderboard">{(done?[[team,'100','1'],['PINK CITY','100','2'],['NIGHT WALKERS','0','3']]:[['PINK CITY','100','1'],[team,'0','2'],['NIGHT WALKERS','0','3']]).map(([name,xp,rank])=><div className={'rank-row '+(name===team?'own':'')} key={name}><b>{rank}</b><div><strong>{name}</strong><span>{xp} XP</span></div>{name===team&&<small>YOU</small>}</div>)}<p className="rank-note">Same XP? The team created first ranks higher.</p></section><img className="rank-art" src="/assets/yerevan-collage.png" alt="Yerevan skyline"/><div className="ranks-tagline">PLAY THE<br/>REAL WORLD.</div>
  </>}
  <footer className="prototype-note">AYLOOR / INTERACTIVE CONCEPT · S0</footer>
  </main></MobileScroll>
  <nav className="tabbar" aria-label="Main navigation">{([['home','HOME',HomeIcon],['quests','QUESTS',ReaderIcon],['ranks','RANKS',BarChartIcon],['team','TEAM',PersonIcon]] as const).map(([id,label,Icon])=><button key={id} onClick={()=>go(id)} aria-current={page===id||(id==='quests'&&page==='quest')?'page':undefined}><Icon/><span>{label}</span></button>)}</nav>
  <BottomSheet open={sheet==='invite'} onOpenChange={o=>!o&&setSheet(null)} title="BRING YOUR PEOPLE." description="Your city. Your crew. 2–5 players per team." snap={0.62}><div className="sheet-content"><div className="invite-team"><span>TEAM INVITATION</span><h2>{team}</h2><span>{members} / 5 MEMBERS</span></div><p>In the live app, this invitation opens your team in Telegram.</p><button className="action" onClick={()=>setCopied(true)}><span>{copied?'INVITE PREVIEW READY':'PREVIEW INVITE'}</span>{copied?<CheckIcon/>:<Share1Icon/>}</button>{copied&&<div className="invite-preview">Join {team} on AYLOOR.<br/>Yerevan · Season Zero. Play the real world.</div>}<div className="demo-divider">PROTOTYPE CONTROLS</div>{btn(members<5?'SIMULATE TEAMMATE JOINING':'TEAM IS FULL',()=>{setMembers(v=>Math.min(5,v+1));setSheet(null);},true,members>=5)}<button className="text-button" onClick={()=>{setMembers(1);setStarted(false);setDone(false);setSheet(null);}}>Preview waiting for teammates</button></div></BottomSheet>
  <BottomSheet open={sheet==='check'} onOpenChange={o=>!o&&!checking&&setSheet(null)} title="CLAIM THE CHECKPOINT." description="Location is checked once, when you check in." snap={0.66}><div className="sheet-content"><div className="eyebrow">FIRST CHECKPOINT · +100 XP</div><p className="check-explainer">Walk to the marked public spot. Your location must be inside the 100 m zone.</p><div className="demo-divider">DEMO CHECK-IN · NO GPS REQUESTED</div>{error&&<div role="alert" className="check-error"><Cross2Icon/><div><strong>{error}</strong><p>{error==='Not there yet.'?'You’re outside the check-in zone. Walk closer and try again.':'Allow location in Telegram settings, then try again.'}</p></div></div>}{btn(checking?'VERIFYING…':error?'TRY AGAIN · IN ZONE':'SIMULATE SUCCESSFUL CHECK-IN',finish,false,checking)}<div className="error-controls"><button onClick={()=>setError('Not there yet.')} disabled={checking}>Outside zone</button><button onClick={()=>setError('Location access denied.')} disabled={checking}>Permission denied</button></div><p className="note">XP is awarded only after server verification in the live app.</p></div></BottomSheet>
  <BottomSheet open={sheet==='create'} onOpenChange={o=>!o&&setSheet(null)} title="NAME YOUR CREW."><div className="sheet-content"><KeyboardInput value={draft} onChange={e=>setDraft(e.target.value)} placeholder="Team name" maxLength={32}/>{btn('CREATE TEAM',()=>{if(draft.trim()){setTeam(draft.trim().toUpperCase());setMembers(1);setStarted(false);setDone(false);setSheet(null);go('team');}},false,!draft.trim())}</div></BottomSheet>
 </div>;
}
