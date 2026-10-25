import { expect, test, type Page } from "@playwright/test";
import { mount, openActive, started, type Options } from "./fixtures";
import type { Quest } from "../src/types";

// These records exist only in intercepted frontend requests. Never seed the dev DB.
const quest: Quest = { id: "q", title: "First Checkpoint.", description: "One spot in the city. Your crew. Ready?", base_xp: 100, latitude: 40, longitude: 44, radius_m: 100, run: null, place_label: "FIELD TEST CHECKPOINT" };
const rows: Quest[] = [ { ...quest, run: started }, { ...quest, id: "available", title: "Public square" }, { ...quest, id: "done", title: "Claimed checkpoint", run: { id: "done-r", status: "completed" } } ];
const screenshotRoot = process.env.AYLOOR_VISUAL_QA_DIR || ".visual-qa/street-frequency-reconciliation/after";
const states = ["home", "quests", "pending-quests", "unstarted", "active", "scan", "outside", "denied", "completed-detail", "complete", "ranks", "team-active", "team-waiting", "no-team", "invited"] as const;

async function nav(page: Page, name: string) {
  await page.getByRole("navigation").getByRole("button", { name, exact: true }).click();
  await expect(page.getByRole("navigation").getByRole("button", { name, exact: true })).toBeEnabled();
}
async function clearNav(page: Page, buttonName: string) {
  const button = page.getByRole("button", { name: buttonName, exact: true });
  await expect(button).toBeInViewport({ ratio: 1 });
  const a = await button.boundingBox(), b = await page.getByRole("navigation").count() ? await page.getByRole("navigation").boundingBox() : { y: page.viewportSize()!.height };
  expect(a!.y + a!.height + 3).toBeLessThanOrEqual(b!.y);
}

for (const width of [320, 360, 390]) for (const state of states) {
  test(`Street Frequency ${state} at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const errors: string[] = [];
    page.on("pageerror", e => errors.push(e.message));
    let release!: () => void;
    const wait = new Promise<void>(resolve => { release = resolve; });
    const options: Options = {
      questContent: quest,
      pending: state === "pending-quests" || state === "team-waiting",
      noTeam: state === "no-team" || state === "invited",
      invitation: state === "invited",
      quests: state === "quests" || state === "pending-quests" ? rows : undefined,
      run: ["active", "scan", "outside", "denied", "complete"].includes(state) ? started : state === "completed-detail" ? { id: "r", status: "completed" } : null,
      denied: state === "denied", latitude: state === "outside" ? 40.0030577 : 40, accuracy: 18,
      checkError: state === "outside" ? "You are outside the checkpoint radius" : undefined,
      verificationWait: state === "scan" ? wait : undefined,
    };
    // run is supplied by the fixture, not overwritten by questContent.
    delete options.questContent!.run;
    const { counters } = await mount(page, options);
    await page.evaluate(() => {
      document.documentElement.style.setProperty("--tg-safe-area-inset-top", "16px");
      document.documentElement.style.setProperty("--tg-safe-area-inset-bottom", "20px");
    });
    if (state.includes("quests")) await nav(page, "QUESTS");
    else if (state === "unstarted" || state === "completed-detail") {
      await nav(page, "QUESTS"); await page.locator(".quest-row").click();
      await clearNav(page, state === "unstarted" ? "START QUEST" : "BACK TO QUESTS");
    } else if (["active", "scan", "outside", "denied", "complete"].includes(state)) {
      await openActive(page);
      if (state !== "active") {
        await page.getByRole("button", { name: "CHECK IN", exact: true }).click();
        if (state === "scan") await expect(page.getByRole("status")).toHaveText("VERIFYING CHECKPOINT…");
        else if (state === "complete") { await expect(page.locator(".completion-team")).toContainText("100 XP THIS SEASON"); await clearNav(page, "VIEW LEADERBOARD"); }
        else { await expect(page.getByRole("alert")).toBeVisible(); await clearNav(page, "TRY AGAIN"); }
      } else await clearNav(page, "CHECK IN");
    } else if (state === "ranks") await nav(page, "RANKS");
    else if (state === "team-active" || state === "team-waiting") {
      await nav(page, "TEAM");
      await clearNav(page, "INVITE FRIENDS");
      await clearNav(page, "REFRESH TEAM");
      if (state === "team-waiting") { await page.getByRole("button", { name: "INVITE FRIENDS", exact: true }).click(); await expect(page.getByLabel("Invite link", { exact: true })).toHaveValue(/join_fixture/); }
    }
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `${screenshotRoot}/${width}-${state}.png`, fullPage: false });
    if (state === "team-waiting") {
      await page.locator(".invite-card").scrollIntoViewIfNeeded();
      await expect(page.getByLabel("Invite link", { exact: true })).toBeInViewport({ ratio: 1 });
      await expect(page.getByRole("button", { name: "COPY LINK", exact: true })).toBeInViewport({ ratio: 1 });
      await clearNav(page, "INVITE FRIENDS");
      await page.screenshot({ path: `${screenshotRoot}/${width}-team-waiting-invite.png` });
    }
    if (state === "scan") { release(); await expect(page.locator(".completion")).toBeVisible(); }
    expect(errors).toEqual([]);
    if (!["scan", "outside", "denied", "complete"].includes(state)) { expect(counters.gps).toBe(0); expect(counters.checkins).toBe(0); expect(counters.starts).toBe(0); }
  });
}

function luminance(rgb: string) {
  const parts = rgb.match(/\d+/g)!.slice(0, 3).map(Number).map(x => { const n = x / 255; return n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4; });
  return parts[0] * .2126 + parts[1] * .7152 + parts[2] * .0722;
}

test("YOU contrast, card hierarchy, monochrome arrows and keyboard controls", async ({ page }) => {
  await mount(page, { quests: rows });
  await nav(page, "RANKS");
  const badge = page.locator(".ranking .own small");
  await expect(badge).toHaveText("YOU");
  const colors = await badge.evaluate(el => ({ color: getComputedStyle(el).color, bg: getComputedStyle(el).backgroundColor }));
  const levels = [luminance(colors.color), luminance(colors.bg)].sort((a, b) => b - a);
  expect((levels[0] + .05) / (levels[1] + .05)).toBeGreaterThanOrEqual(4.5);
  await nav(page, "QUESTS");
  await expect(page.locator(".quest-row.progress")).toHaveCSS("background-color", "rgb(24, 24, 22)");
  await expect(page.locator(".quest-row.available")).toHaveCSS("box-shadow", "none");
  await expect(page.locator(".completed-quest-row > .quest-done-stamp")).toHaveCSS("background-color", "rgb(191, 255, 32)");
  await expect(page.locator(".quest-row-end svg")).toHaveCount(3);
  expect(await page.locator(".app").innerText()).not.toMatch(/[↗↘→←]\uFE0F?/);
  const filter = page.getByRole("button", { name: "DONE 1", exact: true });
  await filter.focus(); await page.keyboard.press("Enter");
  await expect(page.locator(".quest-row")).toHaveCount(1);
  const row = page.locator(".quest-row"); await row.focus();
  await expect(row).toHaveCSS("outline-style", "solid");
  await page.keyboard.press("Enter");
  await expect(page.getByText("QUEST COMPLETE ✓", { exact: true })).toBeVisible();
});

for (const reduce of [false, true]) test(`motion and physical pressed state, reduced=${reduce}`, async ({ page }) => {
  await page.emulateMedia({ reducedMotion: reduce ? "reduce" : "no-preference" });
  let finish!: () => void;
  const verificationWait = new Promise<void>(resolve => { finish = resolve; });
  await mount(page, { run: started, verificationWait });
  await expect(page.locator(".marquee-track")).toHaveCSS("animation-name", reduce ? "none" : "marquee");
  await expect(page.locator(".radar-ping")).toHaveCount(0);
  await openActive(page);
  await expect(page.locator(".quest-state, .status-dot").first()).toHaveCSS("animation-name", "none");
  const button = page.getByRole("button", { name: "CHECK IN", exact: true });
  const normal = await button.boundingBox();
  await button.hover(); await page.mouse.down();
  await expect(button).toHaveCSS("transform", "matrix(1, 0, 0, 1, 4, 4)");
  const pressed = await button.boundingBox(); expect(pressed!.y - normal!.y).toBe(4);
  await page.mouse.up();
  await expect(page.getByRole("status")).toHaveText("VERIFYING CHECKPOINT…");
  await expect(page.locator(".radar-ping i").first()).toHaveCSS("animation-name", reduce ? "none" : "check-in-ping");
  finish();
  await expect(page.locator(".xp")).toHaveCSS("animation-name", reduce ? "none" : "completion-stamp");
  await expect(page.locator(".xp")).toHaveCSS("animation-iteration-count", "1");
  await expect(page.locator(".radar-ping")).toHaveCount(0);
});

test("invitation cancel is local and leaves create available", async ({ page }) => {
  const { counters } = await mount(page, { noTeam: true, invitation: true });
  await expect(page.getByRole("heading", { name: "Invited crew", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "CANCEL / CREATE A TEAM", exact: true }).click();
  await expect(page.getByRole("button", { name: "JOIN TEAM", exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Make a crew.", exact: true })).toBeVisible();
  await page.getByLabel("Team name", { exact: true }).fill("A new crew");
  await expect(page.getByRole("button", { name: "CREATE TEAM", exact: true })).toBeEnabled();
  expect(counters.starts).toBe(0); expect(counters.gps).toBe(0); expect(counters.checkins).toBe(0);
});

for (const width of [320, 360, 390]) test(`Home distinguishes a completed record from a real next move at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const done: Quest = { ...quest, run: { id: "r", status: "completed" } };
  const completed = await mount(page, { quests: [done], run: done.run, seasonXp: 100 });
  await expect(page.locator(".home-mission")).toContainText("Season Zero checkpoints complete.");
  await expect(page.locator(".home-kicker")).toContainText("YOUR NEXT MOVE");
  await expect(page.getByRole("button", { name: "VIEW RANKS", exact: true })).toBeVisible();
  await page.screenshot({ path: `${screenshotRoot}/${width}-home-completed.png` });
  const available = { ...quest, id: "next", title: "Next authored checkpoint", run: null };
  const next = await mount(page, { quests: [done, available], run: done.run, seasonXp: 100 });
  await expect(page.locator(".home-kicker")).toContainText("YOUR NEXT MOVE");
  await expect(page.locator(".home-mission h1")).toHaveText(available.title);
  await expect(page.locator(".home-mission")).not.toContainText("CHECKPOINT CLAIMED");
  await page.screenshot({ path: `${screenshotRoot}/${width}-home-next.png` });
  for (const state of [completed, next]) { expect(state.counters.gps).toBe(0); expect(state.counters.starts).toBe(0); expect(state.counters.checkins).toBe(0); }
});
