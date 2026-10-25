import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { mount, openActive, started } from "./fixtures";

const artifacts = process.env.AYLOOR_TIMELINE_DIR || ".visual-qa/reward-timeline";
const content = ["claimed", "title", "check", "xp", "caption", "team", "cta"] as const;
type State = { transform: string; opacity: number; scale: number; angle: number; x: number; y: number };
type Key = typeof content[number];
type Frame = { ms: number; states: Record<Key | "burst" | "ambient" | "halftone", State>; ctaHit: boolean; ctaEnabled: boolean; layout: number[] };
type Log = { frames: Frame[]; ends: { name: string; target: string; ms: number }[]; iterations: string[]; done: boolean };
function final(state: State) {
  return state.opacity === 1 && state.scale === 1 && state.angle === 0 && state.x === 0 && state.y === 0;
}
function summary(log: Log) {
  const stableAt = Object.fromEntries(content.map(key => {
    // A transient crossing through scale=1 during overshoot is not a settled state.
    const lastMoving = log.frames.reduce((last, frame, index) => final(frame.states[key]) ? last : index, -1);
    return [key, log.frames[lastMoving + 1]?.ms ?? null];
  })) as Record<Key, number | null>;
  const samples = [0,150,250,400,600,800,1000,1050,1100,1200,2000].map(target => ({ targetMs: target,
    ...log.frames.reduce((a,b) => Math.abs(a.ms-target) < Math.abs(b.ms-target) ? a : b) }));
  return { stableAt, samples, ends: log.ends, frameCount: log.frames.length };
}

for (const reduced of [false,true]) test(`Quest Complete actual timeline and final deadlines; reduced=${reduced}`, async ({ page }) => {
  await page.setViewportSize({ width:390, height:844 });
  await page.emulateMedia({ reducedMotion:reduced ? "reduce" : "no-preference" });
  const { counters } = await mount(page,{ run:started }); await openActive(page);
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => {
    const target = window as typeof window & { rewardTimeline: Log };
    const log: Log = { frames:[], ends:[], iterations:[], done:false }; target.rewardTimeline = log;
    let origin = 0;
    const selectors = { claimed:".completion > .confirmed", title:".completion h1", check:".completion-check", xp:".xp", caption:".completion-quest-title", team:".completion-team", cta:".completion-actions", burst:".reward-sunburst", ambient:".reward-sunburst-rays", halftone:".reward-halftone" };
    const observer = new MutationObserver(() => {
      if (!document.querySelector(".quest-complete-view")) return;
      observer.disconnect(); origin=performance.now();
      document.addEventListener("animationend", event => {
        if (event.animationName.startsWith("completion-")) log.ends.push({name:event.animationName,target:(event.target as HTMLElement).className,ms:performance.now()-origin});
      });
      document.addEventListener("animationiteration", event => {
        if (event.animationName.startsWith("completion-")) log.iterations.push(event.animationName);
      });
      function sample() {
        const states = Object.fromEntries(Object.entries(selectors).map(([key,selector]) => {
          const style=getComputedStyle(document.querySelector(selector)!);
          const matrix=new DOMMatrixReadOnly(style.transform === "none" ? undefined : style.transform);
          return [key,{transform:style.transform,opacity:Number(style.opacity),scale:Math.hypot(matrix.a,matrix.b),angle:Math.atan2(matrix.b,matrix.a)*180/Math.PI,x:matrix.m41,y:matrix.m42}];
        })) as Frame["states"];
        const button=document.querySelector<HTMLButtonElement>(".completion-actions .action")!;
        const bounds=button.getBoundingClientRect(), hit=document.elementFromPoint(bounds.x+bounds.width/2,bounds.y+bounds.height/2);
        const layout=[".completion-heading",".xp",".completion-team",".completion-actions",".brand","nav"].flatMap(selector=>{
          const el=document.querySelector<HTMLElement>(selector)!;return [el.offsetTop,el.offsetWidth,el.offsetHeight];
        });
        log.frames.push({ms:performance.now()-origin,states,ctaHit:hit===button || button.contains(hit),ctaEnabled:!button.disabled,layout});
        if (performance.now()-origin<2100) requestAnimationFrame(sample); else log.done=true;
      }
      sample();
    });
    observer.observe(document.body,{childList:true,subtree:true});
  });
  await page.getByRole("button",{name:"CHECK IN",exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>(window as typeof window & {rewardTimeline:Log}).rewardTimeline.done)).toBe(true);
  const log=await page.evaluate(()=>(window as typeof window & {rewardTimeline:Log}).rewardTimeline);
  const measurements=summary(log);
  mkdirSync(artifacts,{recursive:true});
  writeFileSync(`${artifacts}/${reduced ? "reduced" : "moving"}.json`,JSON.stringify({measurements,log},null,2));
  expect(log.frames.length).toBeGreaterThan(50);
  expect(log.frames.every(f=>JSON.stringify(f.layout)===JSON.stringify(log.frames[0].layout))).toBe(true);
  if (reduced) {
    for (const frame of log.frames) {
      for (const key of content) expect(final(frame.states[key]),key).toBe(true);
      for (const key of ["burst","ambient","halftone"] as const) expect(frame.states[key]).toEqual(log.frames[0].states[key]);
      expect(frame.ctaHit && frame.ctaEnabled).toBe(true);
    }
    expect(log.ends).toEqual([]);expect(log.iterations).toEqual([]);
  } else if (!process.env.AYLOOR_TIMELINE_MEASURE_ONLY) {
    expect(measurements.stableAt.team).not.toBeNull(); expect(measurements.stableAt.team!).toBeLessThanOrEqual(900);
    expect(measurements.stableAt.cta).not.toBeNull(); expect(measurements.stableAt.cta!).toBeLessThanOrEqual(1100);
    for (const key of content) expect(measurements.stableAt[key]!,key).toBeLessThanOrEqual(1100);
    const at250=measurements.samples.find(f=>f.targetMs===250)!;
    expect(at250.states.burst.opacity).toBeGreaterThan(.8);
    expect(at250.states.title.opacity).toBeGreaterThan(.5);expect(at250.states.claimed.opacity).toBeGreaterThan(.5);
    const at600=measurements.samples.find(f=>f.targetMs===600)!;
    expect(Math.abs(at600.states.check.scale-1)).toBeLessThan(.025);expect(at600.states.check.opacity).toBeGreaterThan(.99);
    expect(at600.states.xp.opacity).toBeGreaterThan(.99);
    expect(at600.states.xp.scale).toBeLessThan(1.12);
    const next=log.frames.find(f=>f.ms>=650)!;
    expect(next.states.xp.scale).toBeLessThan(at600.states.xp.scale); // Descending final settle, not an unfinished slam.
    const at1050=measurements.samples.find(f=>f.targetMs===1050)!;
    // A 60Hz sample nearest 1050ms can precede that timestamp by one frame.
    expect(at1050.states.cta.opacity).toBeGreaterThan(.995);expect(Math.abs(at1050.states.cta.y)).toBeLessThan(.1);expect(at1050.ctaHit && at1050.ctaEnabled).toBe(true);
    const settled = log.frames.filter(f=>f.ms>=1200);
    for (const frame of settled) for (const key of content) {
      expect(final(frame.states[key]),key).toBe(true);
      expect(frame.states[key],key).toEqual(settled[0].states[key]);
    }
    const early=log.frames.find(f=>f.ms>=1200)!,late=log.frames.at(-1)!;
    expect(late.states.ambient.transform).not.toBe(early.states.ambient.transform);
    expect(late.states.halftone.transform).not.toBe(early.states.halftone.transform);
    expect(log.iterations).toEqual([]);
    for (const key of ["check","xp"] as const) expect(log.ends.filter(e=>e.target===(key==="check"?"completion-check":"xp"))).toHaveLength(1);
  }
  await page.getByRole("button",{name:"VIEW LEADERBOARD",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Ranks."})).toBeVisible();
  expect(counters.starts).toBe(0);expect(counters.gps).toBe(1);expect(counters.checkins).toBe(1);
});
