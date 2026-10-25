import { expect, it } from "vitest";
import { renderToStaticMarkup as render } from "react-dom/server";
import HomeScreen from "./HomeScreen";
import { QuestDetailHeader } from "../components/ui";
import type { Me, Quest, Ranking } from "../types";
const noop = () => {};
const me: Me = { user:{id:'u',telegram_id:1,username:null,first_name:null},team:{id:'t',name:'SuperBobri',member_count:3,status:'active'},city:{name:'Yerevan'},season:{name:'Season Zero'} };
const quest: Quest = {id:'q',title:'Vernissage Market',description:'Authored content',base_xp:100,radius_m:100,latitude:40,longitude:44,run:null};
const ranking: Ranking = {entries:[{rank:1,team_id:'t',team_name:'SuperBobri',xp:300},{rank:2,team_id:'t2',team_name:'Pink City',xp:200},{rank:3,team_id:'t3',team_name:'Night Walkers',xp:100},{rank:4,team_id:'t4',team_name:'Fourth',xp:0}],current_user_team_rank:1,current_user_team_xp:300,xp_to_next_rank:null};
const props = {me,quests:[quest],ranking,busy:false,questLoading:false,questError:'',reload:noop,play:noop,team:noop,ranks:noop};
it('uses authored quest parameters and three real leaderboard entries',()=>{
 const html=render(<HomeScreen {...props}/>);for(const text of ['NEXT QUEST','+100 XP','100 M ZONE','START QUEST','Vernissage Market','Pink City','YOU','300 XP'])expect(html).toContain(text);
 expect(html).not.toContain('Fourth');expect(html.match(/class="home-team-rank"/g)).toHaveLength(3);
});
it('prioritizes a started quest over an available one',()=>{
 const html=render(<HomeScreen {...props} quests={[quest,{...quest,id:'live',title:'Live checkpoint',run:{id:'r',status:'started'}}]}/>);
 expect(html).toContain('Live checkpoint');expect(html).toContain('CONTINUE QUEST');expect(html).toContain('mission-state is-live');
});
it('pending crew gets a team action instead of quest gameplay and retains leaders',()=>{
 const html=render(<HomeScreen {...props} me={{...me,team:{...me.team!,status:'pending',member_count:1}}}/>);
 expect(html).toContain('GATHER YOUR TEAM');expect(html).toContain('<span>TEAM</span>');expect(html).toContain('TOP TEAMS');expect(html).not.toContain('START QUEST');
});
it('no team gets create/join action without a fake team badge',()=>{
 const html=render(<HomeScreen {...props} me={{...me,team:null}}/>);expect(html).toContain('CREATE / JOIN TEAM');expect(html).not.toContain('class="home-crew"');expect(html).not.toContain('START QUEST');
});
it('missing leaderboard uses honest empty stats and hides top teams',()=>{
 const html=render(<HomeScreen {...props} ranking={null}/>);expect(html).not.toContain('TOP TEAMS');expect(html).toContain('—<small> XP');expect(html).not.toContain('#1');
});
it.each([null, {...ranking,current_user_team_xp:null}])('empty quests keep unknown server XP unknown',board=>{
 const html=render(<HomeScreen {...props} quests={[]} ranking={board}/>);
 expect(html).toContain('—<small> XP');expect(html).not.toContain('0<small> XP');
});
it.each([0,300])('empty quests retain confirmed server XP: %s',xp=>{
 const html=render(<HomeScreen {...props} quests={[]} ranking={{...ranking,current_user_team_xp:xp}}/>);
 expect(html).toContain(`${xp}<small> XP`);
});
it('empty leaderboard block is omitted',()=>{expect(render(<HomeScreen {...props} ranking={{...ranking,entries:[]}}/>)).not.toContain('TOP TEAMS');});
it('only an entirely completed season gets all-done action',()=>{
 const done={...quest,run:{id:'r',status:'completed' as const}};
 const html=render(<HomeScreen {...props} quests={[done]}/>);expect(html).toContain('Season Zero checkpoints complete.');expect(html).toContain('VIEW RANKS');expect(html).not.toContain('START QUEST');
 expect(render(<HomeScreen {...props} quests={[done,{...quest,id:'next'}]}/>)).toContain('START QUEST');
});
it('empty quests do not count as all done; loading and retry stay available',()=>{
 expect(render(<HomeScreen {...props} quests={[]}/>)).not.toContain('all checkpoints done');
 const html=render(<HomeScreen {...props} quests={null} questLoading questError="Quest read failed"/>);expect(html).toContain('Loading quests');expect(html).toContain('RETRY QUESTS');
});
it('more than eight checkpoints use a bounded compact fallback',()=>{
 const html=render(<HomeScreen {...props} quests={Array.from({length:9},(_,i)=>({...quest,id:String(i)}))}/>);expect(html).toContain('<progress');expect(html).not.toContain('home-checkpoint-tiles');
});
it('detail header contains one SVG back control, wordmark and no city/ticker',()=>{
 const html=render(<QuestDetailHeader busy={false} back={noop} home={noop}/>);
 expect(html.match(/ALL QUESTS/g)).toHaveLength(1);expect(html).toContain('data-icon="left"');expect(html).toContain('AYLOOR');for(const text of ['YEREVAN','SEASON ZERO','marquee'])expect(html).not.toContain(text);
});
