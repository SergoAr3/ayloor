import { expect, test, type Locator } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { mount } from "./fixtures";
import type { Quest } from "../src/types";

const artifacts = process.env.AYLOOR_QUESTS_QA_DIR || ".visual-qa/quests-poster";
const quest: Quest = { id: "q", title: "First checkpoint", description: "Frontend layout fixture only.", base_xp: 175, radius_m: 100, latitude: 40, longitude: 44, run: { id: "r", status: "completed" } };
const mixed: Quest[] = [
  { ...quest, id: "active", title: "Public square", run: { id: "active-run", status: "started" } },
  { ...quest, id: "available", title: "Cascade", run: null },
  quest,
];
const long = "A long completed checkpoint title by the public pedestrian square entrance beside the old city fountain";

async function box(element: Locator) {
  const bounds = await element.boundingBox();
  expect(bounds).not.toBeNull();
  return bounds!;
}
function overlaps(a: { x: number; y: number; width: number; height: number }, b: typeof a) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

for (const width of [320, 360, 390]) for (const state of ["one-completed", "mixed", "long-completed"] as const) {
  test(`QUESTS checkpoint tiles and overlay stamp: ${state} at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    const fixtures = state === "mixed" ? mixed : [{ ...quest, title: state === "long-completed" ? long : quest.title }];
    const { counters } = await mount(page, { quests: fixtures, seasonXp: 175 });
    await page.getByRole("navigation").getByRole("button", { name: "QUESTS", exact: true }).click();
    await page.evaluate(() => document.fonts.ready);

    const tracker = page.getByRole("progressbar", { name: "Completed checkpoints" });
    await expect(tracker).not.toHaveClass(/continuous/);
    await expect(tracker).toHaveAttribute("aria-valuenow", "1");
    await expect(tracker).toHaveAttribute("aria-valuemax", String(fixtures.length));
    await expect(page.locator(".season-summary")).toHaveText(`SEASON PROGRESS1 / ${fixtures.length} · 175 XP`);
    const segments = tracker.locator(".checkpoint-segment");
    await expect(segments).toHaveCount(fixtures.length);
    await expect(tracker.locator("[style*='width']")).toHaveCount(0);
    for (const [index, fixture] of fixtures.entries()) {
      const completed = fixture.run?.status === "completed", segment = segments.nth(index);
      await expect(segment).toHaveText(`${String(index + 1).padStart(2, "0")}${completed ? " ✓" : ""}`);
      await expect(segment).toHaveCSS("background-color", completed ? "rgb(191, 255, 32)" : "rgb(243, 235, 221)");
      await expect(segment).toHaveCSS("border-top-width", "3px");
      await expect(segment).toHaveCSS("border-radius", "0px");
      await expect(segment).toHaveCSS("box-shadow", "none");
    }
    if (fixtures.length === 1) {
      const tile = await box(segments.first()), track = await box(tracker);
      expect(tile.width).toBeGreaterThanOrEqual(64);
      expect(tile.width).toBeLessThanOrEqual(90);
      expect(tile.width).toBeLessThan(track.width / 2);
    }
    const row = page.locator(".quest-row.completed"), stamp = page.locator(".completed-quest-row > .quest-done-stamp");
    await expect(row).toHaveAccessibleDescription("DONE ✓");
    await expect(stamp).toHaveCSS("position", "absolute");
    await expect(stamp).toHaveCSS("border-top-width", "3px");
    await expect(stamp).toHaveCSS("background-color", "rgb(191, 255, 32)");
    await expect(stamp).toHaveCSS("color", "rgb(24, 24, 22)");
    await expect(row.locator(".quest-row-end .quest-done-stamp")).toHaveCount(0);
    const placement = await stamp.evaluate(el => {
      const matrix = new DOMMatrixReadOnly(getComputedStyle(el).transform);
      return { ownRow: (el as HTMLElement).offsetParent === el.parentElement, angle: Math.atan2(matrix.b, matrix.a) * 180 / Math.PI };
    });
    expect(placement.ownRow).toBe(true);
    expect(placement.angle).toBeGreaterThanOrEqual(-7);
    expect(placement.angle).toBeLessThanOrEqual(-5);
    const stampBox = await box(stamp), titleBox = await box(row.locator(".quest-title-line"));
    const xpBox = await box(row.locator(".quest-row-end > span").first()), arrowBox = await box(row.locator(".arrow-icon"));
    for (const other of [titleBox, xpBox, arrowBox]) expect(overlaps(stampBox, other)).toBe(false);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole("button", { name: "OPEN DETAILS" })).toHaveCount(0);

    mkdirSync(artifacts, { recursive: true });
    await page.screenshot({ path: `${artifacts}/${width}-${state}.png` });
    await page.locator(".season-progress").screenshot({ path: `${artifacts}/${width}-${state}-tracker.png` });
    await row.locator("..").screenshot({ path: `${artifacts}/${width}-${state}-row.png` });
    writeFileSync(`${artifacts}/${width}-${state}.json`, JSON.stringify({ placement, stampBox, titleBox, xpBox, arrowBox }, null, 2));

    // Filtering cannot change the all-quest tracker or lose the read-only click target.
    await page.getByRole("button", { name: `TO DO ${fixtures.length - 1}`, exact: true }).click();
    await expect(page.locator(".quest-row")).toHaveCount(fixtures.length - 1);
    await expect(segments).toHaveCount(fixtures.length);
    await expect(tracker).toHaveAttribute("aria-valuenow", "1");
    await page.getByRole("button", { name: "DONE 1", exact: true }).click();
    await expect(page.locator(".quest-row")).toHaveCount(1);
    await expect(page.locator(".quest-row.completed")).toHaveCount(1);
    await expect(page.getByRole("button", { name: `ALL ${fixtures.length}`, exact: true })).toBeVisible();
    // Click the visible sticker itself: pointer-events:none must let the row open.
    await stamp.scrollIntoViewIfNeeded();
    const target = await box(stamp);
    await page.mouse.click(target.x + target.width / 2, target.y + target.height / 2);
    await expect(page.getByRole("heading", { name: fixtures.at(-1)!.title, exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "BACK TO QUESTS", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /^(START QUEST|CHECK IN)$/ })).toHaveCount(0);
    expect(counters.gps).toBe(0); expect(counters.starts).toBe(0); expect(counters.checkins).toBe(0);
    expect(errors).toEqual([]);
  });
}

test("five checkpoint tiles and scalable fallback retain real counts without orange fill", async ({ page }) => {
  const fixtures = Array.from({ length: 50 }, (_, i) => ({ ...quest, id: `q${i}`, run: i < 7 ? quest.run : null }));
  await mount(page, { quests: fixtures.slice(0, 5), seasonXp: 875 });
  await page.getByRole("navigation").getByRole("button", { name: "QUESTS", exact: true }).click();
  await expect(page.locator(".checkpoint-segment")).toHaveCount(5);
  await mount(page, { quests: fixtures, seasonXp: 1225 });
  await page.getByRole("navigation").getByRole("button", { name: "QUESTS", exact: true }).click();
  const progress = page.getByRole("progressbar", { name: "Completed checkpoints" });
  await expect(progress).toHaveClass("season-segments continuous");
  await expect(progress).toHaveAttribute("aria-valuemax", "50");
  await expect(progress).toHaveAttribute("aria-valuenow", "7");
  await expect(progress.locator("span")).toHaveCount(1);
  await expect(progress.locator(".filled")).toHaveCSS("background-color", "rgb(191, 255, 32)");
  await expect(progress).toHaveCSS("border-top-width", "3px");
  const sizes = await Promise.all([box(progress.locator(".filled")), box(progress)]);
  expect(sizes[0].width / (sizes[1].width - 6)).toBeCloseTo(7 / 50, 2);
});

for (const width of [320, 360, 390]) for (const title of [quest.title, long]) {
  test(`completed row retains available height: ${title === long ? "long" : "short"} at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1100 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const { counters } = await mount(page, { quests: [{ ...quest, id: "available", title, run: null }, { ...quest, title }] });
    await page.getByRole("navigation").getByRole("button", { name: "QUESTS", exact: true }).click();
    await page.evaluate(() => document.fonts.ready);
    const available = page.locator(".quest-row.available"), completed = page.locator(".quest-row.completed");
    const wrapper = page.locator(".completed-quest-row"), stamp = wrapper.locator(".quest-done-stamp");
    const metrics = async (locator: Locator) => locator.evaluate(el => {
      const style = getComputedStyle(el), box = el.getBoundingClientRect();
      return { height: box.height, scrollHeight: el.scrollHeight, paddingTop: style.paddingTop, paddingBottom: style.paddingBottom, minHeight: style.minHeight };
    });
    const normal = await metrics(available), done = await metrics(completed), outer = await metrics(wrapper);
    expect(done).toEqual(normal);
    await expect(wrapper).toHaveCSS("padding-bottom", "0px");
    await expect(wrapper).toHaveCSS("min-height", "0px");
    const standardGap = await available.evaluate(el => parseFloat(getComputedStyle(el).marginBottom));
    expect(outer.height - done.height).toBeCloseTo(standardGap, 2);
    expect(done.paddingTop).toBe("10px"); expect(done.paddingBottom).toBe("10px"); expect(done.minHeight).toBe("78px");
    await expect(stamp).toHaveCSS("position", "absolute");
    await expect(stamp).toHaveCSS("pointer-events", "none");
    await expect(completed).toHaveAccessibleDescription("DONE ✓");
    await stamp.evaluate(el => (el as HTMLElement).style.display = "none");
    expect(await metrics(completed)).toEqual(done); expect(await metrics(wrapper)).toEqual(outer);
    await stamp.evaluate(el => (el as HTMLElement).style.removeProperty("display"));
    const stampBox = await box(stamp);
    for (const selector of [".quest-number", ".quest-title-line", ".quest-row-end > span", ".arrow-icon"]) {
      expect(overlaps(stampBox, await box(completed.locator(selector))), selector).toBe(false);
    }
    const metadata = await completed.locator(".quest-row-meta").evaluate(el => {
      const range = document.createRange(); range.selectNodeContents(el);
      const b = range.getBoundingClientRect(); return { x:b.x, y:b.y, width:b.width, height:b.height };
    });
    expect(overlaps(stampBox, metadata), "metadata text").toBe(false);
    await expect(completed).toBeEnabled();
    mkdirSync(artifacts, { recursive: true });
    const name = `${width}-equal-height-${title === long ? "long" : "short"}`;
    await page.screenshot({ path: `${artifacts}/${name}.png`, fullPage: true });
    await available.screenshot({ path: `${artifacts}/${name}-available.png` });
    await wrapper.screenshot({ path: `${artifacts}/${name}-completed.png` });
    writeFileSync(`${artifacts}/${name}.json`, JSON.stringify({ available:normal, completed:done, wrapper:outer, stampBox, metadata }, null, 2));
    await completed.locator(".arrow-icon").click();
    await expect(page.getByRole("heading", { name:title, exact:true })).toBeVisible();
    await expect(page.getByRole("button", { name: /^(START QUEST|CHECK IN)$/ })).toHaveCount(0);
    expect(counters.starts).toBe(0); expect(counters.checkins).toBe(0); expect(counters.gps).toBe(0);
  });
}
