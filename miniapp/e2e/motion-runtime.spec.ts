import { expect, test, type Locator, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { mount, openActive, started } from "./fixtures";

const artifacts = ".visual-qa/street-frequency-reconciliation/motion";
function save(name: string, data: unknown) {
  mkdirSync(artifacts, { recursive: true });
  writeFileSync(`${artifacts}/${name}.json`, JSON.stringify(data, null, 2));
}
async function visual(element: Locator) {
  return element.evaluate(el => {
    const style = getComputedStyle(el), box = el.getBoundingClientRect(), matrix = style.transform === "none" ? new DOMMatrixReadOnly() : new DOMMatrixReadOnly(style.transform);
    return { at: performance.now(), reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches, visibility: document.visibilityState,
      animationName: style.animationName, duration: style.animationDuration, playState: style.animationPlayState,
      transform: style.transform, opacity: Number(style.opacity), shadow: style.boxShadow, x: box.x, y: box.y,
      tx: matrix.m41, ty: matrix.m42, scale: matrix.m11, press: parseFloat(style.getPropertyValue("--press")) || 0 };
  });
}

test("marquee really moves over wall time and covers both sides of its loop", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await mount(page);
  const track = page.locator(".marquee-track");
  const before = await visual(track);
  await page.waitForTimeout(1200); // Deliberate temporal measurement, not a readiness wait.
  const after = await visual(track);
  expect(before.reducedMotion).toBe(false); expect(after.playState).toBe("running");
  expect(after.tx).toBeLessThan(before.tx - 5);
  const loop = await track.evaluate(el => {
    const animation = el.getAnimations()[0], duration = Number(animation.effect!.getTiming().duration);
    const groups = [...el.children] as HTMLElement[];
    function coverage() { const viewport = el.parentElement!.getBoundingClientRect(); return { left: el.getBoundingClientRect().left, right: groups.at(-1)!.getBoundingClientRect().right, viewportLeft: viewport.left, viewportRight: viewport.right }; }
    // Supplemental seek checks geometry around wrap; the movement assertion above uses real elapsed time.
    animation.currentTime = duration - 16; const end = coverage();
    animation.currentTime = duration + 16; const start = coverage();
    return { end, start, identicalGroups: groups.every(group => group.textContent === groups[0].textContent), count: groups.length };
  });
  expect(loop.count).toBe(4); expect(loop.identicalGroups).toBe(true);
  for (const edge of [loop.end, loop.start]) { expect(edge.left).toBeLessThanOrEqual(edge.viewportLeft); expect(edge.right).toBeGreaterThanOrEqual(edge.viewportRight); }
  save("marquee-wall-time", { before, after, elapsed: after.at - before.at, deltaX: after.tx - before.tx, loop });
});

for (const reduced of [false, true]) test(`three radar rings change over time only during acquisition/verification; reduced=${reduced}`, async ({ page }) => {
  await page.emulateMedia({ reducedMotion: reduced ? "reduce" : "no-preference" });
  let release!: () => void;
  const verificationWait = new Promise<void>(resolve => { release = resolve; });
  const { counters } = await mount(page, { run: started, locationDelay: 1400, verificationWait });
  await expect(page.locator(".radar-ping")).toHaveCount(0);
  await openActive(page);
  const activeBefore = await visual(page.locator(".quest-state.active"));
  await page.getByRole("button", { name: "CHECK IN", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("GETTING LOCATION…");
  const rings = page.locator(".radar-ping i"); await expect(rings).toHaveCount(3);
  const locationBefore = await visual(rings.first());
  await page.waitForTimeout(350);
  const locationAfter = await visual(rings.first());
  expect(locationBefore.reducedMotion).toBe(reduced);
  if (reduced) { expect(locationAfter.transform).toBe(locationBefore.transform); expect(locationAfter.opacity).toBe(locationBefore.opacity); }
  else { expect(locationAfter.transform).not.toBe(locationBefore.transform); expect(locationAfter.opacity).not.toBe(locationBefore.opacity); }
  await expect(page.getByRole("status")).toHaveText("VERIFYING CHECKPOINT…");
  const verifyBefore = await visual(rings.nth(1));
  await page.waitForTimeout(350);
  const verifyAfter = await visual(rings.nth(1));
  if (reduced) { expect(verifyAfter.transform).toBe(verifyBefore.transform); expect(verifyAfter.opacity).toBe(verifyBefore.opacity); }
  else { expect(verifyAfter.transform).not.toBe(verifyBefore.transform); expect(verifyAfter.opacity).not.toBe(verifyBefore.opacity); }
  const activeAfter = await visual(page.locator(".quest-state.active"));
  expect(activeAfter.animationName).toBe("none"); expect(activeAfter.transform).toBe(activeBefore.transform); expect(activeAfter.opacity).toBe(activeBefore.opacity);
  release();
  await expect(page.locator(".completion-team")).toBeVisible(); await expect(rings).toHaveCount(0);
  expect(counters.gps).toBe(1); expect(counters.checkins).toBe(1);
  save(`radar-${reduced ? "reduced" : "moving"}`, { locationBefore, locationAfter, verifyBefore, verifyAfter, activeBefore, activeAfter });
});

for (const reduced of [false, true]) test(`completion stamp changes once then stays at its final position; reduced=${reduced}`, async ({ page }) => {
  await page.emulateMedia({ reducedMotion: reduced ? "reduce" : "no-preference" });
  await mount(page, { run: started }); await openActive(page);
  await page.evaluate(() => {
    const target = window as typeof window & { stampFrames?: { at: number; transform: string; opacity: string }[] };
    target.stampFrames = [];
    document.addEventListener("animationstart", event => {
      if (event.animationName !== "completion-stamp") return;
      const sample = () => { const el = document.querySelector(".xp")!; const style = getComputedStyle(el); target.stampFrames!.push({ at: performance.now(), transform: style.transform, opacity: style.opacity }); };
      sample(); setTimeout(sample, 120); setTimeout(sample, 650);
    });
  });
  await page.getByRole("button", { name: "CHECK IN", exact: true }).click();
  const xp = page.locator(".xp"); await expect(xp).toBeVisible();
  if (!reduced) await expect.poll(() => page.evaluate(() => (window as typeof window & { stampFrames: unknown[] }).stampFrames.length)).toBe(3);
  const settled = await visual(xp);
  await page.waitForTimeout(300);
  const later = await visual(xp);
  const frames = await page.evaluate(() => (window as typeof window & { stampFrames: unknown[] }).stampFrames);
  if (reduced) { expect(frames).toEqual([]); expect(settled.animationName).toBe("none"); }
  else {
    const measured = frames as { transform: string }[];
    expect(measured[0].transform).not.toBe(measured[2].transform);
    await expect(xp).toHaveCSS("animation-iteration-count", "1");
  }
  expect(settled.ty).toBe(0); expect(settled.scale).toBe(1); expect(settled.opacity).toBe(1);
  expect(later.transform).toBe(settled.transform); expect(later.opacity).toBe(settled.opacity);
  save(`completion-${reduced ? "reduced" : "stamp"}`, { frames, settled, later });
});

test("reduced marquee remains still over wall time", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" }); await mount(page);
  const before = await visual(page.locator(".marquee-track")); await page.waitForTimeout(1100);
  const after = await visual(page.locator(".marquee-track"));
  expect(after.reducedMotion).toBe(true); expect(after.animationName).toBe("none"); expect(after.tx).toBe(before.tx);
  save("marquee-reduced", { before, after });
});

async function primary(page: Page, name: string) {
  if (name === "CREATE TEAM") { await mount(page, { noTeam: true }); await page.getByLabel("Team name", { exact: true }).fill("Touch crew"); }
  else if (name === "START QUEST") await mount(page);
  else if (name === "INVITE FRIENDS") { await mount(page); await page.getByRole("navigation").getByRole("button", { name: "TEAM", exact: true }).click(); }
  else {
    await mount(page, { run: started, ...(name === "TRY AGAIN" ? { checkError: "You are outside the checkpoint radius", latitude: 40.0030577 } : {}) });
    await openActive(page);
    if (name !== "CHECK IN") await page.getByRole("button", { name: "CHECK IN", exact: true }).click();
  }
  const button = page.getByRole("button", { name, exact: true }); await expect(button).toBeEnabled();
  // Isolate the press/release rendering here. Normal clicks and mutations are covered by the real API flow.
  await button.evaluate(el => el.addEventListener("click", event => { event.preventDefault(); event.stopImmediatePropagation(); }, { once: true, capture: true }));
  return button;
}

test.describe("physical action press/release", () => {
  test.use({ hasTouch: true });
  for (const input of ["pointer", "touch"] as const) for (const name of ["START QUEST", "CHECK IN", "VIEW LEADERBOARD", "INVITE FRIENDS", "CREATE TEAM", "TRY AGAIN"]) {
    test(`${input}: ${name} moves into its shadow and restores on release`, async ({ page }) => {
      const button = await primary(page, name), before = await visual(button), box = (await button.boundingBox())!;
      const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      const cdp = input === "touch" ? await page.context().newCDPSession(page) : null;
      if (cdp) await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
      else { await page.mouse.move(point.x, point.y); await page.mouse.down(); }
      await expect(button).toHaveAttribute("data-pressed", "true");
      const during = await visual(button);
      expect(during.tx).toBe(before.press); expect(during.ty).toBe(before.press);
      expect(during.shadow).toMatch(/0px 0px 0px 0px$/);
      if (cdp) { await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); await cdp.detach(); }
      else await page.mouse.up();
      await expect(button).not.toHaveAttribute("data-pressed", "true");
      const after = await visual(button);
      expect(after.transform).toBe(before.transform); expect(after.shadow).toBe(before.shadow);
      save(`pressed-${input}-${name.toLowerCase().replaceAll(" ", "-")}`, { before, during, after });
    });
  }
});

for (const width of [320, 360, 390]) test(`DONE status and Team actions preserve usable content at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 });
  const title = "A long authored checkpoint title by the public pedestrian square";
  const q = { id: "q", title, description: "Public path", base_xp: 100, radius_m: 100, latitude: 40, longitude: 44, run: { id: "r", status: "completed" as const } };
  await mount(page, { quests: [q] });
  await page.getByRole("navigation").getByRole("button", { name: "QUESTS", exact: true }).click();
  const row = page.locator(".quest-row.completed"), titleBox = (await row.locator(".quest-title-line").boundingBox())!, status = (await page.locator(".completed-quest-row > .quest-done-stamp").boundingBox())!, xp = (await row.locator(".quest-row-end").boundingBox())!;
  expect(titleBox.x + titleBox.width).toBeLessThan(xp.x); expect(status.y).toBeGreaterThan(titleBox.y + titleBox.height);
  expect(status.y).toBeGreaterThan(xp.y + xp.height);
  await page.getByRole("navigation").getByRole("button", { name: "TEAM", exact: true }).click();
  const dock = (await page.locator(".team-actions").boundingBox())!; expect(dock.height).toBeLessThan(145);
  await expect(page.getByRole("button", { name: "REFRESH TEAM", exact: true })).toHaveCSS("box-shadow", "none");
  await expect(page.getByRole("button", { name: "BACK TO QUESTS", exact: true })).toHaveCSS("border-top-width", "0px");
  const members = (await page.locator(".members").boundingBox())!; expect(members.y + members.height).toBeLessThanOrEqual(dock.y);
});

test("opt-in motion diagnostics reports the actual preference and measured movement without gameplay", async ({ page }) => {
  const { counters } = await mount(page);
  await expect(page.locator(".motion-diagnostics")).toHaveCount(0);
  await page.goto("/?motion_debug=1");
  await page.locator(".motion-diagnostics summary").click();
  await expect(page.locator(".motion-diagnostics")).toContainText("Actual reduced motion: false");
  await page.getByRole("button", { name: "MEASURE 1.2 SECONDS" }).click();
  await expect(page.locator(".motion-diagnostics pre")).toContainText('"after"');
  const report = JSON.parse(await page.locator(".motion-diagnostics pre").innerText());
  expect(report.before.reducedMotion).toBe(false); expect(report.before.elements[0].x).not.toBe(report.after.elements[0].x);
  expect(counters.gps).toBe(0); expect(counters.starts).toBe(0); expect(counters.checkins).toBe(0);
  save("dev-diagnostics", report);
});
