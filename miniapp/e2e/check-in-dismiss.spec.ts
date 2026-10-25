import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { mount, openActive, started, type Options } from "./fixtures";
import type { Quest } from "../src/types";

const outside = "You are outside the checkpoint radius";
const far: Options = { run:started, latitude:40.197483, longitude:44.501342, accuracy:14, seasonXp:300,
  questContent:{title:"Blue Mosque",latitude:40.7929,longitude:43.8465}, checkError:outside };
const artifacts = ".visual-qa/far-check-in";
for (const width of [320,360,390]) test(`outside close preserves last fix without GPS/API at ${width}px`, async ({page})=>{
  await page.setViewportSize({width,height:844});await page.emulateMedia({reducedMotion:"reduce"});
  const {counters}=await mount(page,far);await openActive(page);
  await page.evaluate(()=>{document.documentElement.style.setProperty("--tg-safe-area-inset-bottom","24px");return document.fonts.ready;});
  await expect(page.locator(".fix-label")).toHaveCount(0);
  await page.getByRole("button",{name:"CHECK IN",exact:true}).click();
  const alert=page.getByRole("alert"),close=page.getByRole("button",{name:"Close check-in result"});
  await expect(alert).toContainText("FAR FROM THE CHECKPOINT.");await expect(page.locator(".outside-distance strong")).toHaveText("86.3 KM");
  await expect(page.locator(".result-metrics")).toContainText("±14 M");
  await expect(page.locator(".outside-distance span")).toHaveText("FROM CHECKPOINT");
  await expect(alert).toContainText("Your location was about 86.3 km away.");
  const maps=page.getByRole("region",{name:"Quest check-in"}).getByRole("link",{name:"OPEN IN MAPS"});
  await expect(maps).toHaveAttribute("href",/40.7929.*43.8465/);
  await expect(maps).toBeInViewport({ratio:1});
  await expect(page.getByRole("button",{name:"TRY AGAIN",exact:true})).toHaveClass(/secondary/);
  const cb=(await close.boundingBox())!,title=await alert.locator("strong").evaluate(el=>{const range=document.createRange();range.selectNodeContents(el);const b=range.getBoundingClientRect();return{x:b.x,y:b.y,right:b.right,bottom:b.bottom};});
  expect(cb.width).toBeGreaterThanOrEqual(44);expect(cb.height).toBeGreaterThanOrEqual(44);
  expect(title.right).toBeLessThanOrEqual(cb.x);
  const retry=(await page.getByRole("button",{name:"TRY AGAIN",exact:true}).boundingBox())!,nav={y:844};
  await expect(page.getByRole("navigation")).toHaveCount(0);
  expect(retry.y+retry.height).toBeLessThanOrEqual(nav.y);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  // Clicking the dimmed quest content must not dismiss the result.
  const scroll=(await page.locator(".quest-scroll").boundingBox())!;await page.mouse.click(scroll.x+5,scroll.y+5);await expect(alert).toBeVisible();
  mkdirSync(artifacts,{recursive:true});await page.screenshot({path:`${artifacts}/${width}-outside.png`});
  const before={...counters};await close.click();
  await expect(alert).toHaveCount(0);await expect(page.getByRole("button",{name:"CHECK IN",exact:true})).toBeFocused();
  await expect(page.getByText("QUEST ACTIVE",{exact:true})).toBeVisible();await expect(page.locator(".result-screen")).toHaveCount(0);
  await expect(page.locator(".fix-dot")).toHaveCount(0);await expect(page.locator(".off-map-arrow")).toBeVisible();
  await expect(page.locator(".zone-boundary")).toHaveCount(1);await expect(page.locator(".checkpoint-dot")).toHaveCount(1);
  await expect(page.locator(".last-fix > span")).toHaveText("LAST CHECK-IN · 86.3 KM FROM CHECKPOINT");
  await expect(page.locator(".last-fix > small")).toHaveText("GPS ±14 M · JUST NOW · NOT A LIVE POSITION");
  await expect(page.locator(".check-in-action .last-check-in")).toHaveCount(0);
  await expect(page.getByText(/Distance at last check-in/)).toHaveCount(0);
  const edge=await page.locator(".broken-fix-line").getAttribute("d");
  expect(edge!.match(/M/g)).toHaveLength(2);await expect(page.locator(".fix-break")).toBeVisible();
  await expect(page.locator(".outside-distance span")).toHaveCount(0);
  await page.waitForTimeout(150);expect(counters).toEqual(before);expect(counters.gps).toBe(1);expect(counters.checkins).toBe(1);expect(counters.starts).toBe(0);
  await page.screenshot({path:`${artifacts}/${width}-dismissed.png`});writeFileSync(`${artifacts}/${width}.json`,JSON.stringify({close:cb,title,retry,nav,edge,before,after:counters},null,2));
  await page.getByRole("button",{name:"ALL QUESTS",exact:true}).click();await page.getByRole("navigation").getByRole("button",{name:"RANKS",exact:true}).click();await expect(page.locator(".ranking .own")).toContainText("300 XP");
});

const errors: [string,Options,string][] = [
  ["poor accuracy",{accuracy:300,checkError:"GPS accuracy is too low; retry with a clearer view of the sky"},"GPS ACCURACY TOO LOW"],
  ["missing accuracy",{checkError:"GPS accuracy is unavailable. Please retry outdoors."},"GPS ACCURACY UNAVAILABLE"],
  ["denied",{denied:true},"LOCATION ACCESS DENIED"],
  ["unavailable",{unavailable:true},"GPS UNAVAILABLE"],
  ["timeout",{timeout:true},"CHECK-IN TIMED OUT"],
  ["server",{checkError:"Unable to verify checkpoint right now",checkErrorStatus:503},"CHECK-IN FAILED"],
];
for (const [kind,options,title] of errors) test(`local ${kind} result can close without another attempt`,async({page})=>{
  await page.emulateMedia({reducedMotion:"reduce"});const {counters}=await mount(page,{run:started,...options});await openActive(page);
  if(kind==="timeout")await page.clock.install();
  await page.getByRole("button",{name:"CHECK IN",exact:true}).click();
  if(kind==="timeout"){await expect.poll(()=>counters.gps).toBe(1);await page.clock.fastForward(35000);await page.clock.resume();}
  await expect(page.getByRole("alert")).toContainText(title);const before={...counters};
  await page.getByRole("button",{name:"Close check-in result"}).click();
  await expect(page.getByRole("alert")).toHaveCount(0);await expect(page.getByRole("button",{name:"CHECK IN",exact:true})).toBeFocused();
  expect(counters).toEqual(before);await expect(page.getByText("QUEST ACTIVE",{exact:true})).toBeVisible();
  if(kind === "server"){
    const label=(await page.locator(".fix-label").boundingBox())!,dot=(await page.locator(".fix-dot").boundingBox())!;
    expect(label.y).toBeGreaterThan(dot.y+dot.height);
  }
});
for (const key of ["Enter","Space"]) test(`close result supports ${key} and restores CHECK IN focus`,async({page})=>{
  await page.emulateMedia({reducedMotion:"reduce"});const {counters}=await mount(page,{run:started,latitude:40.0030577,checkError:outside});await openActive(page);
  await page.getByRole("button",{name:"CHECK IN",exact:true}).click();const close=page.getByRole("button",{name:"Close check-in result"});
  await close.focus();await page.keyboard.press(key);await expect(page.getByRole("button",{name:"CHECK IN",exact:true})).toBeFocused();expect(counters.gps).toBe(1);expect(counters.checkins).toBe(1);
});

test("TRY AGAIN clears old fix and uses only the new explicit sample",async({page})=>{
  await page.emulateMedia({reducedMotion:"reduce"});const {counters}=await mount(page,{run:started,latitude:40.0030577,checkError:outside});await openActive(page);
  await page.getByRole("button",{name:"CHECK IN",exact:true}).click();await expect(page.getByRole("alert")).toContainText("NOT THERE YET");const previous=await page.locator(".fix-dot").getAttribute("cy");
  await page.clock.install();await page.evaluate(()=>{window.Telegram!.WebApp.LocationManager!.getLocation=callback=>{fetch('/location-requested');setTimeout(()=>callback({latitude:39.996,longitude:44,horizontal_accuracy:14}),1000);};});
  await page.getByRole("button",{name:"TRY AGAIN",exact:true}).click();await expect(page.getByRole("status")).toHaveText("GETTING LOCATION…");
  await expect(page.locator(".fix-label")).toHaveCount(0);await expect(page.getByRole("button",{name:"Close check-in result"})).toHaveCount(0);
  await expect.poll(()=>counters.gps).toBe(2);expect(counters.checkins).toBe(1);
  await page.clock.fastForward(1000);await page.clock.resume();await expect(page.getByRole("alert")).toContainText("NOT THERE YET");
  expect(await page.locator(".fix-dot").getAttribute("cy")).not.toBe(previous);expect(counters.gps).toBe(2);expect(counters.checkins).toBe(2);
});

test("last fix is quest-scoped and not restored after reload",async({page})=>{
  const quest:Quest={id:"q",title:"Blue Mosque",description:"Fixture",base_xp:100,radius_m:100,latitude:40,longitude:44,run:started};
  const {counters}=await mount(page,{run:started,latitude:40.0030577,checkError:outside,quests:[quest,{...quest,id:"other",title:"Vernissage Market",run:{id:"other-run",status:"started"}}]});await openActive(page);
  await page.getByRole("button",{name:"CHECK IN",exact:true}).click();await page.getByRole("button",{name:"Close check-in result"}).click();await expect(page.locator(".fix-label")).toBeVisible();
  await page.getByRole("button",{name:"ALL QUESTS",exact:true}).click();await page.locator(".quest-row").filter({hasText:"Vernissage Market"}).click();
  await expect(page.locator(".fix-label")).toHaveCount(0);
  await page.getByRole("button",{name:"ALL QUESTS",exact:true}).click();await page.locator(".quest-row").filter({hasText:"Blue Mosque"}).click();
  await expect(page.locator(".fix-label")).toHaveCount(0); // Reopening clears stale fixes.
  await page.reload();await openActive(page);await expect(page.locator(".fix-label")).toHaveCount(0);expect(counters.gps).toBe(1);expect(counters.checkins).toBe(1);
});

test("no result close is offered while location/verification is running",async({page})=>{
  let release!:()=>void;const verificationWait=new Promise<void>(resolve=>release=resolve);
  await mount(page,{run:started,locationDelay:700,verificationWait,checkError:outside});await openActive(page);
  await page.getByRole("button",{name:"CHECK IN",exact:true}).click();await expect(page.getByRole("status")).toHaveText("GETTING LOCATION…");
  await expect(page.getByRole("button",{name:"Close check-in result"})).toHaveCount(0);await expect(page.locator(".radar-ping i")).toHaveCount(3);
  await expect(page.getByRole("status")).toHaveText("VERIFYING CHECKPOINT…");await expect(page.getByRole("button",{name:"Close check-in result"})).toHaveCount(0);
  release();await expect(page.getByRole("button",{name:"Close check-in result"})).toBeVisible();
});

for (const width of [320,360,390]) test(`near miss keeps real fix and zone distance at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:844});await page.emulateMedia({reducedMotion:"reduce"});
  const {counters}=await mount(page,{run:started,latitude:40.0021584,accuracy:14,checkError:outside});await openActive(page);
  await page.getByRole("button",{name:"CHECK IN",exact:true}).click();
  await expect(page.locator(".outside-distance")).toContainText("240 M");
  await expect(page.locator(".outside-distance")).toContainText("FROM CHECKPOINT");
  await expect(page.getByRole("alert")).toContainText("Walk closer and try again");
  await expect(page.getByRole("region",{name:"Quest check-in"}).getByRole("link")).toHaveCount(0);
  await page.screenshot({path:`${artifacts}/${width}-near-result.png`});
  await page.getByRole("button",{name:"Close check-in result"}).click();
  await expect(page.locator(".fix-dot")).toBeVisible();await expect(page.locator(".off-map-arrow")).toHaveCount(0);
  const geometry=await page.locator(".fix-label").evaluate(el=>{
    const label=el.getBoundingClientRect(),map=el.closest("svg")!.getBoundingClientRect();
    const caption=el.closest("svg")!.querySelector(".schematic-caption")!.getBoundingClientRect();
    return {bottomGap:map.bottom-label.bottom,captionGap:caption.top-label.bottom};
  });
  expect(geometry.bottomGap).toBeGreaterThanOrEqual(20);expect(geometry.captionGap).toBeGreaterThan(0);
  expect(await page.locator(".zone-boundary").evaluate(el=>getComputedStyle(el).strokeWidth)).toBe("3px");
  expect(await page.locator(".last-fix small").evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(12);
  await page.screenshot({path:`${artifacts}/${width}-near-dismissed.png`});
  expect(counters.gps).toBe(1);expect(counters.checkins).toBe(1);expect(counters.starts).toBe(0);
});

test("far OPEN IN MAPS opens checkpoint without requesting GPS or verification",async({page})=>{
  const {counters}=await mount(page,far);await openActive(page);
  await page.getByRole("button",{name:"CHECK IN",exact:true}).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  const before={...counters};
  await page.context().route("https://www.google.com/**",route=>route.fulfill({body:"Map destination"}));
  const popup=page.waitForEvent("popup");
  await page.getByRole("region",{name:"Quest check-in"}).getByRole("link",{name:"OPEN IN MAPS"}).click();
  const maps=await popup;await maps.waitForLoadState();expect(maps.url()).toContain("40.7929");await maps.close();
  expect(counters).toEqual(before);await expect(page.getByRole("alert")).toContainText("FAR FROM THE CHECKPOINT");
});

test("last fix ages locally, expires at fifteen minutes and makes no requests",async({page})=>{
  await page.clock.install();
  const {counters}=await mount(page,{run:started,latitude:40.0021584,accuracy:18,checkError:outside});await openActive(page);
  await page.getByRole("button",{name:"CHECK IN",exact:true}).click();
  await expect(page.getByRole("dialog")).toBeVisible();await expect(page.getByRole("alert")).toContainText("about 140 m outside");
  await page.getByRole("button",{name:"Close check-in result"}).click();
  await expect(page.locator(".last-fix small")).toHaveText("GPS ±18 M · JUST NOW · NOT A LIVE POSITION");
  const before={...counters};
  await page.clock.runFor(2*60000);await expect(page.locator(".last-fix small")).toHaveText("GPS ±18 M · 2 MIN AGO · NOT A LIVE POSITION");
  await page.clock.runFor(12*60000);await expect(page.locator(".last-fix small")).toHaveText("GPS ±18 M · 14 MIN AGO · NOT A LIVE POSITION");
  await page.clock.runFor(60000);await expect(page.locator(".last-fix, .fix-dot, .fix-label")).toHaveCount(0);
  await expect(page.getByRole("button",{name:"CHECK IN",exact:true})).toBeEnabled();expect(counters).toEqual(before);
});

test("dialog traps keyboard focus, Escape dismisses and page exit forgets sample",async({page})=>{
  const {counters}=await mount(page,far);await openActive(page);await page.getByRole("button",{name:"CHECK IN",exact:true}).click();
  const dialog=page.getByRole("dialog");await expect(dialog).toHaveAttribute("aria-modal","true");
  const close=dialog.getByRole("button",{name:"Close check-in result"});await expect(close).toBeFocused();
  await page.keyboard.press("Shift+Tab");await expect(dialog.getByRole("button",{name:"TRY AGAIN"})).toBeFocused();
  await page.keyboard.press("Tab");await expect(close).toBeFocused();
  await page.keyboard.press("Escape");await expect(dialog).toHaveCount(0);await expect(page.getByRole("button",{name:"CHECK IN",exact:true})).toBeFocused();
  const before={...counters};await page.evaluate(()=>window.dispatchEvent(new Event("pagehide")));
  await expect(page.locator(".last-fix, .off-map-fix")).toHaveCount(0);expect(counters).toEqual(before);
});

test("minute timer pauses while hidden and expires immediately on return",async({page})=>{
  await page.clock.install();const {counters}=await mount(page,far);await openActive(page);
  await page.getByRole("button",{name:"CHECK IN",exact:true}).click();await page.getByRole("button",{name:"Close check-in result"}).click();
  const before={...counters};
  await page.evaluate(()=>{Object.defineProperty(document,"hidden",{configurable:true,value:true});document.dispatchEvent(new Event("visibilitychange"));});
  await page.clock.runFor(16*60000);await expect(page.locator(".last-fix small")).toContainText("JUST NOW");
  await page.evaluate(()=>{Object.defineProperty(document,"hidden",{configurable:true,value:false});document.dispatchEvent(new Event("visibilitychange"));});
  await expect(page.locator(".last-fix, .off-map-fix")).toHaveCount(0);expect(counters).toEqual(before);
});
