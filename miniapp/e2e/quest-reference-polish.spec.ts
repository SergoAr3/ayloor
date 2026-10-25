import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { mount, openActive, started } from "./fixtures";
const artifacts=".visual-qa/map-density";
for(const width of [320,360,390])for(const far of [false,true])test(`${far?"far":"near"} reference geometry at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:844});await page.emulateMedia({reducedMotion:"reduce"});
 const {counters}=await mount(page,{run:started,latitude:far?40.197483:40.0021584,longitude:far?44.501342:44,accuracy:14,checkError:"You are outside the checkpoint radius",questContent:{title:"First Checkpoint",place_label:"FIELD TEST CHECKPOINT",latitude:far?40.7929:40,longitude:far?43.8465:44}});
 await openActive(page);await page.evaluate(()=>document.fonts.ready);
 await expect(page.locator(".quest-title-line")).toHaveCount(2);
 const sticker=page.locator(".quest-title-sticker");await expect(sticker).toHaveText("Checkpoint");
 await expect(sticker).toHaveCSS("background-color","rgb(24, 24, 22)");await expect(sticker).toHaveCSS("color","rgb(243, 235, 221)");
 const angle=await sticker.evaluate(el=>{const m=new DOMMatrix(getComputedStyle(el).transform);return Math.atan2(m.b,m.a)*180/Math.PI;});expect(angle).toBeCloseTo(-1.5);
 const title=await page.locator(".quest-poster-title").evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth,size:parseFloat(getComputedStyle(el).fontSize),left:el.getBoundingClientRect().left}));
 expect(title.size).toBeGreaterThanOrEqual(48);expect(title.size).toBeLessThanOrEqual(72);expect(title.scroll).toBeLessThanOrEqual(title.width+1);
 mkdirSync(artifacts,{recursive:true});await page.screenshot({path:`${artifacts}/${width}-${far?"far":"near"}-initial.png`});
 if(far) await page.getByRole("button",{name:"PLACE WHAT TO RECOGNIZE"}).click();
 await page.getByRole("button",{name:"CHECK IN",exact:true}).click();
 await expect(page.getByRole("button",{name:"MAP WHERE TO GO"})).toHaveAttribute("aria-pressed","true");
 await expect(page.locator(".result-quest-context")).toHaveCount(0);
 const dialog=page.getByRole("dialog");await expect(dialog).toBeVisible();await expect(page.getByRole("alert")).toContainText(far?"FAR FROM THE CHECKPOINT.":"NOT THERE YET.");
 await expect(page.getByRole("button",{name:"Close check-in result"})).toBeFocused();
 // Wait for the scheduled internal scroll, rather than racing its animation frame.
 await expect.poll(async()=>{
  const scroll=(await page.locator(".quest-scroll").boundingBox())!,dock=(await page.locator(".quest-dock").boundingBox())!;
  const zone=(await page.locator(".zone-boundary").boundingBox())!;
  const indicator=(await page.locator(far?".off-map-fix":".fix-label").boundingBox())!;
  return [zone,indicator].every(box=>box.y>=scroll.y-1 && box.y+box.height<=dock.y+1);
 }).toBe(true);
 const resultTop=(await page.locator(".quest-dock").boundingBox())!.y;
 // Both the zone and the explicit sample indicator remain visible above the sheet.
 for(const selector of [".zone-boundary",far?".off-map-fix":".fix-label"]){
  const box=(await page.locator(selector).boundingBox())!,scroll=(await page.locator(".quest-scroll").boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(scroll.y-1);expect(box.y+box.height).toBeLessThanOrEqual(resultTop+1);
 }
 const accuracy=page.getByRole("group",{name:"GPS accuracy from last explicit check-in sample"});
 await expect(accuracy).toHaveText("±14 MGPS SAMPLE");
 const canvas=page.locator(".zone-map-canvas");await expect(canvas).toHaveCSS("height",far?"112px":"180px");
 const scale=await page.locator(".zone-map-canvas > svg").evaluate(el=>{const m=(el as SVGSVGElement).getScreenCTM()!;return{a:m.a,d:m.d};});expect(scale.a).toBeCloseTo(1,4);expect(scale.d).toBeCloseTo(1,4);
 for(const [selector,size] of [[".schematic-caption","9.5px"],[far?".off-map-caption":".fix-label","12.5px"],[far?".off-map-distance":".fix-distance","22px"]])await expect(page.locator(selector)).toHaveCSS("font-size",size);
 const tabs=(await page.locator(".content-switch").boundingBox())!;
 expect(tabs.y).toBeGreaterThanOrEqual(11);expect(tabs.y+tabs.height).toBeLessThanOrEqual(resultTop);
 await expect(page.locator(".marquee")).toHaveCount(0);
 await expect(page.locator(".quest-content")).toHaveCSS("scroll-margin-top","12px");
 if(!far){
  const point=(await page.locator(".fix-dot").boundingBox())!,map=(await canvas.boundingBox())!,label=(await page.locator(".fix-label").boundingBox())!;
  expect(point.x-map.x).toBeGreaterThanOrEqual(24);expect(point.y-map.y).toBeGreaterThanOrEqual(24);
  expect(map.x+map.width-point.x-point.width).toBeGreaterThanOrEqual(24);expect(map.y+map.height-point.y-point.height).toBeGreaterThanOrEqual(24);
  expect(label.y).toBeGreaterThan(point.y+point.height);
 }else{
  await expect(page.locator(".off-map-arrow")).toHaveAttribute("data-direction","horizontal-left");
  const line=await page.locator(".broken-fix-line").getAttribute("d");expect(line).toMatch(/^M[\d.]+ [\d.]+H[\d.]+ M[\d.]+ [\d.]+H32$/);
 }
 const link=page.locator(".map-footer-main .map-link");await expect(link).toHaveCSS("font-size","11px");await expect(link).toHaveCSS("letter-spacing","1.32px");
 expect(await page.evaluate(()=>scrollY)).toBe(0);
 const metrics=await page.locator(".result-metrics > div").evaluateAll(els=>els.map(el=>{const b=el.getBoundingClientRect();return{top:b.top,bottom:b.bottom};}));
 expect(metrics[0].top).toBe(metrics[1].top);expect(metrics[0].bottom).toBe(metrics[1].bottom);
 for(const label of await page.locator(".result-metrics span").all()){
  expect(await label.evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(11);
  expect(await label.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
 }
 if(far){
  const secondary=dialog.getByRole("button",{name:"TRY AGAIN"});await expect(secondary.locator("svg")).toHaveCount(0);
  const style=await secondary.evaluate(el=>{const s=getComputedStyle(el);return{font:s.fontFamily,size:s.fontSize,border:s.borderTopWidth,shadow:s.boxShadow};});
  expect(style.font).toContain("Barlow Condensed");expect(style.size).toBe("28px");expect(style.border).toBe("3px");expect(style.shadow).toContain("5px 5px");
  const positions=await page.locator(".zone-map-canvas > svg").evaluate(svg=>{
   const zone=svg.querySelector(".zone-boundary")!.getBoundingClientRect(),frame=svg.getBoundingClientRect();
   return {ratio:((zone.left+zone.right)/2-frame.left)/frame.width,zoneLeft:zone.left,right:Math.max(...[".off-map-distance",".off-map-caption",".off-map-arrow"].map(sel=>svg.querySelector(sel)!.getBoundingClientRect().right))};
  });expect(positions.ratio).toBeCloseTo(.68,2);expect(positions.right).toBeLessThan(positions.zoneLeft);
 }else await expect(page.locator(".zone-map-canvas > svg")).not.toContainText("NOT TO SCALE");
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 mkdirSync(artifacts,{recursive:true});await page.screenshot({path:`${artifacts}/${width}-${far?"far":"near"}-result.png`});
 const before={...counters};await page.getByRole("button",{name:"Close check-in result"}).click();await expect(dialog).toHaveCount(0);
 await expect(page.getByRole("button",{name:"CHECK IN",exact:true})).toBeFocused();
 await expect(page.locator(".checkpoint-caption strong")).toHaveText("FIELD TEST CHECKPOINT");
 await expect(page.locator(".map-footer-main .map-link")).toBeVisible();
 await expect(page.locator(".last-fix-accuracy")).toHaveText("±14 M");
 expect(counters).toEqual(before);expect(counters.gps).toBe(1);expect(counters.checkins).toBe(1);
 await page.screenshot({path:`${artifacts}/${width}-${far?"far":"near"}-dismissed.png`});
});
for(const width of [320,360,390])test(`long word title fits at ${width}px and null place label is omitted`,async({page})=>{
 await page.setViewportSize({width,height:844});
 const {counters}=await mount(page,{run:started,questContent:{title:"Extraordinarycheckpoint Vernissage Market",place_label:null}});await openActive(page);await page.evaluate(()=>document.fonts.ready);
 const title=page.locator(".quest-poster-title");
 await expect(title).toHaveAttribute("aria-label","Extraordinarycheckpoint Vernissage Market");
 expect(await title.evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBe(48);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 for(const line of await title.locator(".quest-title-line").all())expect((await line.boundingBox())!.x+(await line.boundingBox())!.width).toBeLessThanOrEqual(width);
 await expect(page.locator(".quest-title-sticker")).toHaveCount(1);await expect(page.locator(".checkpoint-caption")).toHaveCount(0);
 await expect(page.locator(".map-footer-main .map-link")).toHaveCount(1);expect(counters.gps).toBe(0);expect(counters.checkins).toBe(0);
});

for(const width of [320,360,390])test(`multi-quest context and safe header at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:844});await page.emulateMedia({reducedMotion:"reduce"});
 const quest={id:"q",title:"Blue Mosque",description:"Fixture",base_xp:175,radius_m:100,latitude:40.7929,longitude:43.8465,place_label:"FIELD TEST CHECKPOINT",run:started};
 const quests=[quest,...["Republic Square","Cascade","Vernissage Market","First Checkpoint"].map((title,i)=>({...quest,id:`other-${i}`,title,run:null}))];
 const {counters}=await mount(page,{run:started,quests,latitude:40.197483,longitude:44.501342,accuracy:19,checkError:"You are outside the checkpoint radius"});await openActive(page);
 await page.evaluate(()=>{document.documentElement.style.setProperty("--tg-safe-area-inset-top","16px");document.documentElement.style.setProperty("--tg-content-safe-area-inset-top","8px");document.documentElement.style.setProperty("--tg-safe-area-inset-bottom","24px");return document.fonts.ready;});
 await page.getByRole("button",{name:"PLACE WHAT TO RECOGNIZE"}).click();await page.getByRole("button",{name:"CHECK IN",exact:true}).click();
 const context=page.locator(".result-quest-context");await expect(context).toHaveText("Blue Mosque · +175 XP");await expect(context).toHaveCSS("font-size","11px");await expect(context).toHaveCSS("color","rgb(175, 48, 28)");
 await expect.poll(async()=>{
  const tabs=(await page.locator(".content-switch").boundingBox())!,zone=(await page.locator(".zone-boundary").boundingBox())!,indicator=(await page.locator(".off-map-fix").boundingBox())!,dock=(await page.locator(".quest-dock").boundingBox())!;
  return tabs.y>=11&&[tabs,zone,indicator].every(b=>b.y+b.height<=dock.y);
 }).toBe(true);
 await expect(page.getByRole("group",{name:"GPS accuracy from last explicit check-in sample"})).toHaveText("±19 MGPS SAMPLE");
 const before={...counters};await page.screenshot({path:`${artifacts}/${width}-multi-far-result.png`});await page.getByRole("button",{name:"Close check-in result"}).click();expect(counters).toEqual(before);expect(counters.gps).toBe(1);expect(counters.checkins).toBe(1);
 await expect(page.locator(".last-fix-accuracy")).toHaveText("±19 M");
 await page.screenshot({path:`${artifacts}/${width}-multi-far-dismissed.png`});
});

test("map shrinks with viewport height while text keeps CSS pixel sizes",async({page})=>{
 await page.setViewportSize({width:390,height:640});await mount(page,{run:started,latitude:40.0021584,checkError:"You are outside the checkpoint radius"});await openActive(page);
 await page.getByRole("button",{name:"CHECK IN",exact:true}).click();await page.getByRole("button",{name:"Close check-in result"}).click();
 expect(await page.locator(".zone-map-canvas").evaluate(el=>el.getBoundingClientRect().height)).toBeCloseTo(160,1);
 await expect(page.locator(".fix-label")).toHaveCSS("font-size","12.5px");await expect(page.locator(".fix-distance")).toHaveCSS("font-size","22px");await expect(page.locator(".schematic-caption")).toHaveCSS("font-size","9.5px");
 await page.setViewportSize({width:320,height:844});await expect(page.locator(".zone-map-canvas")).toHaveCSS("height","180px");await expect(page.locator(".fix-distance")).toHaveCSS("font-size","22px");
});
