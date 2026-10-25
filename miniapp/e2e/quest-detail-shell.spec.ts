import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { mount, openActive, started } from "./fixtures";
const artifacts=".visual-qa/quest-detail-shell";
for(const width of [320,360,390])for(const height of [640,740,844])for(const active of [true,false])test(`${active?'active':'unstarted'} detail first fold ${width}x${height}`,async({page})=>{
 await page.setViewportSize({width,height});await page.emulateMedia({reducedMotion:'reduce'});
 const description='Last content block that must remain reachable. '+ 'Stay on public paths and respect the checkpoint location. '.repeat(12);
 const {counters}=await mount(page,{run:active?started:null,questContent:{title:'Blue Mosque',place_label:'FIELD TEST CHECKPOINT',description}});
 await page.getByRole('button',{name:'QUESTS',exact:true}).click();await page.locator('.quest-row').click();
 await page.evaluate(()=>{document.documentElement.style.setProperty('--tg-safe-area-inset-top','16px');document.documentElement.style.setProperty('--tg-content-safe-area-inset-top','8px');document.documentElement.style.setProperty('--tg-safe-area-inset-bottom','24px');return document.fonts.ready;});
 await expect(page.getByRole('navigation')).toHaveCount(0);await expect(page.locator('.marquee')).toHaveCount(0);
 await expect(page.locator('.quest-scroll > .quest-detail-header')).toHaveCount(1);
 const action=page.getByRole('button',{name:active?'CHECK IN':'START QUEST',exact:true});await expect(action).toBeInViewport({ratio:1});
 await expect.poll(async()=>{
  const dock=(await page.locator('.quest-dock').boundingBox())!,map=(await page.locator('.zone-map-canvas').boundingBox())!,title=(await page.locator('.quest-poster-title').boundingBox())!;
  return title.y>=0&&map.y+map.height<=dock.y&&Math.abs(dock.y+dock.height-height)<1;
 }).toBe(true);
 await expect.poll(async()=>{const padding=await page.locator('.quest-scroll').evaluate(el=>parseFloat(getComputedStyle(el).paddingBottom));return padding-(await page.locator('.quest-dock').boundingBox())!.height;}).toBeCloseTo(16,0);
 const dock=(await page.locator('.quest-dock').boundingBox())!;
 const initial=(await page.locator('.quest-detail-header').boundingBox())!,button=(await action.boundingBox())!;
 await page.locator('.quest-scroll').evaluate(el=>{el.scrollTop=el.scrollHeight;});
 const moved=(await page.locator('.quest-detail-header').boundingBox())!;expect(moved.y).toBeLessThan(initial.y-30);
 const last=(await page.getByText(description,{exact:true}).boundingBox())!;
 expect(last.y+last.height).toBeLessThanOrEqual(dock.y-15);expect((await action.boundingBox())!.y).toBe(button.y);
 expect(await page.evaluate(()=>scrollY)).toBe(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.locator('.quest-scroll').evaluate(el=>{el.scrollTop=0;});
 mkdirSync(artifacts,{recursive:true});await page.screenshot({path:`${artifacts}/${width}-${height}-${active?'active':'unstarted'}.png`});
 await page.getByRole('button',{name:'ALL QUESTS',exact:true}).click();await expect(page.getByRole('navigation')).toBeVisible();await expect(page.locator('.marquee')).toHaveCount(1);
 await page.getByRole('button',{name:'TEAM',exact:true}).click();await expect(page.locator('.marquee')).toHaveCount(0);await page.getByRole('button',{name:'HOME',exact:true}).click();await expect(page.locator('.marquee')).toHaveCount(1);
 expect(counters.gps).toBe(0);expect(counters.starts).toBe(0);expect(counters.checkins).toBe(0);
});
for(const width of [320,360,390])test(`far strip, nonbreaking last check-in and resized viewport at ${width}`,async({page})=>{
 await page.setViewportSize({width,height:740});await page.emulateMedia({reducedMotion:'reduce'});await page.clock.install();
 const {counters}=await mount(page,{run:started,latitude:40+86310/6371000*180/Math.PI,accuracy:18,checkError:'You are outside the checkpoint radius',questContent:{title:'Blue Mosque'}});await openActive(page);
 await page.getByRole('button',{name:'CHECK IN',exact:true}).click();await page.getByRole('button',{name:'Close check-in result'}).click();
 await expect(page.locator('.zone-map-canvas')).toHaveCSS('height','112px');
 expect(await page.locator('.last-fix-distance').textContent()).toBe('86.3\u00a0KM');expect(await page.locator('.last-fix-accuracy').textContent()).toBe('±18\u00a0M');
 for(const age of ['JUST NOW','14 MIN AGO']){
  if(age.startsWith('14'))await page.clock.runFor(14*60000);
  await expect(page.locator('.last-fix-age')).toHaveText(age);
  await page.locator('.zone-map figcaption').scrollIntoViewIfNeeded();
  for(const selector of ['.last-fix > span','.last-fix > small'])expect(await page.locator(selector).evaluate(el=>{const r=document.createRange();r.selectNodeContents(el);return new Set(Array.from(r.getClientRects()).map(b=>Math.round(b.top))).size;})).toBe(1);
 }
 await page.setViewportSize({width,height:640});await expect(page.getByRole('button',{name:'CHECK IN',exact:true})).toBeInViewport({ratio:1});
 await page.locator('.zone-map').scrollIntoViewIfNeeded();mkdirSync(artifacts,{recursive:true});await page.screenshot({path:`${artifacts}/${width}-far-last-check-in.png`});
 expect(counters.gps).toBe(1);expect(counters.checkins).toBe(1);expect(counters.starts).toBe(0);
});

test('long first title line is capped at 56px in read-only detail too',async({page})=>{
 await page.setViewportSize({width:390,height:740});const {counters}=await mount(page,{run:{id:'r',status:'completed'},questContent:{title:'Vernissage'}});
 await page.getByRole('button',{name:'QUESTS',exact:true}).click();await page.locator('.quest-row').click();await page.evaluate(()=>document.fonts.ready);
 await expect(page.locator('.quest-title-line').first()).toHaveText('Vernissage');await expect(page.locator('.quest-poster-title')).toHaveCSS('font-size','56px');
 await expect(page.getByRole('navigation')).toHaveCount(0);await expect(page.getByRole('button',{name:'BACK TO QUESTS',exact:true})).toBeVisible();
 expect(counters.gps).toBe(0);expect(counters.checkins).toBe(0);
});

test('open result follows dynamic viewport and padding-only safe-area changes',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});
 const {counters}=await mount(page,{run:started,latitude:40.8,accuracy:18,checkError:'You are outside the checkpoint radius',questContent:{title:'Blue Mosque'}});await openActive(page);
 await page.getByRole('button',{name:'CHECK IN',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();
 await page.setViewportSize({width:390,height:640});await page.evaluate(()=>{document.documentElement.style.setProperty('--tg-safe-area-inset-bottom','34px');document.documentElement.style.setProperty('--tg-content-safe-area-inset-bottom','8px');});
 await expect.poll(async()=>{const padding=await page.locator('.quest-scroll').evaluate(el=>parseFloat(getComputedStyle(el).paddingBottom));return padding-(await page.locator('.quest-dock').boundingBox())!.height;}).toBeCloseTo(16,0);
 await expect.poll(async()=>{const zone=(await page.locator('.zone-boundary').boundingBox())!,dock=(await page.locator('.quest-dock').boundingBox())!;return zone.y+zone.height<=dock.y&&Math.abs(dock.y+dock.height-640)<1;}).toBe(true);
 const before={...counters};await page.getByRole('button',{name:'Close check-in result'}).click();await expect(page.getByRole('button',{name:'CHECK IN',exact:true})).toBeFocused();expect(counters).toEqual(before);
});
