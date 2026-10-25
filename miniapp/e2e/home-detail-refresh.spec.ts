import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { mount, started } from "./fixtures";
import type { Quest, Ranking } from "../src/types";
const artifacts='.visual-qa/home-detail-refresh';
const quest:Quest={id:'q',title:'Vernissage Market',description:'Temporary real checkpoint for AYLOOR v0.1 smoke-test.',base_xp:100,latitude:40,longitude:44,radius_m:100,run:null};
function board(xp=300,rank=1):Ranking{return{entries:[{rank:1,team_id:rank===1?'t':'other1',team_name:rank===1?'SuperBobri':'Pink City',xp:rank===1?xp:200},{rank:2,team_id:'other2',team_name:'Night Walkers',xp:100},{rank:3,team_id:rank===3?'t':'other3',team_name:rank===3?'SuperBobri':'Third crew',xp:rank===3?xp:0}],current_user_team_xp:xp,current_user_team_rank:rank,xp_to_next_rank:null};}
for(const width of [320,360,390])for(const state of ['active','available','empty','done','pending','no-team'] as const)test(`Home ${state} ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:740});await page.emulateMedia({reducedMotion:'reduce'});
 const quests=state==='empty'?[]:Array.from({length:5},(_,i)=>({...quest,id:i===0?'q':String(i),run:state==='done'?{id:`r${i}`,status:'completed' as const}:state==='active'?(i===0?started:i<4?{id:`r${i}`,status:'completed' as const}:null):null}));
 const ranking=board(state==='active'?300:state==='done'?500:0,state==='active'||state==='done'?1:3);
 if(state==='available'||state==='empty')ranking.current_user_team_rank=null;
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 const {counters}=await mount(page,{quests,ranking,run:state==='active'?started:null,pending:state==='pending',noTeam:state==='no-team'});
 await page.evaluate(()=>{document.documentElement.style.setProperty('--tg-safe-area-inset-top','12px');document.documentElement.style.setProperty('--tg-safe-area-inset-bottom','20px');return document.fonts.ready;});
 if(state==='no-team')await page.getByRole('button',{name:'HOME',exact:true}).click();
 await expect(page.locator('.home-mission')).toBeVisible();
 const label=state==='active'?'CONTINUE QUEST':state==='available'?'START QUEST':state==='pending'?'TEAM':state==='no-team'?'CREATE / JOIN TEAM':'VIEW RANKS';
 const action=page.locator('.home-mission').getByRole('button',{name:label,exact:true});await expect(action).toBeVisible();
 const metrics=await page.evaluate(()=>{
  const rect=(selector:string)=>{const b=document.querySelector(selector)!.getBoundingClientRect();return{top:b.top,bottom:b.bottom,left:b.left,right:b.right,height:b.height};};
  return{header:rect('.brand'),ticker:rect('.marquee'),kicker:rect('.home-kicker'),hero:rect('.home-mission'),stats:rect('.home-progress'),second:rect('.home-top-teams li:nth-child(2)'),nav:rect('nav'),overflow:document.documentElement.scrollWidth>innerWidth};
 });
 mkdirSync(artifacts,{recursive:true});writeFileSync(`${artifacts}/${width}-home-${state}-geometry.json`,JSON.stringify(metrics,null,2));await page.screenshot({path:`${artifacts}/${width}-home-${state}.png`});
 expect(metrics.overflow).toBe(false);expect(metrics.header.top).toBe(12);expect(metrics.kicker.top-metrics.ticker.bottom).toBeLessThanOrEqual(12);
 expect(metrics.second.bottom).toBeLessThanOrEqual(metrics.nav.top);expect(metrics.stats.bottom).toBeLessThan(metrics.nav.top);
 if(state==='active'||state==='available'){
  expect(await page.locator('.home-mission h1').evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(40);await expect(action).toHaveCSS('min-height','60px');
  const heading=(await page.locator('.home-mission h1').boundingBox())!,zone=(await page.locator('.home-zone').boundingBox())!;expect(heading.x+heading.width).toBeLessThanOrEqual(zone.x);
  await expect(page.locator('.mission-state')).toHaveText(state==='active'?'QUEST IN PROGRESS':'NEXT QUEST · NOT STARTED');
  if(state==='available'){await expect(page.locator('.mission-state .status-dot')).toHaveCSS('animation-name','none');await expect(page.locator('.home-checkpoint-tiles .done')).toHaveCount(0);await expect(page.locator('.home-team-xp').last()).toHaveText('0 XP');}
 }
 if(state==='empty'){await expect(page.locator('.home-mission')).toHaveCSS('border-top-style','dashed');await expect(page.locator('.home-mission')).toHaveCSS('box-shadow','none');await expect(page.locator('.home-checkpoints')).toContainText('0 / 0');await expect(page.locator('.home-checkpoints')).toContainText('NONE YET');await expect(page.getByRole('button',{name:'START QUEST',exact:true})).toHaveCount(0);}
 if(state==='done'){await expect(page.locator('.home-all-done')).toHaveText('ALL DONE ✓');await expect(page.locator('.home-mission h1')).toHaveText('Season Zero checkpoints complete.');await expect(page.locator('.home-checkpoint-tiles .done')).toHaveCount(5);}
 if(state!=='pending'&&state!=='no-team')await expect(page.locator('.home-top-teams .own small')).toHaveText('YOU');
 expect(counters.gps).toBe(0);expect(counters.checkins).toBe(0);expect(counters.starts).toBe(0);
 mkdirSync(artifacts,{recursive:true});await page.screenshot({path:`${artifacts}/${width}-home-${state}.png`});
 expect(errors).toEqual([]);await expect(page.locator('.home-ranks-link')).toHaveCSS('color','rgb(24, 24, 22)');await page.locator('.home-ranks-link').focus();await page.keyboard.press('Enter');await expect(page.locator('.ranking')).toBeVisible();expect(counters.gps).toBe(0);
});
for(const width of [320,360,390])for(const state of ['active','unstarted','completed'] as const)test(`compact detail header ${state} ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:740});await page.emulateMedia({reducedMotion:'reduce'});
 const run=state==='active'?started:state==='completed'?{id:'r',status:'completed' as const}:null;
 const {counters}=await mount(page,{run,questContent:{title:'Blue Mosque',description:'Stay on public paths. '.repeat(40)}});
 await page.getByRole('button',{name:'QUESTS',exact:true}).click();await page.locator('.quest-row').click();await page.evaluate(()=>{document.documentElement.style.setProperty('--tg-safe-area-inset-top','12px');document.documentElement.style.setProperty('--tg-content-safe-area-inset-top','8px');return document.fonts.ready;});
 await expect(page.locator('.quest-detail-header')).toBeVisible();await expect(page.locator('.brand,.marquee,.quest-heading .quest-back')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'ALL QUESTS',exact:true})).toHaveCount(1);
 await expect(page.locator('.quest-detail-header .quest-back')).toHaveCSS('font-size','18px');await expect(page.locator('.quest-detail-header .wordmark')).toHaveCSS('font-size','28px');
 const geometry=await page.evaluate(()=>{const h=document.querySelector('.quest-detail-header')!.getBoundingClientRect(),s=document.querySelector('.quest-state')!.getBoundingClientRect(),scroll=document.querySelector('.quest-scroll')!.getBoundingClientRect();return{height:h.height,top:h.top,inset:scroll.top,gap:s.top-h.bottom,padding:getComputedStyle(document.querySelector('.quest-detail-header')!).paddingTop};});
 expect(geometry.top).toBe(20);expect(geometry.height).toBe(44);expect(geometry.gap).toBeLessThanOrEqual(12);expect(geometry.padding).toBe('12px');
 // Both controls keep 44px pointer targets using their transparent pseudo-element.
 for(const selector of ['.quest-detail-header .quest-back','.quest-detail-header .wordmark']){
  const hit=await page.locator(selector).evaluate(el=>{
   const b=el.getBoundingClientRect(),pseudo=getComputedStyle(el,'::before');
   return {height:b.height-parseFloat(pseudo.top)-parseFloat(pseudo.bottom),top:el.contains(document.elementFromPoint(b.x+b.width/2,b.top-5)),bottom:el.contains(document.elementFromPoint(b.x+b.width/2,b.bottom+5))};
  });
  expect(hit.height).toBe(44);expect(hit.top).toBe(true);expect(hit.bottom).toBe(true);
 }

 await expect(page.getByRole('navigation')).toHaveCount(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 mkdirSync(artifacts,{recursive:true});await page.screenshot({path:`${artifacts}/${width}-detail-${state}.png`});mkdirSync('.visual-qa/detail-header-gap',{recursive:true});writeFileSync(`.visual-qa/detail-header-gap/${width}-${state}-after.json`,JSON.stringify(geometry,null,2));await page.screenshot({path:`.visual-qa/detail-header-gap/${width}-${state}-after.png`});
 const before=(await page.locator('.quest-detail-header').boundingBox())!.y;await page.locator('.quest-scroll').evaluate(el=>el.scrollTop=100);expect((await page.locator('.quest-detail-header').boundingBox())!.y).toBeLessThan(before);
 expect(counters.gps).toBe(0);expect(counters.checkins).toBe(0);expect(counters.starts).toBe(0);
});
test('Home beacon moves only with motion allowed; static not-started circle stays still',async({page})=>{
 await page.emulateMedia({reducedMotion:'no-preference'});await mount(page,{run:started});const dot=page.locator('.home-mission .mission-state .status-dot');await expect(dot).toHaveCSS('animation-name','home-quest-pulse');
 const opacity=await dot.evaluate(el=>getComputedStyle(el).opacity);await page.waitForTimeout(350);expect(await dot.evaluate(el=>getComputedStyle(el).opacity)).not.toBe(opacity);
 await page.emulateMedia({reducedMotion:'reduce'});await expect(dot).toHaveCSS('animation-name','none');await expect(dot).toHaveCSS('opacity','1');
});

test('Home hides an empty leaderboard and keeps honest unavailable rank',async({page})=>{
 const ranking:Ranking={entries:[],current_user_team_rank:null,current_user_team_xp:0,xp_to_next_rank:null};
 const {counters}=await mount(page,{ranking});await expect(page.locator('.home-top-teams')).toHaveCount(0);await expect(page.locator('.home-progress .stat strong').nth(0)).toHaveText('0 XP');await expect(page.locator('.home-progress .stat strong').nth(1)).toHaveText('—');expect(counters.gps).toBe(0);
});
