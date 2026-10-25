import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { mount, started } from "./fixtures";
const phase=process.env.AYLOOR_HERO_PHASE === "before" ? "before" : "after";
const artifacts=".visual-qa/quest-detail-shell/hero";
const titles=[['blue','Blue Mosque'],['vernissage','Vernissage Market'],['short','Cascade'],['long','Extraordinarycheckpoint at Republic Square']] as const;
for(const width of [320,360,390])for(const state of ['active','unstarted'] as const)for(const [name,title] of titles)test(`${state} ${name} hero at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:844});await page.emulateMedia({reducedMotion:'reduce'});
 const {counters}=await mount(page,{run:state==='active'?started:null,questContent:{title,place_label:'FIELD TEST CHECKPOINT'}});
 await page.getByRole('button',{name:'QUESTS',exact:true}).click();await page.locator('.quest-row').click();
 await page.evaluate(()=>document.fonts.ready);
 await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
 const metrics=await page.evaluate(()=>{
  const box=(selector:string)=>{const b=document.querySelector(selector)!.getBoundingClientRect();return{x:b.x,y:b.y,width:b.width,height:b.height,bottom:b.bottom,right:b.right};};
  const title=document.querySelector('.quest-poster-title')!,style=getComputedStyle(title);
  const chips=Array.from(document.querySelectorAll('.quest-facts > span')).map(el=>{const b=el.getBoundingClientRect();return{x:b.x,y:b.y,right:b.right,bottom:b.bottom,width:b.width,height:b.height,border:getComputedStyle(el).borderTopWidth};});
  const back=box('.quest-back'),tabs=box('.content-switch');
  return {height:tabs.y-back.y,back,tabs,heading:box('.quest-heading'),title:box('.quest-poster-title'),font:parseFloat(style.fontSize),lineHeight:parseFloat(style.lineHeight),lines:document.querySelectorAll('.quest-title-line').length,sticker:box('.quest-title-sticker'),state:box('.quest-state'),chips,dock:box('.quest-dock'),nav:document.querySelector('nav')?box('nav'):null,canvas:box('.zone-map-canvas'),overflow:document.documentElement.scrollWidth>innerWidth};
 });
 expect(metrics.overflow).toBe(false);expect(metrics.title.right).toBeLessThanOrEqual(width);
 expect(metrics.sticker.x).toBeGreaterThanOrEqual(0);expect(metrics.sticker.right).toBeLessThanOrEqual(width);
 for(let i=1;i<metrics.chips.length;i++)expect(metrics.chips[i].x).toBeGreaterThan(metrics.chips[i-1].right);
 expect(metrics.tabs.y).toBeGreaterThan(metrics.chips[0].bottom);
 await expect(page.getByRole('button',{name:state==='active'?'CHECK IN':'START QUEST',exact:true})).toBeInViewport({ratio:1});
 if(state==='active')await expect(page.locator('.quest-idle-ring')).toHaveCount(1);
 const file=`${width}-${state}-${name}`;mkdirSync(artifacts,{recursive:true});
 if(phase==='after'){
  expect(metrics.font).toBeLessThanOrEqual(72);
  expect(metrics.lineHeight/metrics.font).toBeCloseTo(.9,2);
  expect(metrics.tabs.y-Math.max(...metrics.chips.map(c=>c.bottom))).toBeGreaterThanOrEqual(8);
  for(const chip of metrics.chips)expect(chip.border).toBe('3px');
 }
 if(phase==='after'){expect(metrics.nav).toBeNull();expect(metrics.dock.bottom).toBe(844);}
 writeFileSync(`${artifacts}/${file}-${phase}.json`,JSON.stringify(metrics,null,2));
 await page.screenshot({path:`${artifacts}/${file}-${phase}.png`});
 if(width===390)await page.screenshot({path:`${artifacts}/${file}-${phase}-crop.png`,clip:{x:0,y:Math.floor(metrics.back.y),width,height:Math.ceil(metrics.tabs.bottom-metrics.back.y+2)}});
 expect(counters.gps).toBe(0);expect(counters.checkins).toBe(0);expect(counters.starts).toBe(0);
});
