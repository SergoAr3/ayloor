import { expect, test } from "@playwright/test";
import type { Quest } from "../src/types";
import { mount, openActive, started, type Options } from "./fixtures";

test("pending Home and Team are separate and do not request location", async ({ page }) => {
  const { counters } = await mount(page, { pending: true });
  await page.locator(".home-mission").getByRole("button", { name: "TEAM", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Test crew", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "HOME", exact: true }).click();
  await expect(page.locator(".home-mission").getByRole("button", { name: "TEAM", exact: true })).toBeVisible();
  expect(counters.starts).toBe(0); expect(counters.gps).toBe(0);
});

test("available Home starts once; navigation, detail and maps never request GPS", async ({ page, context }) => {
  const { counters } = await mount(page);
  await page.screenshot({ path: "test-results/home-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "START QUEST", exact: true }).dblclick();
  await expect(page.getByRole("button", { name: "CHECK IN", exact: true })).toBeVisible();
  expect(counters.starts).toBe(1);
  await expect(page.getByRole("link", { name: "OPEN IN MAPS" })).toHaveAttribute("href", "https://www.google.com/maps/search/?api=1&query=40%2C44");
  await context.route("https://www.google.com/maps/**", route => route.fulfill({ body: "Maps test" }));
  const popupPromise = page.waitForEvent("popup");
  await page.getByRole("link", { name: "OPEN IN MAPS" }).click();
  await (await popupPromise).close();
  await page.getByRole("button", { name: "ALL QUESTS", exact: true }).click();
  await page.getByRole("button", { name: "HOME", exact: true }).click();
  await expect(page.getByRole("button", { name: "CONTINUE QUEST", exact: true })).toBeVisible();
  expect(counters.gps).toBe(0); expect(counters.checkins).toBe(0);
  await expect(page.getByText(/Distance at last check-in/)).toHaveCount(0);
});

for (const kind of ["lostStart", "startConflict"] as const) {
  test(`Home restores ${kind} through detail with no POST retry`, async ({ page }) => {
    const { counters } = await mount(page, { [kind]: true });
    await page.getByRole("button", { name: "START QUEST", exact: true }).click();
    await expect(page.getByRole("button", { name: "CHECK IN", exact: true })).toBeVisible();
    expect(counters.starts).toBe(1); expect(counters.gps).toBe(0);
    await expect(page.getByRole("alert")).toHaveCount(0);
  });
}

for (const [kind, title] of [["denied", "LOCATION ACCESS DENIED"], ["unavailable", "GPS UNAVAILABLE"]] as const) {
  test(`${kind} location never calls completion`, async ({ page }) => {
    const { counters } = await mount(page, { run: started, [kind]: true });
    await openActive(page);
    await page.getByRole("button", { name: "CHECK IN", exact: true }).click();
    const area = page.getByRole("region", { name: "Quest check-in" });
    await expect(area.getByRole("alert")).toContainText(title);
    await expect(page.locator(".app > .error")).toHaveCount(0);
    if (kind === "denied") await expect(area.getByRole("button", { name: "LOCATION SETTINGS" })).toBeVisible();
    else await expect(area.getByRole("button", { name: "LOCATION SETTINGS" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "TRY AGAIN", exact: true })).toBeEnabled();
    expect(counters.checkins).toBe(0);
  });
}

for (const error of ["You are outside the checkpoint radius", "GPS accuracy is too low; retry with a clearer view of the sky"]) {
  test(`backend rejection preserves started quest: ${error}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 740 });
    const { counters } = await mount(page, { run: started, checkError: error, latitude: 40.352, accuracy: error.includes("accuracy") ? 151 : 25 }); await openActive(page);
    const area = page.getByRole("region", { name: "Quest check-in" });
    const button = area.getByRole("button", { name: "CHECK IN", exact: true });
    await page.locator(".quest-scroll").evaluate(node => { node.scrollTop = node.scrollHeight; });
    expect(await page.evaluate(() => scrollY)).toBe(0);
    await button.click();
    const feedback = area.getByRole("alert");
    await expect(feedback).toContainText(error.includes("accuracy") ? "GPS ACCURACY TOO LOW" : "FAR FROM THE CHECKPOINT.");
    await expect(feedback).toContainText(error.includes("accuracy") ? "try again" : "Open the map to find your way.");
    await expect(feedback).toBeInViewport({ ratio: 1 });
    await expect(page.locator(".app > .error")).toHaveCount(0);
    await expect(area.getByRole("button", { name: "LOCATION SETTINGS" })).toHaveCount(0);
    await expect(page.locator(".off-map-arrow")).toBeVisible();
    await expect(page.locator(".fix-dot")).toHaveCount(0);
    expect(await page.evaluate(() => scrollY)).toBe(0);
    await expect(page.getByText("QUEST ACTIVE", { exact: true })).toBeVisible();
    await expect(area.getByRole("button", { name: "TRY AGAIN", exact: true })).toBeEnabled();
    await expect(area.getByRole("button", { name: "TRY AGAIN", exact: true })).toBeInViewport({ ratio: 1 });
    await expect(area.getByText(/Not a live position/)).toBeVisible();
    expect(counters.gps).toBe(1);
    expect(counters.checkins).toBe(1);
  });
}

test("location timeout can be retried without completion", async ({ page }) => {
  const { counters } = await mount(page, { run: started, timeout: true }); await openActive(page);
  await page.clock.install();
  await page.getByRole("button", { name: "CHECK IN", exact: true }).click();
  const area = page.getByRole("region", { name: "Quest check-in" });
  await expect(area.getByRole("region", { name: "Check-in progress" })).toBeVisible();
  await expect(area.locator(".radar-ping")).toBeVisible();
  await expect(area.getByText("Checking your location once…")).toBeVisible();
  await expect(area.getByRole("status")).toHaveText("GETTING LOCATION…");
  await expect(area.getByRole("button", { name: "GETTING LOCATION…" })).toBeDisabled();
  await page.clock.fastForward(31000);
  await expect(area.getByRole("alert")).toContainText("CHECK-IN TIMED OUT");
  await expect(area.locator(".radar-ping")).toHaveCount(0);
  await expect(page.locator(".app > .error")).toHaveCount(0);
  await expect(area.getByRole("button", { name: "TRY AGAIN", exact: true })).toBeEnabled();
  expect(counters.checkins).toBe(0);
});

test("confirmed completion survives a failed leaderboard refresh", async ({ page }) => {
  await mount(page, { run: started, refreshFailure: true }); await openActive(page);
  await page.getByRole("button", { name: "CHECK IN", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Quest complete." })).toBeVisible();
  await expect(page.locator(".xp")).toHaveText("+100XP");
  await page.screenshot({ path: "test-results/complete-mobile.png", fullPage: true });
  await expect(page.getByRole("alert")).toContainText("leaderboard refresh failed");
  await expect(page.getByRole("button", { name: "CHECK IN", exact: true })).toHaveCount(0);
});

for (const kind of ["zero", "lost"] as const) {
  test(`${kind} completion result never invents a fresh XP award`, async ({ page }) => {
    await mount(page, { run: started, ...(kind === "zero" ? { awarded: 0 } : { lostCompletion: true }) }); await openActive(page);
    await page.getByRole("button", { name: "CHECK IN", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Quest complete." })).toBeVisible();
    await expect(page.locator(".xp")).toHaveCount(0);
    await expect(page.getByText(kind === "zero" ? /No new XP was awarded/ : /Completion confirmed by the server/)).toBeVisible();
  });
}

test("completed Home goes to real ranks without another start", async ({ page }) => {
  const { counters } = await mount(page, { run: { id: "r", status: "completed" } });
  await page.getByRole("button", { name: "VIEW RANKS" }).click();
  await expect(page.locator(".ranking .own")).toBeVisible();
  expect(counters.starts).toBe(0); expect(counters.gps).toBe(0);
});

test("401 clears gameplay and token", async ({ page }) => {
  const state = await mount(page, { run: started });
  state.expire();
  await page.getByRole("button", { name: "TEAM", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Session expired");
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "CHECK IN", exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => sessionStorage.getItem("ayloor-token"))).toBeNull();
});

test("null ranking and empty quests never become fake progress", async ({ page }) => {
  await mount(page, { empty: true, nullRanking: true });
  await expect(page.getByText("No active season right now. Your crew can still get ready.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Next drop is coming.", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "START QUEST", exact: true })).toHaveCount(0);
  await expect(page.locator(".home-progress .stat strong").nth(0)).toHaveText("— XP");
  await expect(page.locator(".home-progress .stat strong").nth(1)).toHaveText("—");
});

test("empty available quests keep XP unknown when the leaderboard request fails", async ({ page }) => {
  await mount(page, { quests: [], seasonXp: 300 });
  const xp = page.locator(".home-progress .stat strong").first();
  await expect(xp).toHaveText("300 XP");
  await page.route("**/api/v1/leaderboard", route => route.fulfill({ status: 503, json: { detail: "Board offline" } }));
  await page.reload();
  await expect(page.getByRole("heading", { name: "Next drop is coming.", exact: true })).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("leaderboard refresh failed");
  await expect(xp).toHaveText("— XP");
  await expect(page.locator(".home-progress")).not.toContainText("0 XP");
});

for (const xp of [0, 300]) test(`empty available quests show confirmed server ${xp} XP`, async ({ page }) => {
  await mount(page, { quests: [], seasonXp: xp });
  await expect(page.locator(".home-progress .stat strong").first()).toHaveText(`${xp} XP`);
});

for (const width of [320, 360, 390]) {
  test(`${width}px screens fit long names, five members and focused input`, async ({ page }) => {
    await page.setViewportSize({ width, height: 740 });
    await mount(page, { longNames: true, run: started });
    for (const tab of ["HOME", "TEAM", "QUESTS", "RANKS"]) {
      await page.getByRole("button", { name: tab, exact: true }).click();
      await expect(page.getByRole("button", { name: tab, exact: true })).toBeEnabled();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (width === 390) await page.screenshot({ path: `test-results/${tab.toLowerCase()}-long-mobile.png`, fullPage: true });
    }
    await page.getByRole("button", { name: "HOME", exact: true }).click();
    await openActive(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/quest-${width}.png`, fullPage: true });
  });
}

test("create input fits a reduced viewport while focused", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 400 }); await mount(page, { noTeam: true });
  await page.getByLabel("Team name", { exact: true }).fill("Crew ".repeat(16));
  await page.getByLabel("Team name", { exact: true }).focus();
  await page.getByRole("button", { name: "CREATE TEAM", exact: true }).scrollIntoViewIfNeeded();
  const box = await page.getByRole("button", { name: "CREATE TEAM", exact: true }).boundingBox();
  const nav = await page.getByRole("navigation").boundingBox();
  expect(box!.y + box!.height).toBeLessThanOrEqual(nav!.y);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("Home quest read failure does not hide confirmed membership", async ({ page }) => {
  await mount(page, { pending: true });
  await page.route("**/api/v1/quests", route => route.fulfill({ status: 503, json: { detail: "Quest list unavailable" } }));
  await page.getByRole("button", { name: "HOME", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Quest list unavailable");
  await page.locator(".home-mission").getByRole("button", { name: "TEAM", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Test crew", exact: true })).toBeVisible();
});

for (const reason of ["Invalid or expired Telegram initData", "Configuration unavailable"] as const) {
  test(`bootstrap failure remains actionable: ${reason}`, async ({ page }) => {
    await mount(page);
    const auth = reason.includes("initData");
    await page.route(`**/api/v1/${auth ? "auth/telegram" : "config"}`, route => route.fulfill({ status: auth ? 401 : 503, json: { detail: reason } }));
    await page.reload();
    await expect(page.locator(".app > .error")).toContainText(reason);
    await expect(page.getByRole("button", { name: "RETRY TELEGRAM SIGN IN" })).toBeEnabled();
    await expect(page.getByRole("navigation")).toHaveCount(0);
  });
}

test("expired invite is shown without hiding the create form", async ({ page }) => {
  await mount(page, { noTeam: true });
  await page.route("**/api/v1/invites/bad", route => route.fulfill({ status: 410, json: { detail: "Invite has expired" } }));
  await page.goto("/?invite=bad");
  await expect(page.getByRole("alert")).toContainText("Invite has expired");
  await expect(page.getByRole("button", { name: "CREATE TEAM", exact: true })).toBeVisible();
});

test("closed run never exposes start or check-in", async ({ page }) => {
  await mount(page, { run: { id: "r", status: "failed" } });
  await page.getByRole("button", { name: "QUESTS", exact: true }).click();
  await page.getByRole("button", { name: /Test public checkpoint/ }).click();
  await expect(page.getByText("This quest run is closed.")).toBeVisible();
  await expect(page.getByRole("button", { name: "START QUEST", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "CHECK IN", exact: true })).toHaveCount(0);
});

test("in-flight quest success cannot restore gameplay after a 401", async ({ page }) => {
  const state = await mount(page);
  let release!: () => void;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  let startedRequest!: () => void;
  const requested = new Promise<void>(resolve => { startedRequest = resolve; });
  await page.route("**/api/v1/quests", async route => {
    startedRequest(); await blocked;
    await route.fulfill({ json: [{ id: "stale", title: "STALE QUEST", run: null }] });
  });
  // Reload starts an independent Home read. Expire a later membership request.
  await page.reload();
  await requested;
  await expect(page.getByRole("button", { name: "TEAM", exact: true })).toBeEnabled();
  state.expire();
  await page.getByRole("button", { name: "TEAM", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Session expired");
  release();
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await expect(page.getByText("STALE QUEST")).toHaveCount(0);
});

test("retry after config failure restores an existing tab session without fresh initData", async ({ page }) => {
  await mount(page);
  await page.route("https://telegram.org/js/telegram-web-app.js", route => route.fulfill({ contentType: "application/javascript", body: "window.Telegram={WebApp:{initData:'',ready(){},expand(){}}};" }));
  let offline = true;
  await page.route("**/api/v1/config", route => route.fulfill({ status: offline ? 503 : 200, json: offline ? { detail: "Configuration offline" } : { development_gps_enabled: false } }));
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("Configuration offline");
  offline = false;
  await page.getByRole("button", { name: "RETRY TELEGRAM SIGN IN" }).click();
  await expect(page.getByRole("navigation")).toBeVisible();
  await expect(page.getByRole("button", { name: "START QUEST", exact: true })).toBeVisible();
});

test("server verification loading stays local and succeeds without an error banner", async ({ page }) => {
  let finish!: () => void;
  const verificationWait = new Promise<void>(resolve => { finish = resolve; });
  const { counters } = await mount(page, { run: started, verificationWait }); await openActive(page);
  const area = page.getByRole("region", { name: "Quest check-in" });
  await area.getByRole("button", { name: "CHECK IN", exact: true }).click();
  await expect(area.getByRole("region", { name: "Check-in progress" })).toBeVisible();
  await expect(area.locator(".radar-ping")).toBeVisible();
  await page.screenshot({ path: "test-results/check-in-sheet.png" });
  await expect(area.getByRole("status")).toHaveText("VERIFYING CHECKPOINT…");
  await expect(area.getByRole("button", { name: "VERIFYING CHECKPOINT…" })).toBeDisabled();
  await expect(page.getByRole("alert")).toHaveCount(0);
  finish();
  await expect(page.getByRole("heading", { name: "Quest complete.", exact: true })).toBeVisible();
  await expect(page.locator(".xp")).toHaveText("+100XP");
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(counters.checkins).toBe(1);
});

test("check-in server failures are local and a manual retry clears feedback", async ({ page }) => {
  const options: Options = { run: started, checkError: "Verification temporarily unavailable", checkErrorStatus: 503 };
  const { counters } = await mount(page, options); await openActive(page);
  const area = page.getByRole("region", { name: "Quest check-in" });
  await area.getByRole("button", { name: "CHECK IN", exact: true }).click();
  await expect(area.getByRole("alert")).toContainText("CHECK-IN FAILED");
  await expect(area.getByRole("alert")).toContainText("Verification temporarily unavailable");
  await expect(page.locator(".app > .error")).toHaveCount(0);
  await expect(area.getByRole("button", { name: "TRY AGAIN", exact: true })).toBeEnabled();
  options.checkError = undefined;
  await area.getByRole("button", { name: "TRY AGAIN", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Quest complete.", exact: true })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(counters.checkins).toBe(2);
});

test("membership failure during check-in stays a global app error", async ({ page }) => {
  await mount(page, { run: started, checkError: "You are not a current member of this team", checkErrorStatus: 403 }); await openActive(page);
  const area = page.getByRole("region", { name: "Quest check-in" });
  await area.getByRole("button", { name: "CHECK IN", exact: true }).click();
  await expect(page.locator(".app > .error")).toContainText("You are not a current member of this team");
  await expect(area.getByRole("alert")).toHaveCount(0);
});

test("session expiration during check-in remains global and hides local actions", async ({ page }) => {
  const state = await mount(page, { run: started }); await openActive(page);
  state.expire();
  await page.getByRole("button", { name: "CHECK IN", exact: true }).click();
  await expect(page.locator(".app > .error")).toContainText("Session expired");
  await expect(page.getByRole("region", { name: "Quest check-in" })).toHaveCount(0);
  await expect(page.getByRole("navigation")).toHaveCount(0);
});

test("location settings is denied-access recovery only; click calls native API once without GPS/check-in", async ({ page }) => {
  const { counters } = await mount(page, { run: started, denied: true, grantOnSettings: true }); await openActive(page);
  const area = page.getByRole("region", { name: "Quest check-in" });
  await expect(area.getByRole("button", { name: "LOCATION SETTINGS" })).toHaveCount(0);
  await area.getByRole("button", { name: "CHECK IN", exact: true }).click();
  await expect(area.getByRole("alert")).toContainText("LOCATION ACCESS DENIED");
  const settings = area.getByRole("button", { name: "LOCATION SETTINGS" });
  await expect(settings).toBeVisible();
  await expect(settings).toBeEnabled();
  const before = { ...counters };
  await settings.click();
  await expect.poll(() => counters.settings).toBe(1);
  expect(counters.gps).toBe(before.gps);
  expect(counters.checkins).toBe(0);
  expect(counters.api).toBe(before.api);
  // SDK metadata updates hide the CTA after access is granted; no GPS is requested.
  await expect(area.getByRole("button", { name: "LOCATION SETTINGS" })).toHaveCount(0);
  await expect(area.getByRole("button", { name: "TRY AGAIN", exact: true })).toBeEnabled();
});

for (const missing of ["missingSettings", "missingManager", "oldClient"] as const) {
  test(`${missing} never exposes a broken location settings CTA`, async ({ page }) => {
    const { counters } = await mount(page, { run: started, denied: true, [missing]: true }); await openActive(page);
    const area = page.getByRole("region", { name: "Quest check-in" });
    await area.getByRole("button", { name: "CHECK IN", exact: true }).click();
    await expect(area.getByRole("alert")).toBeVisible();
    await expect(area.getByRole("button", { name: "LOCATION SETTINGS" })).toHaveCount(0);
    await expect(area.getByText(/permissions manually or update Telegram/)).toBeVisible();
    expect(counters.settings).toBe(0);
    expect(counters.checkins).toBe(0);
  });
}

test("normal GPS, verification failure and completion never offer location settings", async ({ page }) => {
  const options: Options = { run: started, checkError: "Verification temporarily unavailable", checkErrorStatus: 503 };
  await mount(page, options); await openActive(page);
  await expect(page.getByRole("button", { name: "LOCATION SETTINGS" })).toHaveCount(0);
  await page.getByRole("button", { name: "CHECK IN", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("CHECK-IN FAILED");
  await expect(page.getByRole("button", { name: "LOCATION SETTINGS" })).toHaveCount(0);
  options.checkError = undefined;
  await page.getByRole("button", { name: "TRY AGAIN", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Quest complete.", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "LOCATION SETTINGS" })).toHaveCount(0);
});

test("native settings failure stays local and leaves a manual recovery message", async ({ page }) => {
  await mount(page, { run: started, denied: true, settingsThrows: true }); await openActive(page);
  const area = page.getByRole("region", { name: "Quest check-in" });
  await area.getByRole("button", { name: "CHECK IN", exact: true }).click();
  await area.getByRole("button", { name: "LOCATION SETTINGS" }).click();
  await expect(area.getByRole("alert")).toContainText("Location settings could not be opened");
  await expect(area.getByRole("button", { name: "LOCATION SETTINGS" })).toHaveCount(0);
  await expect(page.locator(".app > .error")).toHaveCount(0);
});

for (const width of [320, 360, 390]) {
  test(`MAP and authored PLACE fit ${width}px without requesting GPS; completion CTAs clear nav`, async ({ page }) => {
    await page.setViewportSize({ width, height: 740 });
    await page.route("https://images.example.org/place.png", route => route.fulfill({ path: "public/assets/street-frequency/yerevan-collage.png" }));
    const { counters } = await mount(page, { run: started, questContent: { radius_m: 175, base_xp: 230, place_label: "Public entrance", look_for_hint: "The blue sign by the entrance", hero_image_url: "https://images.example.org/place.png" } });
    await openActive(page);
    await page.evaluate(() => { document.documentElement.style.setProperty("--tg-safe-area-inset-bottom", "24px"); document.documentElement.style.setProperty("--tg-content-safe-area-inset-bottom", "12px"); });
    await expect(page.locator(".quest-facts")).toContainText("175 M");
    await expect(page.locator(".quest-facts")).toContainText("+230 XP");
    await expect(page.locator(".fix-label")).toHaveCount(0);
    await page.getByRole("button", { name: "PLACE WHAT TO RECOGNIZE" }).click();
    await expect(page.getByRole("img", { name: "Checkpoint: Public entrance" })).toBeVisible();
    await expect(page.getByText("The blue sign by the entrance", { exact: false })).toBeVisible();
    await page.screenshot({ path: `test-results/place-${width}.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(counters.gps).toBe(0); expect(counters.checkins).toBe(0);
    await page.getByRole("button", { name: "MAP WHERE TO GO" }).click();
    await page.screenshot({ path: `test-results/map-${width}.png`, fullPage: true });
    await page.getByRole("button", { name: "CHECK IN", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Quest complete." })).toBeVisible();
    await expect(page.locator(".radar-ping")).toHaveCount(0);
    const cta = page.getByRole("button", { name: "BACK TO TEAM", exact: true });
    await cta.scrollIntoViewIfNeeded();
    const box = await cta.boundingBox(), nav = await page.getByRole("navigation").boundingBox();
    expect(box!.y + box!.height).toBeLessThanOrEqual(nav!.y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/completion-${width}.png`, fullPage: true });
  });
}

test("missing and broken authored content degrades without prototype defaults", async ({ page }) => {
  const options: Options = { run: started };
  const { counters } = await mount(page, options); await openActive(page);
  await expect(page.locator(".checkpoint-caption")).toHaveCount(0);
  await expect(page.locator(".zone-map figcaption .map-link")).toBeVisible();
  await page.getByRole("button", { name: "PLACE WHAT TO RECOGNIZE" }).click();
  await expect(page.getByText("No place photo has been added yet.")).toBeVisible();
  await expect(page.getByText(/No recognition hint has been added yet/)).toBeVisible();
  await expect(page.getByRole("img")).toHaveCount(0);
  expect(counters.gps).toBe(0);
  options.questContent = { hero_image_url: "https://images.example.org/broken.jpg" };
  await page.route("https://images.example.org/broken.jpg", route => route.fulfill({ status: 404, body: "missing" }));
  await page.reload(); await openActive(page);
  await page.getByRole("button", { name: "PLACE WHAT TO RECOGNIZE" }).click();
  await expect(page.getByText("Place photo is unavailable.")).toBeVisible();
});

test("outside attempt shows measured distance, accuracy and schematic fix; retry clears stale fix", async ({ page }) => {
  const options: Options = { run: started, latitude: 40.0030577, accuracy: 18, checkError: "You are outside the checkpoint radius" };
  const { counters } = await mount(page, options); await openActive(page);
  await expect(page.locator(".radar-ping")).toHaveCount(0);
  await page.getByRole("button", { name: "CHECK IN", exact: true }).click();
  const area = page.getByRole("region", { name: "Quest check-in" });
  await expect(area.locator(".result-metrics")).toContainText("340 MFROM CHECKPOINT");
  await expect(area.locator(".result-metrics")).toContainText("±18 MGPS SAMPLE");
  await expect(page.getByRole("figure", { name: "Checkpoint zone map" }).locator(".fix-label")).toHaveCount(1);
  await expect(page.locator(".app > .error")).toHaveCount(0);
  await expect(page.getByText("QUEST ACTIVE", { exact: true })).toBeVisible();
  await expect(area.getByRole("button", { name: "TRY AGAIN", exact: true })).toBeEnabled();
  await page.screenshot({ path: "test-results/outside-zone.png", fullPage: true });
  expect(counters.gps).toBe(1); expect(counters.checkins).toBe(1);
  await page.clock.install();
  await page.evaluate(() => {
    const manager = window.Telegram!.WebApp.LocationManager!;
    const measure = manager.getLocation.bind(manager);
    manager.getLocation = callback => { setTimeout(() => measure(callback), 1000); };
  });
  options.checkError = undefined;
  await area.getByRole("button", { name: "TRY AGAIN", exact: true }).click();
  await expect(area.getByRole("status")).toHaveText("GETTING LOCATION…");
  await expect(page.locator(".fix-label")).toHaveCount(0);
  await expect(area.getByRole("alert")).toHaveCount(0);
  await page.clock.fastForward(1000);
  await expect(page.getByRole("heading", { name: "Quest complete." })).toBeVisible();
  await expect(page.locator(".radar-ping")).toHaveCount(0);
  expect(counters.gps).toBe(2); expect(counters.checkins).toBe(2);
});

for (const pending of [false, true]) {
  test(`completed quest opens read-only MAP/PLACE without gameplay writes (${pending ? "pending" : "active"} team)`, async ({ page }) => {
    const content = { radius_m: 125, base_xp: 175, place_label: "FIELD TEST CHECKPOINT", look_for_hint: "the exact outdoor point marked for this field test.", hero_image_url: "https://images.example.org/field-test.png" };
    await page.route(content.hero_image_url, route => route.fulfill({ path: "public/assets/street-frequency/yerevan-collage.png" }));
    const writes: string[] = [];
    page.on("request", request => { if (request.method() === "POST" && /\/(start|check-in)$/.test(new URL(request.url()).pathname)) writes.push(request.url()); });
    const { counters } = await mount(page, { run: { id: "r", status: "completed" }, pending, questContent: content });
    await page.getByRole("button", { name: "QUESTS", exact: true }).click();
    const card = page.locator(".quest-row");
    await expect(card.locator("..").locator(".quest-done-stamp")).toHaveText("DONE ✓");
    const open = card;
    await expect(page.getByRole("button", { name: "OPEN DETAILS" })).toHaveCount(0);
    await expect(open).toBeEnabled(); await open.click();
    await expect(page.getByRole("heading", { name: "Test public checkpoint" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Quest completion" })).toContainText("QUEST COMPLETE");
    await expect(page.getByRole("region", { name: "Quest completion" })).toContainText("+175 XP");
    await expect(page.locator(".quest-facts")).toContainText("125 M");
    await expect(page.locator(".quest-facts")).toContainText("+175 XP");
    await expect(page.locator(".checkpoint-caption .eyebrow")).toHaveText("CHECKPOINT");
    await expect(page.locator(".checkpoint-caption strong")).toHaveText(content.place_label);
    await page.getByRole("button", { name: "PLACE WHAT TO RECOGNIZE" }).click();
    await expect(page.getByRole("heading", { name: content.place_label })).toBeVisible();
    const hint = page.locator(".place-content > p");
    await expect(hint).toHaveText(`Look for: ${content.look_for_hint}`);
    await expect(hint.locator("strong")).toHaveText("Look for:");
    const photo = page.getByRole("img", { name: `Checkpoint: ${content.place_label}` });
    await expect(photo).toBeVisible();
    expect(await photo.evaluate(img => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await page.getByRole("button", { name: "MAP WHERE TO GO" }).click();
    await expect(page.getByRole("figure", { name: "Checkpoint zone map" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^(START QUEST|CHECK IN|LOCATION SETTINGS|RETRY)/ })).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Quest check-in", exact: true })).toHaveCount(0);
    await expect(page.locator(".radar-ping")).toHaveCount(0);
    await page.getByRole("button", { name: "ALL QUESTS", exact: true }).click();
    await expect(card.locator("..").locator(".quest-done-stamp")).toHaveText("DONE ✓");
    await card.click();
    await page.getByRole("button", { name: "BACK TO QUESTS", exact: true }).click();
    await page.getByRole("button", { name: "RANKS", exact: true }).click();
    await expect(page.locator(".ranking .own")).toContainText("100 XP");
    expect(counters.gps).toBe(0); expect(counters.starts).toBe(0); expect(counters.checkins).toBe(0);
    expect(writes).toEqual([]);
  });
}

// Frontend-only density fixtures. Never written to development PostgreSQL.
function manyQuests(): Quest[] {
  return ["Public square checkpoint", "Republic Square", "Cascade", "Vernissage Market", "Blue Mosque", "A very long checkpoint title at the public square entrance", "Northern avenue", "Final public checkpoint"].map((title, i) => ({
    id: `fixture-${i}`, title, description: "Frontend layout fixture only.", base_xp: 100, radius_m: 100, latitude: 40, longitude: 44,
    run: i === 1 ? { id: "r", status: "started" } : i >= 2 && i <= 4 ? { id: `done-${i}`, status: "completed" } : null,
  }));
}

for (const width of [320, 360, 390]) {
  test(`many-quest rows, filters and real progress fit ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 740 });
    const fixtures = manyQuests();
    const { counters } = await mount(page, { quests: fixtures, seasonXp: 375 });
    await page.getByRole("button", { name: "QUESTS", exact: true }).click();
    const rows = page.locator("button.quest-row");
    await expect(rows).toHaveCount(8);
    await expect(page.getByRole("button", { name: "OPEN DETAILS" })).toHaveCount(0);
    await expect(rows.first()).toContainText("Republic Square");
    await expect(rows.first()).toContainText("IN PROGRESS");
    await expect(page.locator(".quest-row.completed")).toHaveCount(3);
    await expect(page.getByRole("region", { name: "Season progress" })).toContainText("3 / 8 · 375 XP");
    await expect(page.getByRole("progressbar", { name: "Completed checkpoints" })).toHaveAttribute("aria-valuemax", "8");
    await expect(page.locator(".season-segments .filled")).toHaveCount(3);
    await expect(page.getByRole("button", { name: "ALL 8", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "TO DO 5", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "DONE 3", exact: true })).toBeVisible();
    await expect(rows.locator("button, .action")).toHaveCount(0);
    const heights = await rows.evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().height));
    expect(heights.every(height => height >= 44)).toBe(true);
    expect(heights.filter(height => height <= 100).length).toBeGreaterThanOrEqual(6);
    expect(heights.reduce((total, height) => total + height, 0)).toBeLessThan(950);
    for (const row of await rows.all()) {
      const title = await row.locator(".quest-title-line").boundingBox();
      const xp = await row.locator(".quest-row-end").boundingBox();
      expect(title!.x + title!.width).toBeLessThanOrEqual(xp!.x);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await rows.last().scrollIntoViewIfNeeded();
    const last = await rows.last().boundingBox(), nav = await page.getByRole("navigation").boundingBox();
    expect(last!.y + last!.height).toBeLessThanOrEqual(nav!.y);
    await page.screenshot({ path: `test-results/quests-many-${width}.png`, fullPage: true });
    await page.getByRole("button", { name: "TO DO 5", exact: true }).click();
    await expect(rows).toHaveCount(5);
    await expect(page.locator(".quest-row.completed")).toHaveCount(0);
    await page.getByRole("button", { name: "DONE 3", exact: true }).click();
    await expect(rows).toHaveCount(3);
    await expect(page.getByRole("group", { name: "AVAILABLE", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "ALL 8", exact: true }).click();
    await rows.filter({ hasText: fixtures[5].title }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: fixtures[5].title })).toBeVisible();
    await expect(page.getByRole("button", { name: "START QUEST", exact: true })).toBeVisible();
    expect(counters.gps).toBe(0); expect(counters.starts).toBe(0); expect(counters.checkins).toBe(0);
  });
}

test("unstarted row opens MAP and PLACE before explicit START, without GPS or gameplay POST", async ({ page }) => {
  const content = { place_label: "FIELD TEST CHECKPOINT", look_for_hint: "the exact outdoor point marked for this field test.", hero_image_url: "https://images.example.org/unstarted.png" };
  await page.route(content.hero_image_url, route => route.fulfill({ path: "public/assets/street-frequency/yerevan-collage.png" }));
  const { counters } = await mount(page, { questContent: content });
  await page.getByRole("button", { name: "QUESTS", exact: true }).click();
  await expect(page.getByRole("region", { name: "Season progress" })).toContainText("0 / 1 · 0 XP");
  await expect(page.locator(".quest-row")).toHaveCount(1);
  await page.locator(".quest-row").click();
  await expect(page.getByRole("heading", { name: "Test public checkpoint" })).toBeVisible();
  await expect(page.getByText("Reach the public square by a safe path.", { exact: true })).toBeVisible();
  await expect(page.locator(".quest-facts")).toContainText("100 M");
  await expect(page.locator(".quest-facts")).toContainText("TEAM QUEST");
  await expect(page.locator(".quest-facts")).toContainText("+100 XP");
  await expect(page.locator(".checkpoint-caption strong")).toHaveText(content.place_label);
  await expect(page.getByRole("link", { name: "OPEN IN MAPS" })).toBeVisible();
  await page.getByRole("button", { name: "PLACE WHAT TO RECOGNIZE" }).click();
  await expect(page.getByRole("heading", { name: content.place_label })).toBeVisible();
  await expect(page.locator(".place-content > p")).toHaveText(`Look for: ${content.look_for_hint}`);
  await expect(page.getByRole("img", { name: `Checkpoint: ${content.place_label}` })).toBeVisible();
  await page.getByRole("button", { name: "MAP WHERE TO GO" }).click();
  await expect(page.locator(".fix-label")).toHaveCount(0);
  await expect(page.getByText(/Distance at last check-in|GPS ACCURACY/)).toHaveCount(0);
  await expect(page.locator(".radar-ping")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "CHECK IN", exact: true })).toHaveCount(0);
  const start = page.getByRole("button", { name: "START QUEST", exact: true });
  await expect(start).toBeEnabled();
  expect(counters.gps).toBe(0); expect(counters.starts).toBe(0); expect(counters.checkins).toBe(0);
  // Explicit click in this synthetic fixture is the only action that creates a run.
  await start.click();
  await expect(page.getByRole("button", { name: "CHECK IN", exact: true })).toBeEnabled();
  expect(counters.starts).toBe(1); expect(counters.gps).toBe(0); expect(counters.checkins).toBe(0);
});

for (const width of [320, 360, 390]) {
test(`pending team discovers quests and TEAM recovery without START at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 740 });
  const { counters } = await mount(page, { pending: true, quests: manyQuests() });
  await page.getByRole("button", { name: "QUESTS", exact: true }).click();
  await expect(page.getByRole("heading", { name: "GATHER YOUR TEAM", exact: true })).toBeVisible();
  await expect(page.getByText("Quests start with 2 players. You have 1.", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Season progress" })).toHaveCount(0);
  await expect(page.locator(".quest-row.team-locked")).toHaveCount(5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator(".quest-row").last().scrollIntoViewIfNeeded();
  const last = await page.locator(".quest-row").last().boundingBox(), nav = await page.getByRole("navigation").boundingBox();
  expect(last!.y + last!.height).toBeLessThanOrEqual(nav!.y);
  await page.screenshot({ path: `test-results/quests-pending-${width}.png`, fullPage: true });
  await page.locator(".gather-team").getByRole("button", { name: "TEAM", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Test crew", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "QUESTS", exact: true }).click();
  await page.locator(".quest-row.available").first().click();
  await expect(page.getByRole("figure", { name: "Checkpoint zone map" })).toBeVisible();
  await expect(page.getByText("Gather at least two teammates to start a quest.")).toBeVisible();
  await expect(page.getByRole("button", { name: "START QUEST", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "CHECK IN", exact: true })).toHaveCount(0);
  expect(counters.gps).toBe(0); expect(counters.starts).toBe(0); expect(counters.checkins).toBe(0);
});

}

for (const width of [320, 360, 390]) {
  for (const state of ["unstarted", "active", "completed"] as const) {
    test(`compact ${state} detail keeps actions above safe-area nav at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      const { counters } = await mount(page, { run: state === "unstarted" ? null : { id: "r", status: state === "active" ? "started" : "completed" }, questContent: { title: "First Checkpoint", description: "Temporary real checkpoint for AYLOOR v0.1 smoke-test.", place_label: "FIELD TEST CHECKPOINT" } });
      await page.getByRole("button", { name: "QUESTS", exact: true }).click();
      await page.locator(".quest-row").click();
      await page.evaluate(() => {
        document.documentElement.style.setProperty("--tg-safe-area-inset-top", "16px");
        document.documentElement.style.setProperty("--tg-content-safe-area-inset-top", "8px");
        document.documentElement.style.setProperty("--tg-safe-area-inset-bottom", "20px");
        document.documentElement.style.setProperty("--tg-content-safe-area-inset-bottom", "8px");
      });
      const action = page.getByRole("button", { name: state === "unstarted" ? "START QUEST" : state === "active" ? "CHECK IN" : "BACK TO QUESTS", exact: true });
      await expect(action).toBeInViewport({ ratio: 1 });
      await expect(action).toBeEnabled();
      const button = await action.boundingBox();
      await expect(page.getByRole("navigation")).toHaveCount(0);
      expect(button!.y + button!.height).toBeLessThanOrEqual(844);
      await expect(page.locator(".quest-facts .quest-reward")).toHaveText("+100 XP");
      await expect(page.locator(".quest-detail").getByText("+100 XP", { exact: true })).toHaveCount(1);
      await expect(page.locator(".quest-detail").getByText("TEAM QUEST", { exact: true })).toHaveCount(1);
      await expect(page.locator(".zone-summary")).toHaveCount(0);
      await expect(page.locator(".quest-back")).toHaveCSS("margin-bottom", "0px");
      await expect(page.locator(".quest-heading")).toHaveCSS("padding-top", "8px");
      await expect(page.locator(".wordmark .brand-mark")).toHaveAttribute("fill", "currentColor");
      await expect(page.locator(".map-footer-main .map-link .arrow-icon")).toHaveCount(1);
      expect(await page.locator(".app").innerText()).not.toContain("\u2197");
      const heading = await page.getByRole("heading", { name: "First Checkpoint" }).boundingBox();
      const font = await page.getByRole("heading", { name: "First Checkpoint" }).evaluate(node => parseFloat(getComputedStyle(node).fontSize));
      expect(font).toBeLessThanOrEqual(72);
      expect(font).toBeGreaterThanOrEqual(48);
      expect(heading!.height).toBeLessThanOrEqual(font * 2 + 8);
      if (width === 390) {
        await page.locator(".quest-scroll").evaluate(el=>{el.scrollTop=el.scrollHeight;});
        const map = await page.getByRole("figure", { name: "Checkpoint zone map" }).boundingBox();
        const dock = await page.locator(".quest-dock").boundingBox();
        expect(map!.y + map!.height).toBeLessThanOrEqual(dock!.y);
      }
      if (state === "completed") {
        await expect(page.getByText("QUEST COMPLETE ✓", { exact: true })).toBeVisible();
        await expect(page.getByRole("button", { name: /^(START QUEST|CHECK IN)$/ })).toHaveCount(0);
        await expect(page.locator(".unstarted-actions, .check-in-action")).toHaveCount(0);
      }
      await page.screenshot({ path: `test-results/compact-${state}-${width}.png` });
      await page.locator(".quest-scroll").evaluate(node => { node.scrollTop = node.scrollHeight; });
      await expect(action).toBeInViewport({ ratio: 1 });
      expect(await page.evaluate(() => scrollY)).toBe(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      // A short client viewport still reserves both the action and the real nav height.
      await page.setViewportSize({ width, height: 580 });
      await expect(action).toBeInViewport({ ratio: 1 });
      const shortButton = await action.boundingBox();
      await expect(page.getByRole("navigation")).toHaveCount(0);
      expect(shortButton!.y + shortButton!.height).toBeLessThanOrEqual(580);
      expect(counters.gps).toBe(0); expect(counters.starts).toBe(0); expect(counters.checkins).toBe(0);
    });
  }
  test(`compact completion keeps both CTAs visible above nav at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 740 });
    await mount(page, { run: started }); await openActive(page);
    // Synthetic fixture only; no real development quest is started/completed by this test.
    await page.getByRole("button", { name: "CHECK IN", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Quest complete." })).toBeVisible();
    await page.evaluate(() => {
      document.documentElement.style.setProperty("--tg-safe-area-inset-bottom", "24px");
      document.documentElement.style.setProperty("--tg-content-safe-area-inset-bottom", "12px");
    });
    const nav = await page.getByRole("navigation").boundingBox();
    for (const name of ["VIEW LEADERBOARD", "BACK TO TEAM"]) {
      const cta = page.getByRole("button", { name, exact: true });
      await expect(cta).toBeInViewport({ ratio: 1 });
      await expect(cta).toBeEnabled();
      const box = await cta.boundingBox();
      expect(box!.y + box!.height).toBeLessThanOrEqual(nav!.y);
    }
    await expect(page.locator(".completion-team")).toContainText("100 XP THIS SEASON");
    const teamBox = await page.locator(".completion-team").boundingBox(), dockBox = await page.locator(".completion-actions").boundingBox();
    expect(teamBox!.y + teamBox!.height).toBeLessThanOrEqual(dockBox!.y);
    await expect(page.locator(".completion-rank")).toContainText("#1");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.evaluate(() => scrollY)).toBe(0);
    await page.screenshot({ path: `test-results/compact-complete-${width}.png` });
    await page.getByRole("button", { name: "VIEW LEADERBOARD", exact: true }).click();
    await expect(page.locator(".ranking .own")).toContainText("100 XP");
  });
}

test("quest progress keeps its accepted label for a fully named season", async ({ page }) => {
  await mount(page, { seasonName: "AYLOOR YEREVAN — SEASON ZERO" });
  await page.getByRole("button", { name: "QUESTS", exact: true }).click();
  await expect(page.locator(".season-summary > span")).toHaveText("SEASON PROGRESS");
  await expect(page.locator(".season-summary")).not.toContainText("AYLOOR YEREVAN");
});

test("long quest titles remain fully readable while START remains visible", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  const title = "A very long checkpoint title at the public square entrance and pedestrian passage";
  const { counters } = await mount(page, { questContent: { title } });
  await page.getByRole("button", { name: "QUESTS", exact: true }).click();
  await page.locator(".quest-row").click();
  const heading = page.getByRole("heading", { name: title });
  await expect(heading).toHaveAttribute("title", title);
  await expect(heading.locator(".quest-title-sticker")).toHaveCount(1);
  expect(await heading.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  await expect(page.getByRole("button", { name: "START QUEST", exact: true })).toBeInViewport({ ratio: 1 });
  await page.getByRole("button", { name: "PLACE WHAT TO RECOGNIZE" }).click();
  await expect(page.getByRole("button", { name: "START QUEST", exact: true })).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(counters.gps).toBe(0); expect(counters.starts).toBe(0); expect(counters.checkins).toBe(0);
});
