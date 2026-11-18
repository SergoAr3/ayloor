import { randomBytes } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

const v1 = "example-walk-v1";
const v2 = "example-walk-v2";
const entry = (slug: string) => `/explore.html?guide=${slug}`;
const key = (slug: string) => `ayloor-explore:v1:guide:${slug}`;
async function stored(page: Page, slug: string) {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)!), key(slug));
}
async function start(page: Page, slug: string) {
  await page.goto(entry(slug));
  await page.getByRole("button", { name: "START WALK", exact: true }).click();
  await expect(page.getByLabel("Answer", { exact: true })).toBeVisible();
}
async function answer(page: Page, text: string) {
  await page.getByLabel("Answer", { exact: true }).fill(text);
  await page.getByRole("button", { name: "CHECK ANSWER", exact: true }).click();
  await expect(page.getByRole("heading", { name: "REVEAL", exact: true })).toBeVisible();
}

for (const width of [320, 390, 430]) {
  test(`published three-stop version completes and resumes at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await start(page, v1);
    await expect(page.getByRole("heading", { name: "Three-stop practice walk", exact: true })).toBeVisible();
    for (const [index, text] of ["closer", "3", "notice"].entries()) {
      await expect(page.getByText(`STOP ${index + 1} / 3`, { exact: true })).toBeVisible();
      await answer(page, text);
      await page.reload();
      await expect(page.getByRole("heading", { name: "REVEAL", exact: true })).toBeVisible();
      await page.getByRole("button", { name: "CONTINUE", exact: true }).click();
    }
    await expect(page.getByRole("heading", { name: "FINISH", exact: true })).toBeVisible();
    await expect(page.getByText("You completed Three-stop practice walk.", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "FINISH", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/explore-version-finish-${width}.png`, fullPage: true });
  });
}

test("changed entry keeps both versions isolated and offers original-run Resume", async ({ page }) => {
  await start(page, v1);
  await answer(page, "closer");
  const old = await stored(page, v1);
  await page.goto(entry(v2));
  await expect(page.getByRole("heading", { name: "Practice walk, second version", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "START WALK", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "RESUME PREVIOUS WALK" }).click();
  await expect(page).toHaveURL(new RegExp(`guide=${v1}$`));
  await expect(page.getByRole("heading", { name: "REVEAL", exact: true })).toBeVisible();
  await start(page, v2);
  const newer = await stored(page, v2);
  expect(newer.runId).not.toBe(old.runId);
  expect(await stored(page, v1)).toEqual(old);
  await answer(page, "closer");
  await expect(page.getByText("Second version Reveal.", { exact: true })).toBeVisible();
  await page.goto("/explore.html");
  await expect(page).toHaveURL(new RegExp(`guide=${v2}$`));
  await expect(page.getByRole("heading", { name: "REVEAL", exact: true })).toBeVisible();
  // Resume is keyed by run; it does not require an unrelated default/metadata lookup.
  await page.route(`**/api/v1/explore/guides/${v1}`, route => route.fulfill({ status: 404, json: { detail: "No entry" } }));
  await page.goto(entry(v1));
  await expect(page.getByRole("heading", { name: "Three-stop practice walk", exact: true })).toBeVisible();
  await expect(page.getByText("CLOSER is the second word. This is a practice Reveal.", { exact: true })).toBeVisible();
  expect(await stored(page, v1)).toEqual(old);
});

test("another tab's last-guide pointer does not switch the current walk", async ({ page, context }) => {
  await start(page, v1);
  await answer(page, "closer");
  const second = await context.newPage();
  await start(second, v2);
  await answer(second, "closer");
  await expect(page.getByRole("heading", { name: "Three-stop practice walk", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "RESUME SAVED PROGRESS", exact: true }).click();
  await expect(page.getByRole("heading", { name: "REVEAL", exact: true })).toBeVisible();
  await expect(second.getByRole("heading", { name: "Practice walk, second version", exact: true })).toBeVisible();
  await second.close();
});

test("lost Start on one version survives starting another version", async ({ page }) => {
  await page.goto(entry(v1));
  await page.route(`**/guides/${v1}/runs`, async route => { await route.fetch(); await route.abort("failed"); }, { times: 1 });
  await page.getByRole("button", { name: "START WALK", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Connection interrupted");
  const pending = await stored(page, v1);
  expect(pending.startKey).toBeTruthy();
  await start(page, v2);
  const other = await stored(page, v2);
  expect(await stored(page, v1)).toEqual(pending);
  await page.goto(entry(v1));
  await page.getByRole("button", { name: "RESUME START", exact: true }).click();
  await expect(page.getByLabel("Answer", { exact: true })).toBeVisible();
  expect((await stored(page, v1)).runId).not.toBe(other.runId);
  expect(await stored(page, v2)).toEqual(other);
});

for (const slug of ["unknown-v1", "unpublished-walk-v1", "", "bad/slug", "a&guide=b"]) {
  test(`unavailable/invalid entry '${slug}' cannot start or substitute a saved guide`, async ({ page }) => {
    await start(page, v1);
    const original = await stored(page, v1);
    const posts: string[] = [];
    page.on("request", request => { if (request.method() === "POST") posts.push(request.url()); });
    await page.goto(entry(slug));
    await expect(page.getByRole("alert")).toContainText(/not available|Invalid walk link/);
    await expect(page.getByRole("button", { name: "START WALK", exact: true })).toHaveCount(0);
    await expect(page.getByLabel("Answer", { exact: true })).toHaveCount(0);
    expect(posts).toHaveLength(0);
    expect(await stored(page, v1)).toEqual(original);
  });
}

test("bare first entry has no default and makes no Start request", async ({ page }) => {
  const posts: string[] = [];
  page.on("request", request => { if (request.method() === "POST") posts.push(request.url()); });
  await page.goto("/explore.html");
  await expect(page.getByRole("alert")).toContainText("No walk selected");
  await expect(page.getByRole("button", { name: "START WALK", exact: true })).toHaveCount(0);
  expect(posts).toHaveLength(0);
});

test("old demo credential is preserved and resumes its original Reveal after new entry", async ({ page }) => {
  const response = await page.request.post("http://127.0.0.1:8001/api/v1/explore/guides/explore-demo-v1/runs", { data: { start_key: randomBytes(32).toString("hex") } });
  const { run, credential } = await response.json();
  await page.request.post(`http://127.0.0.1:8001/api/v1/explore/runs/${run.id}/answer`, { headers: { Authorization: `Bearer ${credential}` }, data: { stop_id: run.stop.id, answer: "closer" } });
  const legacy = { runId: run.id, credential };
  await page.addInitScript(value => localStorage.setItem("ayloor-explore-demo-v1", JSON.stringify(value)), legacy);
  await page.goto(entry(v2));
  await expect(page.getByRole("button", { name: "START WALK", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "RESUME PREVIOUS WALK" }).click();
  await expect(page).toHaveURL(/guide=explore-demo-v1$/);
  await expect(page.getByRole("heading", { name: "REVEAL", exact: true })).toBeVisible();
  expect(await stored(page, "explore-demo-v1")).toEqual(legacy);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("ayloor-explore-demo-v1")!))).toEqual(legacy);
  await start(page, v2);
  await page.goto(entry("explore-demo-v1"));
  await expect(page.getByRole("heading", { name: "REVEAL", exact: true })).toBeVisible();
  expect(await stored(page, "explore-demo-v1")).toEqual(legacy);
});

test("legacy pending demo Start cannot be consumed by a new version", async ({ page }) => {
  const pending = { startKey: randomBytes(32).toString("hex") };
  await page.addInitScript(value => localStorage.setItem("ayloor-explore-demo-v1", JSON.stringify(value)), pending);
  await start(page, v2);
  const other = await stored(page, v2);
  await page.goto(entry("explore-demo-v1"));
  await page.getByRole("button", { name: "RESUME START", exact: true }).click();
  await expect(page.getByLabel("Answer", { exact: true })).toBeVisible();
  expect((await stored(page, "explore-demo-v1")).runId).not.toBe(other.runId);
  expect(await stored(page, v2)).toEqual(other);
});

test("foreign run placed under a version key gives an error without overwriting access", async ({ page }) => {
  await start(page, v1);
  const original = await stored(page, v1);
  await page.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: key(v2), value: original });
  await page.goto(entry(v2));
  await expect(page.getByRole("alert")).toContainText("does not match");
  await expect(page.getByRole("button", { name: "START WALK", exact: true })).toHaveCount(0);
  expect(await stored(page, v1)).toEqual(original);
  expect(await stored(page, v2)).toEqual(original);
});
