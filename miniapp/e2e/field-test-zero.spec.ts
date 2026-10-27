import { test, expect, type Page } from "@playwright/test";
import type { FieldTest, Quest } from "../src/types";

// Browser contract fixture; PostgreSQL integration tests exercise the actual rules.
async function mountField(page: Page, options: { dropped?: boolean; unavailable?: boolean } = {}) {
  let started = false;
  let expired = false;
  let unavailable = !!options.unavailable;
  let failSummary = false;
  let completed = 0;
  let score = 0;
  const counts = { gps: 0, hints: 0, answers: 0, starts: 0 };
  const lost = new Set<string>();
  const quests: Quest[] = ["Cascade", "Opera", "Aznavour Square", "Republic Square"].map((place, index) => ({
    id: `q${index + 1}`, title: place, description: "Walk by public paths to the reviewed checkpoint. Enter the operator test code after CHECK IN.",
    place_label: place, latitude: 40, longitude: 44, radius_m: 100, base_xp: 250,
    field_test_step: index + 1, run: null, hint_available: index === 1, hint_used: false,
    hint_text: null, wrong_answer_penalized: false,
  }));
  const detail = (q: Quest) => ({ ...q, locked: q.run?.status !== "completed" && (expired || q.field_test_step! > completed + 1) });
  const summary = (): FieldTest => ({
    status: completed === 4 ? "finished" : expired ? "expired" : started ? "running" : "ready",
    server_now: "2026-10-27T12:00:00Z", started_at: started ? "2026-10-27T11:00:00Z" : null,
    deadline_at: started ? "2026-10-27T12:30:00Z" : null, finished_at: completed === 4 ? "2026-10-27T12:00:00Z" : null,
    elapsed_seconds: expired ? 5400 : started ? 3600 : 0, remaining_seconds: expired ? 0 : started ? 1800 : 5400,
    score, maximum_score: 1000, completed_quests: completed, total_quests: 4, leaderboard_position: 2,
  });
  await page.route("https://telegram.org/js/telegram-web-app.js", route => route.fulfill({ contentType: "application/javascript", body: `
    window.Telegram={WebApp:{initData:'synthetic',ready(){},expand(){},isVersionAtLeast(){return true},openTelegramLink(){},
      LocationManager:{isInited:true,isLocationAvailable:true,init(cb){cb()},getLocation(cb){fetch('/field-gps-requested');cb({latitude:40,longitude:44,horizontal_accuracy:20})}}}};` }));
  await page.route("**/field-gps-requested", route => { counts.gps++; return route.fulfill({ body: "ok" }); });
  await page.route("**/api/v1/**", async route => {
    const path = new URL(route.request().url()).pathname.replace("/api/v1", "");
    const json = (value: unknown, status = 200) => route.fulfill({ json: value, status });
    const respond = (key: string, value: unknown, status = 200) => {
      if (options.dropped && !lost.has(key)) { lost.add(key); return route.abort("connectionreset"); }
      return json(value, status);
    };
    if (path === "/config") return json({ development_gps_enabled: false });
    if (path === "/auth/telegram") return json({ access_token: "synthetic-field-test" });
    if (path === "/me") return json({ user: { id: "u", telegram_id: 1, first_name: "Player" },
      team: { id: "t", name: "Field crew", member_count: 2, status: "active" }, city: { name: "Yerevan" }, season: { name: "Season Zero" } });
    if (path === "/teams/t/members") return json([]);
    if (path === "/leaderboard") return json({ entries: [], current_user_team_rank: 2, current_user_team_xp: score, xp_to_next_rank: 25 });
    if (path === "/field-test-zero") return failSummary ? json({ detail: "Summary temporarily unavailable" }, 503) : json(summary());
    if (path === "/quests") return unavailable ? json({ detail: "Quest data temporarily unavailable" }, 503) : json(quests.map(detail));
    const q = quests.find(item => path.includes(`/quests/${item.id}`) || path.includes(`/quest-runs/r${item.field_test_step}/`));
    if (!q) return json({ detail: "Unexpected field request" }, 404);
    if (route.request().method() === "GET") return json(detail(q));
    if (expired) return json({ detail: "FIELD TEST 0 has expired" }, 409);
    if (path.endsWith("/start")) {
      counts.starts++; started = true; q.run = { id: `r${q.field_test_step}`, status: "started" };
      return respond("start", q.run, 201);
    }
    if (path.endsWith("/check-in")) {
      q.run!.gps_verified_at = "2026-10-27T11:30:00Z";
      return respond("gps", { run: q.run, awarded_xp: 0, already_completed: false });
    }
    if (path.endsWith("/hint")) {
      counts.hints++; const used = q.hint_used;
      if (!used) score -= 50;
      q.hint_used = true; q.hint_text = "Engine test code: ZERO2.";
      return respond("hint", { quest: detail(q), correct: null, awarded_xp: 0, penalty_xp: used ? 0 : 50, already_applied: used });
    }
    if (path.endsWith("/answer")) {
      counts.answers++;
      const correct = route.request().postDataJSON().answer.trim().toUpperCase() === `ZERO${q.field_test_step}`;
      if (!correct) {
        const used = q.wrong_answer_penalized;
        if (!used) score -= 25;
        q.wrong_answer_penalized = true;
        return respond("wrong", { quest: detail(q), correct: false, awarded_xp: 0, penalty_xp: used ? 0 : 25, already_applied: used });
      }
      score += 250; completed++; q.run!.status = "completed";
      return respond(q.field_test_step === 4 ? "finish" : "correct", { quest: detail(q), correct: true, awarded_xp: 250, penalty_xp: 0, already_applied: false });
    }
    return json({ detail: "Unexpected action" }, 404);
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "HOME", exact: true })).toBeEnabled();
  return { counts, expire: () => { expired = true; }, recover: () => { unavailable = false; }, failSummary: () => { failSummary = true; }, recoverSummary: () => { failSummary = false; } };
}

for (const width of [320, 390, 430]) {
  test(`FIELD TEST full 925 loop, lost responses and reload at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const { counts } = await mountField(page, { dropped: true });
    const panel = () => page.getByRole("region", { name: "FIELD TEST 0 progress" });
    await expect(panel()).toContainText("0 / 1000 XP");
    expect(counts.gps).toBe(0);
    await page.getByRole("button", { name: "QUESTS", exact: true }).click();
    await page.getByRole("button", { name: /^Opera LOCATION/ }).click();
    await expect(page.getByText("LOCKED / UP NEXT", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "START QUEST", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "ALL QUESTS", exact: true }).click();
    for (const [index, place] of ["Cascade", "Opera", "Aznavour Square", "Republic Square"].entries()) {
      const step = index + 1;
      await page.getByRole("button", { name: new RegExp(`^${place} LOCATION`) }).click();
      await page.getByRole("button", { name: "START QUEST", exact: true }).click();
      await expect(page.getByLabel("Test code", { exact: true })).toBeDisabled();
      await page.getByRole("button", { name: "CHECK IN", exact: true }).click();
      await expect(page.getByLabel("Test code", { exact: true })).toBeEnabled();
      await expect(page.getByText("Quest complete.", { exact: true })).toHaveCount(0);
      if (step === 2) {
        await page.getByRole("button", { name: "HINT · −50 XP", exact: true }).click();
        await expect(page.getByRole("group", { name: "Confirm hint penalty" })).toContainText("−50 XP");
        if (width === 390) await page.screenshot({ path: "test-results/field-test-hint-390.png", fullPage: true });
        await page.getByRole("button", { name: "CANCEL", exact: true }).click();
        expect(counts.hints).toBe(0);
        await page.getByRole("button", { name: "HINT · −50 XP", exact: true }).click();
        await page.getByRole("button", { name: "REVEAL HINT · −50 XP", exact: true }).click();
        await expect(page.getByText("Engine test code: ZERO2.", { exact: false })).toBeVisible();
        await page.reload();
        await page.getByRole("button", { name: "CONTINUE QUEST", exact: true }).click();
        await expect(page.getByLabel("Test code", { exact: true })).toBeEnabled();
        await expect(page.getByText("Engine test code: ZERO2.", { exact: false })).toBeVisible();
        expect(counts.hints).toBe(1); expect(counts.gps).toBe(2);
      }
      if (step === 3) {
        await page.getByLabel("Test code", { exact: true }).fill("WRONG");
        await page.getByRole("button", { name: "SUBMIT ANSWER", exact: true }).click();
        await expect(page.getByText("A −25 XP penalty is recorded", { exact: false })).toBeVisible();
        await page.getByLabel("Test code", { exact: true }).fill("WRONG AGAIN");
        await page.getByRole("button", { name: "SUBMIT ANSWER", exact: true }).click();
        await expect(page.getByText("Wrong answer. No additional penalty; try another code.", { exact: true })).toBeVisible();
      }
      await page.getByLabel("Test code", { exact: true }).fill(` zero${step} `);
      await page.getByRole("button", { name: "SUBMIT ANSWER", exact: true }).click();
      await expect(panel()).toContainText(`${[250, 450, 675, 925][index]} / 1000 XP`);
      if (step < 4) await page.getByRole("button", { name: "NEXT QUEST UNLOCKED", exact: true }).click();
    }
    await expect(panel()).toContainText("4 / 4 quests");
    await expect(panel()).toContainText("Elapsed 60:00");
    await expect(panel()).toContainText("Leaderboard #2");
    await expect(panel()).toContainText("FINISHED");
    expect(counts.gps).toBe(4); expect(counts.hints).toBe(1); expect(counts.starts).toBe(4);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.locator(".completion-actions")).toHaveCSS("opacity", "1");
    await page.screenshot({ path: `test-results/field-test-finish-${width}.png`, fullPage: true });
    await page.reload();
    await expect(panel()).toContainText("925 / 1000 XP");
    expect(counts.gps).toBe(4);
  });
}

test("FIELD TEST loading retry, expired state and summary retry", async ({ page }) => {
  const fixture = await mountField(page, { unavailable: true });
  await expect(page.getByRole("button", { name: "RETRY QUESTS", exact: true })).toBeVisible();
  fixture.recover();
  await page.getByRole("button", { name: "RETRY QUESTS", exact: true }).click();
  await page.getByRole("button", { name: "START QUEST", exact: true }).click();
  await expect(page.getByRole("button", { name: "CHECK IN", exact: true })).toBeEnabled();
  fixture.expire();
  await page.getByRole("button", { name: "CHECK IN", exact: true }).click();
  await expect(page.getByText("FIELD TEST 0 has expired", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Close check-in result", exact: true }).click();
  await page.getByRole("button", { name: "ALL QUESTS", exact: true }).click();
  const panel = page.getByRole("region", { name: "FIELD TEST 0 progress" });
  await expect(panel).toContainText("TIME EXPIRED");
  await expect(panel).toContainText("0 / 1000 XP");
  fixture.failSummary();
  await page.getByRole("button", { name: "REFRESH SUMMARY", exact: true }).click();
  await expect(page.getByRole("button", { name: "RETRY REFRESH", exact: true })).toBeVisible();
  fixture.recoverSummary();
  await page.getByRole("button", { name: "RETRY REFRESH", exact: true }).click();
  await expect(page.getByRole("button", { name: "RETRY REFRESH", exact: true })).toHaveCount(0);
  await page.screenshot({ path: "test-results/field-test-expired-390.png", fullPage: true });
  expect(fixture.counts.gps).toBe(1);
});


test("server summary expiry closes stale answer detail immediately", async ({ page }) => {
  const fixture = await mountField(page);
  await page.getByRole("button", { name: "START QUEST", exact: true }).click();
  await page.getByRole("button", { name: "CHECK IN", exact: true }).click();
  await expect(page.getByLabel("Test code", { exact: true })).toBeEnabled();
  fixture.expire();
  await page.getByLabel("Test code", { exact: true }).fill("ZERO1");
  await page.getByRole("button", { name: "SUBMIT ANSWER", exact: true }).click();
  await expect(page.getByRole("region", { name: "FIELD TEST 0 progress" })).toContainText("TIME EXPIRED");
  await expect(page.getByLabel("Test code", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "CHECK IN", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "ALL QUESTS", exact: true })).toBeEnabled();
  expect(fixture.counts.gps).toBe(1);
});
