import { expect, test, type Locator, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { mount, openActive, started } from "./fixtures";

const artifacts = process.env.AYLOOR_REWARD_MOTION_DIR || ".visual-qa/reward-motion";
function save(name: string, data: unknown) {
  mkdirSync(artifacts, { recursive: true });
  writeFileSync(`${artifacts}/${name}.json`, JSON.stringify(data, null, 2));
}
async function visual(locator: Locator, pseudo: string | null = null) {
  return locator.evaluate((el, pseudo) => {
    const style = getComputedStyle(el, pseudo), matrix = new DOMMatrixReadOnly(style.transform === "none" ? undefined : style.transform);
    return { at: performance.now(), transform: style.transform, scale: Math.hypot(matrix.a, matrix.b), angle: Math.atan2(matrix.b, matrix.a) * 180 / Math.PI,
      x: matrix.m41, y: matrix.m42, opacity: Number(style.opacity), animation: style.animationName, duration: style.animationDuration, iterations: style.animationIterationCount };
  }, pseudo);
}
async function complete(page: Page) {
  await page.getByRole("button", { name: "CHECK IN", exact: true }).click();
  await expect(page.locator(".xp")).toBeVisible();
}

for (const reduced of [false, true]) test(`active dot breathes without moving text or other status dots; reduced=${reduced}`, async ({ page }) => {
  await page.emulateMedia({ reducedMotion: reduced ? "reduce" : "no-preference" });
  const { counters } = await mount(page, { run: started });
  await openActive(page);
  await page.evaluate(() => document.fonts.ready);
  const dot = page.locator(".quest-live-beacon > .status-dot"), label = page.locator(".quest-state.active");
  await expect(dot).toHaveCount(1);
  const before = await visual(dot), textBefore = await visual(label), textBox = await label.boundingBox();
  await page.waitForTimeout(700); // Actual wall-time measurement, not an animation seek.
  const after = await visual(dot), textAfter = await visual(label);
  if (reduced) {
    expect(after.animation).toBe("none"); expect(after.transform).toBe(before.transform); expect(after.opacity).toBe(1);
  } else {
    expect(after.scale - before.scale).toBeGreaterThan(.08);
    expect(before.opacity - after.opacity).toBeGreaterThan(.2);
    expect(after.scale).toBeLessThanOrEqual(1.12); expect(after.opacity).toBeGreaterThanOrEqual(.7);
  }
  expect(textAfter.animation).toBe("none"); expect(textAfter.transform).toBe(textBefore.transform); expect(textAfter.opacity).toBe(1);
  expect(await label.boundingBox()).toEqual(textBox);
  await page.getByRole("button", { name: "ALL QUESTS", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Quests.", exact: true })).toBeVisible();
  await page.getByRole("navigation").getByRole("button", { name: "TEAM", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Test crew", exact: true })).toBeVisible();
  await expect(page.locator(".team-state .status-dot")).toHaveCSS("animation-name", "none");
  await mount(page);
  await page.getByRole("navigation").getByRole("button", { name: "QUESTS", exact: true }).click();
  await page.locator(".quest-row").click();
  await expect(page.locator(".quest-live-beacon")).toHaveCount(0);
  await mount(page, { run: { id: "r", status: "completed" } });
  await page.getByRole("navigation").getByRole("button", { name: "QUESTS", exact: true }).click();
  await page.locator(".quest-row").click();
  await expect(page.locator(".quest-live-beacon")).toHaveCount(0);
  expect(counters.gps).toBe(0); expect(counters.starts).toBe(0); expect(counters.checkins).toBe(0);
  save(`active-${reduced ? "reduced" : "moving"}`, { before, after, textBefore, textAfter });
});

type Frame = { at: number; burst: {scale:number; opacity:number}; circle: {scale:number; opacity:number}; title: {y:number; opacity:number}; ambient: {angle:number; scale:number}; xp: { scale: number; angle: number; y: number; opacity: number }; team: { y: number; opacity: number }; cta: { y: number; opacity: number }; texture: { x: number; y: number }; layout: number[] };
type MotionLog = { frames: Frame[]; starts: { name: string; target: string; at: number }[]; iterations: string[]; done: boolean };

async function observeEntrance(page: Page) {
  await page.evaluate(() => {
    const target = window as typeof window & { rewardMotion: MotionLog };
    target.rewardMotion = { frames: [], starts: [], iterations: [], done: false };
    const names = ["completion-burst", "completion-burst-ambient", "completion-check-pop", "completion-title-hit", "completion-stamp", "completion-reveal", "reward-halftone-drift"];
    document.addEventListener("animationiteration", event => { if (names.includes(event.animationName)) target.rewardMotion.iterations.push(event.animationName); });
    document.addEventListener("animationstart", event => {
      if (!names.includes(event.animationName)) return;
      target.rewardMotion.starts.push({ name: event.animationName, target: (event.target as HTMLElement).className, at: performance.now() });
      if (event.animationName !== "completion-burst") return;
      const start = performance.now();
      function measure(el: Element, pseudo?: string) {
        const style = getComputedStyle(el, pseudo), matrix = new DOMMatrixReadOnly(style.transform === "none" ? undefined : style.transform);
        return { scale: Math.hypot(matrix.a, matrix.b), angle: Math.atan2(matrix.b, matrix.a) * 180 / Math.PI, x: matrix.m41, y: matrix.m42, opacity: Number(style.opacity) };
      }
      function sample() {
        const xp = document.querySelector<HTMLElement>(".xp")!, team = document.querySelector<HTMLElement>(".completion-team")!, cta = document.querySelector<HTMLElement>(".completion-actions")!, nav = document.querySelector<HTMLElement>("nav")!;
        target.rewardMotion.frames.push({ at: performance.now(), burst: measure(document.querySelector(".reward-sunburst")!), circle: measure(document.querySelector(".completion-check")!), title: measure(document.querySelector(".completion h1")!), ambient: measure(document.querySelector(".reward-sunburst-rays")!), xp: measure(xp), team: measure(team), cta: measure(cta), texture: measure(document.querySelector(".reward-halftone")!),
          layout: [xp.offsetTop, xp.offsetWidth, xp.offsetHeight, team.offsetTop, team.offsetWidth, team.offsetHeight, cta.offsetTop, cta.offsetHeight, nav.getBoundingClientRect().y, document.querySelector<HTMLElement>(".completion-heading")!.offsetHeight, document.querySelector<HTMLElement>(".brand")!.offsetHeight] });
        if (performance.now() - start < 2800) requestAnimationFrame(sample);
        else target.rewardMotion.done = true;
      }
      sample();
    });
  });
}

for (const reduced of [false, true]) test(`reward stamp, stagger and texture change over wall time with stable layout; reduced=${reduced}`, async ({ page }) => {
  await page.emulateMedia({ reducedMotion: reduced ? "reduce" : "no-preference" });
  const { counters } = await mount(page, { run: started }); await openActive(page);
  await page.evaluate(() => document.fonts.ready);
  await observeEntrance(page);
  await complete(page);
  const xp = page.locator(".xp"), team = page.locator(".completion-team"), cta = page.locator(".completion-actions"), reward = page.locator(".reward-halftone");
  const initial = { burst: await visual(page.locator(".reward-sunburst")), circle: await visual(page.locator(".completion-check")), title: await visual(page.locator(".completion h1")), ambient: await visual(page.locator(".reward-sunburst-rays")), xp: await visual(xp), team: await visual(team), cta: await visual(cta), texture: await visual(reward) };
  await expect(page.getByRole("button", { name: "VIEW LEADERBOARD", exact: true })).toBeEnabled();
  if (reduced) {
    for (const element of [initial.xp, initial.team, initial.cta, initial.circle, initial.title]) { expect(element.animation).toBe("none"); expect(element.opacity).toBe(1); expect(element.y).toBe(0); }
    expect(initial.texture.animation).toBe("none"); expect(initial.burst.animation).toBe("none"); expect(initial.ambient.animation).toBe("none");
    await page.waitForTimeout(1250);
  } else await expect.poll(() => page.evaluate(() => (window as typeof window & { rewardMotion: MotionLog }).rewardMotion.done)).toBe(true);
  const log = await page.evaluate(() => (window as typeof window & { rewardMotion: MotionLog }).rewardMotion);
  const final = { burst: await visual(page.locator(".reward-sunburst")), circle: await visual(page.locator(".completion-check")), title: await visual(page.locator(".completion h1")), ambient: await visual(page.locator(".reward-sunburst-rays")), xp: await visual(xp), team: await visual(team), cta: await visual(cta), texture: await visual(reward) };
  save(`reward-${reduced ? "reduced" : "moving"}`, { initial, final, log });
  for (const element of [final.xp, final.team, final.cta]) { expect(element.y).toBe(0); expect(element.opacity).toBe(1); expect(element.scale).toBe(1); }
  if (reduced) {
    expect(log.starts).toEqual([]); expect(final.texture.transform).toBe(initial.texture.transform); expect(final.burst.transform).toBe(initial.burst.transform); expect(final.circle.transform).toBe(initial.circle.transform); expect(final.title.transform).toBe(initial.title.transform); expect(final.ambient.transform).toBe(initial.ambient.transform);
  } else {
    expect(log.frames.length).toBeGreaterThan(15);
    expect(log.frames[0].xp.scale).toBeLessThan(.99); expect(log.frames[0].xp.angle).toBeLessThan(0);
    expect(Math.max(...log.frames.map(frame => frame.xp.scale))).toBeGreaterThan(1.10);
    expect(log.frames[0].burst.scale).toBeLessThan(.95); expect(log.frames[0].burst.opacity).toBeLessThan(.8);
    expect(Math.max(...log.frames.map(frame => frame.burst.scale))).toBeGreaterThan(1.02);
    expect(log.frames[0].circle.scale).toBe(0); expect(log.frames[0].circle.opacity).toBe(0);
    expect(Math.max(...log.frames.map(frame => frame.circle.scale))).toBeGreaterThan(1.1);
    expect(log.frames[0].title.opacity).toBe(0);
    expect(log.frames.some(frame => frame.title.opacity > .1 && frame.title.opacity < .9)).toBe(true);
    const startOf = (name:string) => log.starts.find(event => event.name === name)!.at;
    const origin = startOf("completion-burst");
    for (const [name, expected] of [["completion-title-hit",120],["completion-check-pop",220],["completion-stamp",300]] as const) expect(startOf(name)-origin).toBeCloseTo(expected,-2);
    const ambientEarly = log.frames.find(f => f.at-log.frames[0].at > 1200)!;
    const ambientLate = log.frames.at(-1)!;
    expect(Math.abs(ambientLate.ambient.angle-ambientEarly.ambient.angle)).toBeGreaterThan(.2);
    expect(ambientLate.ambient.angle).toBeLessThan(4); expect(ambientLate.ambient.scale).toBeLessThan(1.025);
    for (const frame of log.frames.filter(f => f.at-log.frames[0].at > 1100)) {
      expect(frame.circle.scale).toBe(1); expect(frame.xp.scale).toBe(1); expect(frame.burst.scale).toBe(1);
    }
    await expect(page.locator(".completion-check")).toHaveCSS("animation-iteration-count", "1");
    const measuredReveals = log.starts.filter(event => event.name === "completion-reveal");
    expect(measuredReveals[0].at-origin).toBeCloseTo(600,-2);
    expect(measuredReveals[1].at-origin).toBeCloseTo(800,-2);
    await expect(page.locator(".reward-sunburst-rays")).toHaveCSS("animation-duration", "12s");
    await expect(page.locator(".reward-sunburst-rays")).toHaveCSS("animation-iteration-count", "infinite");
    for (const stable of [".reward-screen", ".quest-complete-view", ".brand", "nav"]) await expect(page.locator(stable)).toHaveCSS("animation-name", "none");
    for (const element of ["team", "cta"] as const) {
      expect(log.frames[0][element].opacity).toBe(0); expect(log.frames[0][element].y).toBe(12);
      expect(log.frames.some(frame => frame[element].opacity > .1 && frame[element].opacity < .9)).toBe(true);
    }
    expect(log.starts.filter(event => event.name === "completion-stamp")).toHaveLength(1);
    const reveals = log.starts.filter(event => event.name === "completion-reveal");
    expect(reveals).toHaveLength(2);
    expect(reveals[1].at - reveals[0].at).toBeGreaterThanOrEqual(50);
    expect(reveals[1].at - reveals[0].at).toBeLessThan(250);
    expect(log.iterations).toEqual([]);
    expect(log.frames.every(frame => JSON.stringify(frame.layout) === JSON.stringify(log.frames[0].layout))).toBe(true);
    expect(initial.texture.x - final.texture.x).toBeGreaterThan(4);
    expect(final.texture.y - initial.texture.y).toBeGreaterThan(4);
    const edge = await reward.evaluate(el => {
      const animation = document.getAnimations().find(animation => (animation as CSSAnimation).animationName === "reward-halftone-drift")!;
      const duration = Number(animation.effect!.getTiming().duration);
      const sample = () => { const matrix = new DOMMatrixReadOnly(getComputedStyle(el).transform); return { x: matrix.m41, y: matrix.m42 }; };
      // Supplemental continuity check; the main drift assertion above uses real elapsed time.
      animation.currentTime = duration - 16; const before = sample();
      animation.currentTime = duration + 16; const after = sample();
      return { before, after, tile: parseFloat(getComputedStyle(el).backgroundSize), direction: getComputedStyle(el).animationDirection, iterations: getComputedStyle(el).animationIterationCount };
    });
    expect(Math.abs(edge.after.x - edge.before.x - edge.tile)).toBeLessThan(.2);
    expect(Math.abs(edge.after.y - edge.before.y + edge.tile)).toBeLessThan(.2); expect(edge.direction).toBe("normal"); expect(edge.iterations).toBe("infinite");
    save("halftone-loop-edge", edge);
  }
  await expect(page.locator(".quest-live-beacon > .status-dot")).toHaveCount(0);
  await expect(xp).toHaveCSS("animation-iteration-count", "1");
  await page.waitForTimeout(300);
  const later = await visual(xp); expect(later.transform).toBe(final.xp.transform); expect(later.opacity).toBe(1);
  save(`reward-${reduced ? "reduced" : "moving"}`, { initial, final, later, log });
  await page.getByRole("button", { name: "VIEW LEADERBOARD", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Ranks." })).toBeVisible();
  // All API/GPS responses in this file are intercepted frontend fixtures.
  expect(counters.starts).toBe(0); expect(counters.gps).toBe(1); expect(counters.checkins).toBe(1);
});

for (const width of [320, 360, 390]) test(`reward motion visual QA at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height:844 });
  await page.emulateMedia({ reducedMotion:"no-preference" });
  const errors:string[]=[]; page.on("pageerror",error=>errors.push(error.message));
  await mount(page,{run:started,questContent:{title:"First Checkpoint"}}); await openActive(page);
  await page.evaluate(()=>{document.documentElement.style.setProperty("--tg-safe-area-inset-top","16px");document.documentElement.style.setProperty("--tg-safe-area-inset-bottom","20px");return document.fonts.ready;});
  await complete(page); mkdirSync(artifacts,{recursive:true});
  const geometry:unknown[]=[];
  for (const time of [0,250,500,800,1000,1050,1100,2000]) {
    // Reproducible sequence board; separate tests above measure unmodified wall-time playback.
    await page.evaluate(time=>{for(const animation of document.getAnimations()) {animation.pause();animation.currentTime=time;}},time);
    await page.screenshot({path:`${artifacts}/${width}-sequence-${time}.png`});
    const bounds=await page.evaluate(()=>{
      const box=(selector:string)=>{const b=document.querySelector(selector)!.getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height};};
      const xp=document.querySelector(".xp")!; const range=document.createRange();range.selectNodeContents(xp);const b=range.getBoundingClientRect();
      const titleRange=document.createRange();titleRange.selectNodeContents(document.querySelector(".completion h1")!);const title=titleRange.getBoundingClientRect();
      return {xp:{x:b.x,y:b.y,width:b.width,height:b.height},title:{x:title.x,y:title.y,width:title.width,height:title.height},circle:box(".completion-check"),team:box(".completion-team"),cta:box(".completion-actions"),back:box(".completion-actions .text-action"),button:box(".completion-actions .action"),nav:box("nav"),scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.querySelector(".completion")!.scrollHeight,clientHeight:document.querySelector(".completion")!.clientHeight};
    });
    geometry.push({time,...bounds});
    expect(bounds.xp.x).toBeGreaterThanOrEqual(0);expect(bounds.xp.x+bounds.xp.width+6).toBeLessThanOrEqual(width);
    expect(bounds.title.x+bounds.title.width).toBeLessThanOrEqual(bounds.circle.x);
    expect(bounds.team.y+bounds.team.height).toBeLessThanOrEqual(bounds.cta.y);
    expect(bounds.button.y+bounds.button.height+4).toBeLessThanOrEqual(bounds.nav.y);
    expect(bounds.back.y+bounds.back.height).toBeLessThanOrEqual(bounds.nav.y);
    expect(bounds.scrollWidth).toBeLessThanOrEqual(width);
    expect(bounds.scrollHeight).toBeLessThanOrEqual(bounds.clientHeight);
  }
  save(`${width}-geometry`,geometry);
  const button=page.getByRole("button",{name:"VIEW LEADERBOARD",exact:true});
  await expect(button).toBeInViewport({ratio:1});await expect(page.getByRole("button",{name:"BACK TO TEAM",exact:true})).toBeInViewport({ratio:1});
  await button.click(); await expect(page.getByRole("heading",{name:"Ranks."})).toBeVisible();expect(errors).toEqual([]);
});

test("reward CTA is hit-testable during its delayed entrance", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await mount(page, { run: started }); await openActive(page); await complete(page);
  const button = page.getByRole("button", { name: "VIEW LEADERBOARD", exact: true });
  const hit = await button.evaluate(el => { const box = el.getBoundingClientRect(); const target = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2); return target === el || el.contains(target); });
  expect(hit).toBe(true);
  await button.click({ force: true });
  await expect(page.getByRole("heading", { name: "Ranks." })).toBeVisible();
});
