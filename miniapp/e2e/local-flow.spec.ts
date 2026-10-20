import { createHmac } from "node:crypto";
import { expect, test, type BrowserContext } from "@playwright/test";

function signedInitData(id: number) {
  const data = {
    auth_date: String(Math.floor(Date.now() / 1000)),
    user: JSON.stringify({ id, first_name: `Player ${id}` }),
  };
  const secret = createHmac("sha256", "WebAppData")
    .update("123456789:local-browser-test-token")
    .digest();
  const check = Object.entries(data)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  return new URLSearchParams({
    ...data,
    hash: createHmac("sha256", secret).update(check).digest("hex"),
  }).toString();
}

async function telegram(
  context: BrowserContext,
  id: number,
  locationCalls: { count: number },
) {
  await context.route("https://telegram.org/js/telegram-web-app.js", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `window.Telegram = { WebApp: {
      initData: ${JSON.stringify(signedInitData(id))}, initDataUnsafe: {},
      ready() {}, expand() {}, isVersionAtLeast() { return true; }, openTelegramLink() {},
      LocationManager: { isInited: true, isLocationAvailable: true, init(cb) { cb(); }, openSettings() {},
        getLocation(cb) { fetch('/location-requested'); cb({ latitude: 0, longitude: 0, horizontal_accuracy: 25 }); } }
    }};`,
    }),
  );
  await context.route("**/location-requested", (route) => {
    locationCalls.count++;
    return route.fulfill({ body: "ok" });
  });
}

test("two synthetic players complete the real API flow in a mobile browser", async ({
  browser,
}) => {
  const stamp = Date.now();
  const first = await browser.newContext({
    baseURL: "http://127.0.0.1:5174",
    viewport: { width: 390, height: 844 },
  });
  const second = await browser.newContext({
    baseURL: "http://127.0.0.1:5174",
    viewport: { width: 390, height: 844 },
  });
  const calls = { count: 0 };
  await telegram(first, stamp, calls);
  await telegram(second, stamp + 1, calls);
  const captain = await first.newPage(),
    member = await second.newPage();
  const errors: string[] = [];
  captain.on("pageerror", (e) => errors.push(e.message));
  member.on("pageerror", (e) => errors.push(e.message));
  await captain.goto("/");
  await captain
    .getByLabel("Team name", { exact: true })
    .fill(`Kentron ${stamp}`);
  await captain
    .getByRole("button", { name: "CREATE TEAM", exact: true })
    .click();
  await expect(captain.getByText("Waiting for teammates")).toBeVisible();
  await captain.getByRole("button", { name: "INVITE FRIENDS" }).click();
  const link = await captain
    .getByLabel("Invite link", { exact: true })
    .inputValue();
  const code = new URL(link).searchParams.get("start")!.replace("join_", "");
  await member.goto(`/?invite=${code}`);
  await member.getByRole("button", { name: "JOIN TEAM", exact: true }).click();
  await expect(member.getByText("TEAM ACTIVE", { exact: true })).toBeVisible();
  await captain.getByRole("button", { name: "REFRESH TEAM" }).click();
  await expect(captain.getByText("TEAM ACTIVE", { exact: true })).toBeVisible();
  await captain.getByRole("button", { name: "QUESTS", exact: true }).click();
  await captain.getByRole("button", { name: "OPEN →", exact: true }).click();
  await captain.getByRole("button", { name: "START QUEST" }).click();
  expect(calls.count).toBe(0);
  await captain.getByText("Development coordinates", { exact: true }).click();
  await captain.getByLabel("latitude", { exact: true }).fill("1");
  await captain
    .getByRole("button", { name: "CHECK IN WITH DEV COORDINATES" })
    .click();
  await expect(captain.getByRole("alert")).toContainText(
    "outside the checkpoint radius",
  );
  await captain.getByRole("button", { name: "CHECK IN", exact: true }).click();
  await expect(
    captain.getByText("QUEST COMPLETE", { exact: true }),
  ).toBeVisible();
  expect(calls.count).toBe(1);
  await captain.getByRole("button", { name: "VIEW LEADERBOARD" }).click();
  await expect(captain.locator(".ranking .own")).toContainText("100");
  await captain.screenshot({
    path: "test-results/leaderboard-mobile.png",
    fullPage: true,
  });
  await captain.reload();
  await captain.getByRole("button", { name: "QUESTS →", exact: true }).click();
  await captain
    .getByRole("button", { name: "COMPLETED ✓", exact: true })
    .click();
  await expect(captain.getByText("COMPLETED ✓", { exact: true })).toBeVisible();
  await expect(
    captain.getByRole("button", { name: "START QUEST" }),
  ).toHaveCount(0);
  await expect(
    captain.getByRole("button", { name: "CHECK IN", exact: true }),
  ).toHaveCount(0);
  const overflow = await captain.evaluate(
    () => document.documentElement.scrollWidth > innerWidth,
  );
  expect(overflow).toBe(false);
  expect(errors).toEqual([]);
  await first.close();
  await second.close();
});

test("create team reconciles a lost response to the Team screen without reload", async ({
  browser,
}) => {
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:5174",
    viewport: { width: 390, height: 844 },
  });
  try {
    const stamp = Date.now();
    await telegram(context, stamp, { count: 0 });
    const page = await context.newPage();
    await page.goto("/");
    await page
      .getByLabel("Team name", { exact: true })
      .fill(`Recovered ${stamp}`);
    let committed = false;
    let reconciled = false;
    let submissions = 0;
    page.on("request", (request) => {
      if (committed && new URL(request.url()).pathname === "/api/v1/me")
        reconciled = true;
    });
    await page.route("**/api/v1/teams", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      submissions++;
      const response = await route.fetch();
      expect(response.status()).toBe(201);
      committed = true;
      await response.dispose();
      await route.abort("connectionreset");
    });
    await page
      .getByRole("button", { name: "CREATE TEAM", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: `Recovered ${stamp}`, exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Waiting for teammates")).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
    expect(committed && reconciled).toBe(true);
    expect(submissions).toBe(1);
  } finally {
    await context.close();
  }
});

for (const failure of ["lost response", "retry conflict"] as const) {
  test(`join reconciles ${failure} through /me to the Team screen without reload`, async ({
    browser,
  }) => {
    const captainContext = await browser.newContext({
      baseURL: "http://127.0.0.1:5174",
      viewport: { width: 390, height: 844 },
    });
    const memberContext = await browser.newContext({
      baseURL: "http://127.0.0.1:5174",
      viewport: { width: 390, height: 844 },
    });
    try {
      const stamp = Date.now();
      await telegram(captainContext, stamp, { count: 0 });
      await telegram(memberContext, stamp + 1, { count: 0 });
      const captain = await captainContext.newPage();
      const member = await memberContext.newPage();
      await captain.goto("/");
      await captain
        .getByLabel("Team name", { exact: true })
        .fill(`Recovery ${stamp}`);
      await captain
        .getByRole("button", { name: "CREATE TEAM", exact: true })
        .click();
      await captain.getByRole("button", { name: "INVITE FRIENDS" }).click();
      const link = await captain
        .getByLabel("Invite link", { exact: true })
        .inputValue();
      const code = new URL(link).searchParams
        .get("start")!
        .replace("join_", "");
      await member.goto(`/?invite=${code}`);
      await expect(
        member.getByRole("button", { name: "JOIN TEAM", exact: true }),
      ).toBeVisible();
      let committed = false;
      let submissions = 0;
      let reconciliations = 0;
      await member.route("**/api/v1/me", async (route) => {
        if (route.request().method() !== "GET") {
          await route.continue();
          return;
        }
        if (committed) {
          reconciliations++;
          if (failure === "retry conflict" && reconciliations === 1) {
            await route.abort("connectionreset");
            return;
          }
        }
        await route.continue();
      });
      await member.route(`**/api/v1/invites/${code}/join`, async (route) => {
        if (route.request().method() !== "POST") {
          await route.continue();
          return;
        }
        submissions++;
        if (submissions > 1) {
          await route.continue();
          return;
        }
        const response = await route.fetch();
        expect(response.status()).toBe(200);
        committed = true;
        await response.dispose();
        await route.abort("connectionreset");
      });
      await member
        .getByRole("button", { name: "JOIN TEAM", exact: true })
        .click();
      if (failure === "retry conflict") {
        await expect(member.getByRole("alert")).toContainText(
          "Connection interrupted",
        );
        await member
          .getByRole("button", { name: "JOIN TEAM", exact: true })
          .click();
      }
      await expect(
        member.getByText("TEAM ACTIVE", { exact: true }),
      ).toBeVisible();
      await expect(
        member.getByRole("heading", { name: `Recovery ${stamp}`, exact: true }),
      ).toBeVisible();
      await expect(member.getByRole("alert")).toHaveCount(0);
      expect(reconciliations).toBe(failure === "retry conflict" ? 2 : 1);
      expect(submissions).toBe(failure === "retry conflict" ? 2 : 1);
    } finally {
      await captainContext.close();
      await memberContext.close();
    }
  });
}
