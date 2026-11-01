import { randomBytes } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

async function openRun(page: Page) {
  const response = await page.request.post("http://127.0.0.1:8001/api/v1/explore/guides/explore-arrival-test/runs", { data: { start_key: randomBytes(32).toString("hex") } });
  expect(response.ok()).toBe(true);
  const { run, credential } = await response.json();
  await page.addInitScript(saved => {
    if (!localStorage.getItem("ayloor-explore-demo-v1")) localStorage.setItem("ayloor-explore-demo-v1", JSON.stringify(saved));
  }, { runId: run.id, credential });
  await page.goto("/explore.html");
  await expect(page.getByLabel("Answer", { exact: true })).toBeEnabled();
}

async function controlledGps(page: Page, code?: number) {
  await page.addInitScript(code => {
    Object.defineProperty(navigator, "geolocation", { value: {
      getCurrentPosition(success: PositionCallback, failure: PositionErrorCallback) {
        document.documentElement.dataset.gpsCalls = String(Number(document.documentElement.dataset.gpsCalls || 0) + 1);
        if (code) { failure({ code } as GeolocationPositionError); return; }
        window.addEventListener("test-location", () => success({
          coords: { latitude: 0, longitude: 0, accuracy: 10 }, timestamp: Date.now(),
        } as GeolocationPosition), { once: true });
      },
    } });
  }, code);
}
async function releaseGps(page: Page) { await page.evaluate(() => window.dispatchEvent(new Event("test-location"))); }
async function solve(page: Page) {
  await page.getByLabel("Answer", { exact: true }).fill("yes");
  await page.getByRole("button", { name: "CHECK ANSWER", exact: true }).click();
  await expect(page.getByRole("heading", { name: "REVEAL", exact: true })).toBeVisible();
}

for (const width of [320, 390, 430]) {
  test(`optional Arrival, server policy, reload and Continue at ${width}px`, async ({ page, context }) => {
    await page.setViewportSize({ width, height: 844 });
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({ latitude: 0, longitude: 0, accuracy: 60 });
    const writes: string[] = [];
    page.on("request", req => { if (req.url().endsWith("/arrival")) writes.push(req.url()); });
    await openRun(page);
    expect(writes).toHaveLength(0);
    await page.getByRole("button", { name: "CHECK ARRIVAL" }).click();
    await expect(page.getByRole("status")).toContainText("accuracy is too low");
    await context.setGeolocation({ latitude: 0.0008, longitude: 0, accuracy: 30 });
    await page.getByRole("button", { name: "CHECK ARRIVAL" }).click();
    await expect(page.getByRole("status")).toContainText("uncertain");
    await context.setGeolocation({ latitude: 1, longitude: 0, accuracy: 10 });
    await page.getByRole("button", { name: "CHECK ARRIVAL" }).click();
    await expect(page.getByRole("status")).toContainText("outside");
    await page.screenshot({ path: `test-results/arrival-outside-${width}.png`, fullPage: true });
    await context.setGeolocation({ latitude: 0, longitude: 0, accuracy: 10 });
    await page.getByRole("button", { name: "CHECK ARRIVAL" }).click();
    await expect(page.getByRole("status")).toContainText("previously confirmed");
    const confirmed = await page.locator("time").getAttribute("datetime");
    await page.reload();
    await expect(page.getByRole("status")).toContainText("previously confirmed");
    expect(await page.locator("time").getAttribute("datetime")).toBe(confirmed);
    expect(writes).toHaveLength(4);
    await expect(page.getByLabel("Answer", { exact: true })).toBeEnabled();
    await page.screenshot({ path: `test-results/arrival-confirmed-${width}.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await solve(page);
    await page.getByRole("button", { name: "CONTINUE", exact: true }).click();
    await expect(page.getByText("STOP 2 / 2", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "CHECK ARRIVAL" })).toBeEnabled();
    await expect(page.locator("time")).toHaveCount(0);
    // Last stop can be finished without any GPS request.
    await solve(page);
    await page.getByRole("button", { name: "CONTINUE", exact: true }).click();
    await expect(page.getByRole("heading", { name: "FINISH", exact: true })).toBeVisible();
    expect(writes).toHaveLength(4);
  });
}

for (const [code, message] of [[1, "permission denied"], [2, "unavailable"], [3, "timed out"]] as const) {
  test(`GPS error ${code} leaves directions and Answer available`, async ({ page }) => {
    await controlledGps(page, code);
    await openRun(page);
    expect(await page.evaluate(() => document.documentElement.dataset.gpsCalls)).toBeUndefined();
    await page.getByRole("button", { name: "CHECK ARRIVAL" }).click();
    await expect(page.getByRole("status")).toContainText(message);
    await expect(page.getByText(/^Directions:/)).toBeVisible();
    await expect(page.getByRole("button", { name: "CHECK ARRIVAL" })).toBeEnabled();
    await solve(page);
  });
}

test("pending location never blocks solving, and late callback after Continue is discarded", async ({ page }) => {
  await controlledGps(page);
  const writes: string[] = [];
  page.on("request", req => { if (req.url().endsWith("/arrival")) writes.push(req.url()); });
  await openRun(page);
  await page.getByRole("button", { name: "CHECK ARRIVAL" }).click();
  await expect(page.getByRole("status")).toContainText("Requesting location");
  await solve(page);
  await page.getByRole("button", { name: "CONTINUE", exact: true }).click();
  await expect(page.getByText("STOP 2 / 2", { exact: true })).toBeVisible();
  await releaseGps(page);
  await page.getByRole("button", { name: "RESUME SAVED PROGRESS" }).click();
  await expect(page.getByLabel("Answer", { exact: true })).toBeEnabled();
  expect(writes).toHaveLength(0);
});

test("lost Arrival response leaves Answer available; Resume recovers timestamp without GPS", async ({ page }) => {
  await controlledGps(page);
  await openRun(page);
  await page.route("**/runs/*/arrival", async route => { await route.fetch(); await route.abort("failed"); }, { times: 1 });
  await page.getByRole("button", { name: "CHECK ARRIVAL" }).click();
  await releaseGps(page);
  await expect(page.getByRole("status")).toContainText("Connection interrupted");
  await expect(page.getByLabel("Answer", { exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "RESUME SAVED PROGRESS" }).click();
  await expect(page.getByRole("status")).toContainText("previously confirmed");
  expect(await page.evaluate(() => document.documentElement.dataset.gpsCalls)).toBe("1");
  await page.reload();
  await expect(page.getByRole("status")).toContainText("previously confirmed");
  expect(await page.evaluate(() => document.documentElement.dataset.gpsCalls)).toBeUndefined();
});

test("late Arrival HTTP snapshot cannot undo Reveal", async ({ page }) => {
  await controlledGps(page);
  await openRun(page);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let committed!: () => void;
  const serverDone = new Promise<void>(resolve => { committed = resolve; });
  await page.route("**/runs/*/arrival", async route => {
    const response = await route.fetch(); committed(); await gate; await route.fulfill({ response });
  });
  await page.getByRole("button", { name: "CHECK ARRIVAL" }).click();
  await releaseGps(page);
  await serverDone;
  await expect(page.getByRole("status")).toContainText("Checking arrival");
  await solve(page);
  release();
  await expect(page.getByRole("status")).toContainText("previously confirmed");
  await expect(page.getByRole("heading", { name: "REVEAL", exact: true })).toBeVisible();
});

test("late Answer snapshot cannot erase a newer Arrival confirmation", async ({ page }) => {
  await controlledGps(page);
  await openRun(page);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let committed!: () => void;
  const serverDone = new Promise<void>(resolve => { committed = resolve; });
  await page.route("**/runs/*/answer", async route => {
    const response = await route.fetch(); committed(); await gate; await route.fulfill({ response });
  });
  await page.getByRole("button", { name: "CHECK ARRIVAL" }).click();
  await page.getByLabel("Answer", { exact: true }).fill("yes");
  await page.getByRole("button", { name: "CHECK ANSWER", exact: true }).click();
  await serverDone;
  await releaseGps(page);
  await expect(page.getByRole("status")).toContainText("previously confirmed");
  release();
  await expect(page.getByRole("heading", { name: "REVEAL", exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("previously confirmed");
});
