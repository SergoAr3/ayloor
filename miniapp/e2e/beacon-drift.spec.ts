import { expect, test, type Locator } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { mount, openActive, started } from "./fixtures";

const artifacts = ".visual-qa/beacon-drift";
const phase = process.env.AYLOOR_DRIFT_PHASE || "after";
function save(name: string, data: unknown) {
  mkdirSync(artifacts, { recursive: true });
  writeFileSync(`${artifacts}/${name}.json`, JSON.stringify(data, null, 2));
}
async function computed(locator: Locator, pseudo: string | null = null) {
  return locator.evaluate((element, pseudo) => {
    const css = getComputedStyle(element, pseudo), matrix = new DOMMatrixReadOnly(css.transform === "none" ? undefined : css.transform);
    return { at: performance.now(), selector: pseudo ? `.reward-screen${pseudo}` : `.${element.className}`,
      reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches, transform: css.transform, backgroundPosition: css.backgroundPosition,
      backgroundSize: css.backgroundSize, animationName: css.animationName, animationDuration: css.animationDuration, animationPlayState: css.animationPlayState,
      animationDirection: css.animationDirection, easing: css.animationTimingFunction, iterations: css.animationIterationCount, opacity: Number(css.opacity), x: matrix.m41, y: matrix.m42, scale: matrix.m11 };
  }, pseudo);
}

test("halftone rendered layer measurement over 1.3 seconds", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await mount(page, { run: started }); await openActive(page);
  await page.getByRole("button", { name: "CHECK IN", exact: true }).click();
  await expect(page.locator(".completion-actions")).toHaveCSS("opacity", "1");
  const layer = page.locator(phase === "before" ? ".reward-screen" : ".reward-halftone");
  const pseudo = phase === "before" ? "::before" : null;
  const team = (await page.locator(".completion-team").boundingBox())!, dock = (await page.locator(".completion-actions").boundingBox())!;
  const clip = { x: 8, y: Math.floor((team.y + team.height + dock.y) / 2) - 12, width: 120, height: 24 };
  mkdirSync(artifacts, { recursive: true });
  const pixelsBefore = await page.screenshot({ path: `${artifacts}/halftone-${phase}-pixels-a.png`, clip });
  const before = await computed(layer, pseudo);
  await page.waitForTimeout(1300);
  const after = await computed(layer, pseudo);
  const pixelsAfter = await page.screenshot({ path: `${artifacts}/halftone-${phase}-pixels-b.png`, clip });
  expect(pixelsBefore.equals(pixelsAfter)).toBe(false);
  expect(before.reducedMotion).toBe(false); expect(after.animationName).not.toBe("none");
  expect(after.animationDuration).not.toBe("0s"); expect(after.animationPlayState).toBe("running");
  const distance = Math.hypot(after.x - before.x, after.y - before.y);
  expect(distance).toBeGreaterThan(phase === "before" ? 1 : 4);
  save(`halftone-${phase}`, { before, after, elapsed: after.at - before.at, distance, renderedPixelsChanged: true });

});

for (const reduced of [false, true]) for (const failure of ["outside", "error"]) test(`one idle ring yields to three scan rings and returns after ${failure}; reduced=${reduced}`, async ({ page }) => {
  await page.emulateMedia({ reducedMotion: reduced ? "reduce" : "no-preference" });
  let release!: () => void;
  const verificationWait = new Promise<void>(resolve => { release = resolve; });
  const { counters } = await mount(page, { run: started, locationDelay: 1300, verificationWait,
    checkError: failure === "outside" ? "You are outside the checkpoint radius" : "Unable to verify checkpoint right now", checkErrorStatus: failure === "outside" ? 422 : 503 });
  await openActive(page); await page.evaluate(() => document.fonts.ready);
  const beacon = page.locator(".quest-live-beacon"), dot = beacon.locator(".status-dot"), ring = beacon.locator(".quest-idle-ring"), label = page.locator(".quest-state.active");
  await expect(beacon).toHaveCount(1); await expect(ring).toHaveCount(1); await expect(page.locator(".radar-ping")).toHaveCount(0);
  if (!reduced) for (const element of [dot, ring]) await element.evaluate(el => { el.getAnimations()[0].currentTime = 0; });
  const before = { dot: await computed(dot), ring: await computed(ring), label: await computed(label) };
  await page.waitForTimeout(650);
  const after = { dot: await computed(dot), ring: await computed(ring), label: await computed(label) };
  if (reduced) {
    for (const key of ["dot", "ring"] as const) { expect(after[key].transform).toBe(before[key].transform); expect(after[key].opacity).toBe(before[key].opacity); expect(after[key].animationName).toBe("none"); }
  } else {
    expect(after.dot.animationDuration).toBe("1.25s"); expect(after.dot.easing).toBe("ease-in-out");
    expect(after.ring.animationDuration).toBe("1.8s"); expect(after.ring.easing).toBe("ease-out");
    for (const sample of [after.dot, after.ring]) expect(sample.iterations).toBe("infinite");
    expect(after.dot.transform).not.toBe(before.dot.transform); expect(after.dot.opacity).not.toBe(before.dot.opacity);
    expect(after.ring.scale - before.ring.scale).toBeGreaterThan(.2); expect(before.ring.opacity - after.ring.opacity).toBeGreaterThan(.05);
    expect(after.ring.scale).toBeLessThanOrEqual(2); expect(after.ring.opacity).toBeGreaterThanOrEqual(0);
  }
  if (!reduced) {
    // Let the browser clock run: both shortened cycles must complete within 1.9s.
    await page.waitForTimeout(1250);
    for (const [element, duration, transforms, opacities] of [
      [dot, 1250, ["scale(1)", "scale(1.12)", "scale(1)"], ["1", "0.7", "1"]],
      [ring, 1800, ["scale(1)", "scale(2)"], ["0.32", "0"]],
    ] as const) {
      const animation = await element.evaluate(el => {
        const effect = el.getAnimations()[0].effect as KeyframeEffect;
        return { timing: effect.getComputedTiming(), frames: effect.getKeyframes().map(f => ({ transform:f.transform, opacity:f.opacity })) };
      });
      expect(animation.timing.duration).toBe(duration);
      expect(animation.timing.currentIteration).toBeGreaterThanOrEqual(1);
      expect(animation.frames.map(f => f.transform)).toEqual(transforms);
      expect(animation.frames.map(f => f.opacity)).toEqual(opacities);
    }
  }
  expect(after.label.transform).toBe(before.label.transform); expect(after.label.animationName).toBe("none"); expect(after.label.opacity).toBe(1);
  await page.getByRole("button", { name: "CHECK IN", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("GETTING LOCATION…");
  await expect(beacon).toHaveCount(0); await expect(page.locator(".radar-ping i")).toHaveCount(3);
  const scan = page.locator(".radar-ping i");
  for (const [index, delay] of ["0s", "-0.7s", "-1.4s"].entries()) {
    await expect(scan.nth(index)).toHaveCSS("animation-name", reduced ? "none" : "check-in-ping");
    if (!reduced) {
      await expect(scan.nth(index)).toHaveCSS("animation-duration", "2.1s");
      await expect(scan.nth(index)).toHaveCSS("animation-timing-function", "linear");
      await expect(scan.nth(index)).toHaveCSS("animation-delay", delay);
    }
  }
  await expect(page.getByRole("status")).toHaveText("VERIFYING CHECKPOINT…");
  await expect(beacon).toHaveCount(0); await expect(page.locator(".radar-ping i")).toHaveCount(3);
  release();
  await expect(beacon).toHaveCount(1); await expect(ring).toHaveCount(1); await expect(page.locator(".radar-ping")).toHaveCount(0);
  expect(counters.gps).toBe(1); expect(counters.checkins).toBe(1); expect(counters.starts).toBe(0);
  save(`beacon-${failure}-${reduced ? "reduced" : "moving"}`, { before, after });
});

for (const reduced of [false, true]) test(`dev diagnostics samples dot, idle ring and actual background without side effects; reduced=${reduced}`, async ({ page }) => {
  await page.emulateMedia({ reducedMotion: reduced ? "reduce" : "no-preference" });
  const { counters } = await mount(page, { run: started });
  await expect(page.locator(".motion-diagnostics")).toHaveCount(0);
  await page.goto("/?motion_debug=1"); await openActive(page);
  const panel = page.locator(".motion-diagnostics");
  await panel.locator("summary").click();
  const activeApiCount = counters.api;
  await panel.getByRole("button", { name: "MEASURE 1.2 SECONDS" }).click();
  await expect(panel.getByRole("button", { name: "MEASURE 1.2 SECONDS" })).toBeEnabled();
  await expect(panel.locator("pre")).toContainText('"trigger": "manual 1200ms sample"');
  const active = JSON.parse(await panel.locator("pre").innerText());
  expect(active.before.reducedMotion).toBe(reduced);
  for (const selector of [".quest-live-beacon > .status-dot", ".quest-idle-ring"]) {
    const before = active.before.elements.find((element: { selector: string }) => element.selector === selector);
    const after = active.after.elements.find((element: { selector: string }) => element.selector === selector);
    expect(before).toBeDefined(); expect(after).toBeDefined();
    if (reduced) expect(after.transform).toBe(before.transform);
    else expect(after.transform).not.toBe(before.transform);
  }
  expect(counters.api).toBe(activeApiCount); expect(counters.gps).toBe(0); expect(counters.checkins).toBe(0);
  await panel.locator("summary").click();
  await expect(panel).not.toHaveAttribute("open");
  await page.getByRole("button", { name: "CHECK IN", exact: true }).click();
  await expect(page.locator(".completion-actions")).toHaveCSS("opacity", "1");
  await panel.locator("summary").click();
  const rewardApiCount = counters.api;
  await panel.getByRole("button", { name: "MEASURE 1.2 SECONDS" }).click();
  await expect(panel.getByRole("button", { name: "MEASURE 1.2 SECONDS" })).toBeEnabled();
  await expect(panel.locator("pre")).toContainText('"trigger": "manual 1200ms sample"');
  const reward = JSON.parse(await panel.locator("pre").innerText());
  const before = reward.before.elements.find((element: { selector: string }) => element.selector === ".reward-halftone");
  const after = reward.after.elements.find((element: { selector: string }) => element.selector === ".reward-halftone");
  expect(before).toBeDefined(); expect(after).toBeDefined();
  expect(after).toHaveProperty("backgroundPosition"); expect(after).toHaveProperty("animationDuration"); expect(after).toHaveProperty("animationPlayState");
  if (reduced) { expect(after.transform).toBe(before.transform); expect(after.animationName).toBe("none"); }
  else { expect(after.transform).not.toBe(before.transform); expect(after.animationPlayState).toBe("running"); }
  expect(counters.api).toBe(rewardApiCount); expect(counters.gps).toBe(1); expect(counters.checkins).toBe(1);
  save(`diagnostics-${reduced ? "reduced" : "moving"}`, { active, reward });
});
