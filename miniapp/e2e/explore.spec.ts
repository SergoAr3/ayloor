import { expect, test } from "@playwright/test";

for (const width of [320, 390, 430]) {
  test(`Explore actual API: solo, hint, Reveal, reload, Continue, Finish at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const legacy: string[] = [];
    page.on("request", request => {
      if (request.url().includes("telegram.org") || /\/api\/v1\/(auth|me|teams|leaderboard)/.test(request.url())) legacy.push(request.url());
    });
    await page.goto("/explore.html");
    await expect(page.getByRole("button", { name: "START DEMO", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "START DEMO", exact: true }).click();
    await page.getByRole("button", { name: "FREE HINT", exact: true }).click();
    await expect(page.getByRole("note")).toContainText("after LOOK");
    await page.reload();
    await expect(page.getByRole("note")).toBeVisible();
    await page.screenshot({ path: `test-results/explore-clue-${width}.png`, fullPage: true });
    await page.getByLabel("Answer", { exact: true }).fill("wrong");
    await page.getByRole("button", { name: "CHECK ANSWER", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("not the answer");
    await page.getByLabel("Answer", { exact: true }).fill(" CLOSER ");
    await page.getByRole("button", { name: "CHECK ANSWER", exact: true }).click();
    await expect(page.getByRole("heading", { name: "REVEAL", exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "REVEAL", exact: true })).toBeVisible();
    await expect(page.getByText("STOP 1 / 2", { exact: true })).toBeVisible();
    await page.screenshot({ path: `test-results/explore-reveal-${width}.png`, fullPage: true });
    await page.getByRole("button", { name: "CONTINUE", exact: true }).click();
    await expect(page.getByText("STOP 2 / 2", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Answer", { exact: true })).toBeVisible();
    await page.getByLabel("Answer", { exact: true }).fill("3");
    await page.getByRole("button", { name: "CHECK ANSWER", exact: true }).click();
    await expect(page.getByRole("heading", { name: "REVEAL", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "CONTINUE", exact: true }).click();
    await expect(page.getByRole("heading", { name: "FINISH", exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "FINISH", exact: true })).toBeVisible();
    await page.screenshot({ path: `test-results/explore-finish-${width}.png`, fullPage: true });
    expect(legacy).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test("lost Start/Answer/Continue responses reconcile through real server state", async ({ page }) => {
  await page.goto("/explore.html");
  await page.route("**/api/v1/explore/guides/*/runs", async route => { await route.fetch(); await route.abort("failed"); }, { times: 1 });
  await page.getByRole("button", { name: "START DEMO", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Connection interrupted");
  await page.reload();
  await page.getByRole("button", { name: "RESUME START", exact: true }).click();
  await page.route("**/api/v1/explore/runs/*/answer", async route => { await route.fetch(); await route.abort("failed"); }, { times: 1 });
  await page.getByLabel("Answer", { exact: true }).fill("closer");
  await page.getByRole("button", { name: "CHECK ANSWER", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Connection interrupted");
  await expect(page.getByRole("button", { name: "CHECK ANSWER", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "RESUME / RETRY", exact: true }).click();
  await expect(page.getByRole("heading", { name: "REVEAL", exact: true })).toBeVisible();
  await page.route("**/api/v1/explore/runs/*/continue", async route => { await route.fetch(); await route.abort("failed"); }, { times: 1 });
  await page.getByRole("button", { name: "CONTINUE", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Connection interrupted");
  await page.reload();
  await expect(page.getByText("STOP 2 / 2", { exact: true })).toBeVisible();
});

test("unavailable guide and resume read failures have explicit retry without mutations", async ({ page }) => {
  await page.route("**/api/v1/explore/guides/explore-demo-v1", route => route.fulfill({ status: 404, json: { detail: "Guide is not available" } }), { times: 1 });
  await page.goto("/explore.html");
  await expect(page.getByRole("alert")).toContainText("not available");
  await expect(page.getByRole("button", { name: "START DEMO", exact: true })).not.toBeVisible();
  await page.getByRole("button", { name: "RESUME / RETRY", exact: true }).click();
  await page.getByRole("button", { name: "START DEMO", exact: true }).click();
  await expect(page.getByLabel("Answer", { exact: true })).toBeVisible();
  await page.route("**/api/v1/explore/runs/*", route => route.fulfill({ status: 503, json: { detail: "Temporarily unavailable" } }), { times: 1 });
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("Temporarily unavailable");
  await page.getByRole("button", { name: "RESUME / RETRY", exact: true }).click();
  await expect(page.getByLabel("Answer", { exact: true })).toBeVisible();
});

test("loading blocks Start; storage failure never sends a start request", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/v1/explore/guides/explore-demo-v1", async route => { await gate; await route.continue(); }, { times: 1 });
  await page.goto("/explore.html");
  await expect(page.getByRole("status")).toContainText("Loading saved progress");
  await expect(page.getByRole("button", { name: "START DEMO", exact: true })).not.toBeVisible();
  release();
  await expect(page.getByRole("button", { name: "START DEMO", exact: true })).toBeVisible();
  let starts = 0;
  page.on("request", req => { if (req.method() === "POST") starts++; });
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new Error("Storage unavailable"); }; });
  await page.getByRole("button", { name: "START DEMO", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Storage unavailable");
  expect(starts).toBe(0);
  await page.screenshot({ path: "test-results/explore-storage-error.png", fullPage: true });
});
