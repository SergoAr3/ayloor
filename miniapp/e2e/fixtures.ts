import { expect, type Page } from "@playwright/test";
import type { Coordinates, Me, Quest, Ranking, Run } from "../src/types";

export type Options = {
  teamName?: string; ranking?: Ranking; pending?: boolean; noTeam?: boolean; empty?: boolean; nullRanking?: boolean;
  run?: Run | null; denied?: boolean; locationDelay?: number; accuracy?: number; latitude?: number; longitude?: number; unavailable?: boolean; timeout?: boolean;
  checkError?: string; lostStart?: boolean; startConflict?: boolean; lostCompletion?: boolean;
  checkErrorStatus?: number; verificationWait?: Promise<void>;
  refreshFailure?: boolean; awarded?: number; longNames?: boolean;
  missingSettings?: boolean; missingManager?: boolean; oldClient?: boolean;
  settingsThrows?: boolean; grantOnSettings?: boolean; questContent?: Partial<Quest>;
  quests?: Quest[]; seasonXp?: number; seasonName?: string; invitation?: boolean;
};
export async function mount(page: Page, options: Options = {}) {
  const name = options.teamName ?? (options.longNames ? "VeryLongCrewName".repeat(5) : "Test crew");
  const me: Me = { user: { id: "u", telegram_id: 1, username: "tester", first_name: "Player" }, team: options.noTeam ? null : { id: "t", name, status: options.pending ? "pending" : "active", member_count: options.longNames ? 5 : options.pending ? 1 : 2 }, city: { name: "Yerevan" }, season: options.empty ? null : { name: options.seasonName ?? "Season Zero" } };
  let run = options.run ?? null;
  let completed = run?.status === "completed";
  let expire = false;
  const counters = { gps: 0, starts: 0, checkins: 0, settings: 0, api: 0 };
  const xp = () => options.seasonXp ?? (completed ? 100 : 0);
  const board = (): Ranking => options.ranking ?? ({ entries: me.team ? [{ rank: 1, team_id: "t", team_name: name, xp: xp() }] : [], current_user_team_rank: options.nullRanking ? null : me.team?.status === "active" ? 1 : null, current_user_team_xp: options.nullRanking ? null : me.team?.status === "active" ? xp() : null, xp_to_next_rank: null });
  const quest = (): Quest => ({ id: "q", title: "Test public checkpoint", description: "Reach the public square by a safe path.", base_xp: 100, latitude: 40, longitude: 44, radius_m: 100, run, ...options.questContent });
  const list = () => options.quests ?? (options.empty ? [] : [quest()]);
  const sample: Coordinates = { latitude: options.latitude ?? 40, longitude: options.longitude ?? 44, horizontal_accuracy: options.accuracy ?? 25 };
  await page.route("https://telegram.org/js/telegram-web-app.js", route => route.fulfill({ contentType: "application/javascript", body: `
    const handlers={};
    const manager={isInited:true,isLocationAvailable:${!options.unavailable},isAccessRequested:false,isAccessGranted:false,
      init(cb){this.isInited=true;cb()},
      ${options.missingSettings ? "" : `openSettings(){fetch('/location-settings-requested');${options.settingsThrows ? "throw new Error('Unavailable');" : ""}${options.grantOnSettings ? "this.isAccessGranted=true;handlers.locationManagerUpdated?.();" : ""}},`}
      getLocation(cb){this.isAccessRequested=true;this.isAccessGranted=${!options.denied};fetch('/location-requested');${options.timeout ? "" : `setTimeout(() => cb(${options.denied ? "null" : JSON.stringify(sample)}), ${options.locationDelay ?? 0})`}}
    };
    window.Telegram={WebApp:{initData:'test-signed-init-data',ready(){},expand(){},isVersionAtLeast(){return ${!options.oldClient}},openTelegramLink(){},
      onEvent(name,cb){handlers[name]=cb},offEvent(name,cb){if(handlers[name]===cb)delete handlers[name]},
      LocationManager:${options.missingManager ? "undefined" : "manager"}}};` }));
  await page.route("**/location-requested", route => { counters.gps++; return route.fulfill({ body: "ok" }); });
  await page.route("**/location-settings-requested", route => { counters.settings++; return route.fulfill({ body: "ok" }); });
  await page.route("**/api/v1/**", async route => {
    counters.api++;
    const path = new URL(route.request().url()).pathname.replace("/api/v1", "");
    const json = (body: unknown, status = 200) => route.fulfill({ status, json: body });
    if (expire) return json({ detail: "Expired token" }, 401);
    if (path === "/config") return json({ development_gps_enabled: false });
    if (path === "/auth/telegram") return json({ access_token: "test-session" });
    if (path === "/me") return json(me);
    if (path === "/field-test-zero") return json(null);
    if (path === "/leaderboard") {
      if (completed && options.refreshFailure) return json({ detail: "Board offline" }, 503);
      return json(board());
    }
    if (path === "/teams/t/members") return json(Array.from({ length: me.team?.member_count ?? 0 }, (_, i) => ({ user: { ...me.user, id: i === 0 ? "u" : `member-${i}`, first_name: options.longNames ? "LongUsername".repeat(10) : `Player ${i}` }, role: i === 0 ? "captain" : "member" })));
    if (path === "/invites/visual-invite") return json({ code: "visual-invite", team: { id: "invited", name: "Invited crew", status: "pending", member_count: 1 }, link: null, remaining_uses: 4 });
    if (path === "/teams/t/invites") return json({ code: "fixture", team: me.team, link: "https://t.me/ayloor_fixture_bot?start=join_fixture_link_for_layout_only", remaining_uses: 4 });
    if (path === "/quests") return json(list());
    if (route.request().method() === "GET" && path.startsWith("/quests/")) {
      const found = list().find(item => item.id === path.slice("/quests/".length));
      return found ? json(found) : json({ detail: "Quest not found" }, 404);
    }
    if (path === "/quests/q/start") {
      counters.starts++;
      run = { id: "r", status: "started" };
      if (options.lostStart) return route.abort("connectionreset");
      if (options.startConflict) return json({ detail: "This team has already started or completed this quest" }, 409);
      return json(run, 201);
    }
    if (path === "/quest-runs/r/check-in") {
      counters.checkins++;
      if (options.verificationWait) await options.verificationWait;
      if (options.checkError) return json({ detail: options.checkError }, options.checkErrorStatus ?? 422);
      completed = true; run = { id: "r", status: "completed" };
      if (options.lostCompletion) return route.abort("connectionreset");
      return json({ run, awarded_xp: options.awarded ?? 100, already_completed: options.awarded === 0 });
    }
    return json({ detail: "Unexpected test request" }, 404);
  });
  await page.goto(options.invitation ? "/?invite=visual-invite" : "/");
  await expect(page.getByRole("navigation")).toBeVisible();
  await expect(page.getByRole("button", { name: "HOME", exact: true })).toBeEnabled();
  return { counters, expire: () => { expire = true; } };
}
export const started: Run = { id: "r", status: "started" };

export async function openActive(page: Page) {
  await page.getByRole("button", { name: "CONTINUE QUEST", exact: true }).click();
  await expect(page.getByRole("button", { name: "CHECK IN", exact: true })).toBeVisible();
}
