import {expect,test} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {mount,started} from './fixtures';
const artifacts='.visual-qa/detail-reference-match';
for(const width of [320,360,390])for(const state of ['active','unstarted','completed'] as const)test(`rich detail ${state} ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:740});await page.emulateMedia({reducedMotion:'reduce'});
 const run=state==='active'?started:state==='completed'?{id:'r',status:'completed' as const}:null;
 const description='Temporary real checkpoint for AYLOOR v0.1 smoke-test.';
 const {counters}=await mount(page,{run,teamName:'SuperBobri',questContent:{title:'Blue Mosque',description,place_label:'FIELD TEST CHECKPOINT'}});
 await page.getByRole('button',{name:'QUESTS',exact:true}).click();await page.locator('.quest-row').click();await page.evaluate(()=>document.fonts.ready);
 await expect(page.locator('.quest-crew-card')).toContainText('SuperBobri · 2 / 5');await expect(page.locator('.quest-briefing')).toContainText(description);await expect(page.locator('.quest-safety')).toContainText('Use crossings and public paths.');
 if(state==='completed')await expect(page.locator('.quest-check-in-steps')).toHaveCount(0);
 else{await expect(page.locator('.quest-check-in-steps li')).toHaveCount(3);await expect(page.locator('.quest-check-in-steps')).toContainText(state==='active'?'TAP CHECK IN':'START QUEST');}
 await expect(page.locator('.zone-map-canvas')).toHaveClass(/is-idle/);await expect(page.locator('.idle-radius-label')).toHaveText('100 M');await expect(page.locator('.idle-map-north')).toHaveText('N ↑');await expect(page.locator('.fix-dot,.off-map-fix')).toHaveCount(0);
 const metrics=await page.evaluate(()=>{
  const rect=(selector:string)=>{const b=document.querySelector(selector)!.getBoundingClientRect();return{x:b.x,y:b.y,right:b.right,bottom:b.bottom,width:b.width,height:b.height};};
  return{header:rect('.quest-detail-header'),title:rect('.quest-poster-title'),map:rect('.quest-content'),canvas:rect('.zone-map-canvas'),zone:rect('.zone-boundary'),footer:rect('.map-footer-main'),crew:rect('.quest-crew-card'),dock:rect('.quest-dock'),font:getComputedStyle(document.querySelector('.quest-poster-title')!).fontSize};
 });
 expect(metrics.zone.width).toBeGreaterThan(120);expect(metrics.canvas.height).toBe(154);expect(metrics.header.height).toBe(44);if(state!=='completed')expect(metrics.font).toBe('72px');
 expect(metrics.canvas.bottom).toBeLessThan(metrics.dock.y);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 const cta=page.getByRole('button',{name:state==='active'?'CHECK IN':state==='unstarted'?'START QUEST':'BACK TO QUESTS',exact:true});await expect(cta).toBeInViewport({ratio:1});
 mkdirSync(artifacts,{recursive:true});await page.screenshot({path:`${artifacts}/${width}-${state}-top.png`});
 await page.locator('.quest-scroll').evaluate(el=>{const map=el.querySelector('.quest-content')!;el.scrollTop+=(map.getBoundingClientRect().top-el.getBoundingClientRect().top)-12;});
 await expect(page.locator('.quest-crew-card')).toBeInViewport({ratio:1});await expect(page.locator('.quest-briefing')).toBeInViewport({ratio:1});await expect(cta).toBeInViewport({ratio:1});
 await page.screenshot({path:`${artifacts}/${width}-${state}-scrolled.png`});
 await page.locator('.quest-scroll').evaluate(el=>el.scrollTop=el.scrollHeight);const bottom=(await page.locator('.quest-briefing').boundingBox())!;expect(bottom.y+bottom.height).toBeLessThanOrEqual(metrics.dock.y-15);
 expect(counters.gps).toBe(0);expect(counters.starts).toBe(0);expect(counters.checkins).toBe(0);writeFileSync(`${artifacts}/${width}-${state}.json`,JSON.stringify(metrics,null,2));
});
