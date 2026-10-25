import { expect, it } from "vitest";
import { renderToStaticMarkup as render } from "react-dom/server";
import HomeScreen from "./HomeScreen";
import RanksScreen from "./RanksScreen";
import TeamScreen from "./TeamScreen";
import { QuestScreen } from "./QuestScreens";
import { AppHeader } from "../components/ui";
import type { Me, Quest, Ranking, Team } from "../types";

const noop = () => {};
const team: Team = { id: "t", name: "Real API name", status: "active", member_count: 2 };
const me: Me = { user: { id: "u", first_name: "Captain", username: null, telegram_id: 1 }, team, city: { name: "Yerevan" }, season: { name: "Season Zero" } };
const quest: Quest = { id: "q", title: "Authored checkpoint", description: "Public path", base_xp: 175, radius_m: 100, latitude: 40, longitude: 44, run: null };
const ranking: Ranking = { entries: [{ rank: 2, team_id: "other", team_name: "Other API name", xp: 200 }, { rank: 3, team_id: "t", team_name: team.name, xp: 175 }], current_user_team_rank: 3, current_user_team_xp: 175, xp_to_next_rank: 26 };

it("Home features the real current quest, honest scoreboard and contextual action", () => {
  const props = { me, quests: [quest], ranking, busy: false, questLoading: false, questError: "", reload: noop, play: noop, team: noop, ranks: noop };
  const html = render(<HomeScreen {...props} />);
  for (const text of ["home-mission", quest.title, "+175 XP", "START QUEST", "SEASON XP", "CITY RANK", "CHECKPOINTS", "#3", team.name]) expect(html).toContain(text);
  expect(html).not.toContain("city-art");
  expect(render(<HomeScreen {...props} quests={[{ ...quest, run: { id: "r", status: "started" } }]} />)).toContain("CONTINUE QUEST");
  expect(render(<HomeScreen {...props} quests={[{ ...quest, run: { id: "r", status: "completed" } }]} />)).toContain("VIEW RANKS");
});

it("Ranks preserves server order, own-team identity, real XP and tie copy", () => {
  const html = render(<RanksScreen ranking={ranking} teamId="t" busy={false} refresh={noop} />);
  expect(html.indexOf("Other API name")).toBeLessThan(html.indexOf(team.name));
  expect(html).toContain('<small>YOU</small>');
  expect(html).toContain('class="own"');
  expect(html).toContain("175 XP");
  expect(html).toContain("Same XP? The team created first ranks higher.");
});

it("Team uses real member identity, open slots and non-success pending copy", () => {
  const props = { team, members: [{ user: me.user, role: "captain" as const }], invitation: null, name: "", setName: noop, busy: false, shareLink: "https://t.me/real-invite", create: noop, join: noop, invite: noop, copy: noop, refresh: noop, userId: "u" };
  const html = render(<TeamScreen {...props} />);
  expect(html).toContain("ACTIVE TEAM"); expect(html).toContain("Captain"); expect(html).toContain('class="you-badge">YOU');
  expect(html.match(/class="open-slot"/g)).toHaveLength(1);
  expect(html).toContain("3 LEFT");
  expect(html).toContain("https://t.me/real-invite");
  const pending = render(<TeamScreen {...props} team={{ ...team, status: "pending", member_count: 1 }} />);
  expect(pending).toContain("WAITING FOR PLAYERS"); expect(pending).not.toContain("ACTIVE TEAM");
  expect(pending).toContain("Your team becomes active with 2 players.");
});

it("no-team and invited states retain create/join and explicit cancel", () => {
  const props = { team: null, members: [], invitation: null, name: "", setName: noop, busy: false, shareLink: "", create: noop, join: noop, invite: noop, copy: noop, refresh: noop, cancelInvite: noop };
  const empty = render(<TeamScreen {...props} />);
  expect(empty).toContain("Make a crew."); expect(empty).toContain("CREATE TEAM");
  const invited = render(<TeamScreen {...props} invitation={{ code: "c", team, link: null, remaining_uses: 3 }} />);
  for (const text of [team.name, "2 / 5 members", "JOIN TEAM", "CANCEL / CREATE A TEAM"]) expect(invited).toContain(text);
});

it("local outside result makes distance primary, accuracy secondary and retry explicit", () => {
  const html = render(<QuestScreen quest={{ ...quest, run: { id: "r", status: "started" } }} teamActive busy={false} stage="" feedback={{ title: "OUTSIDE CHECK-IN ZONE", description: "Server rejected location" }} dismiss={noop} sample={{ questId: "q", data: { latitude: 40.0030577, longitude: 44, horizontal_accuracy: 18 } }} development={false} coordinates={{ latitude: 0, longitude: 0, horizontal_accuracy: 25 }} setCoordinates={noop} start={noop} checkIn={noop} devCheckIn={noop} back={noop} />);
  for (const text of ["NOT THERE YET.", "340 M", "FROM CHECKPOINT", "about 240 m outside the check-in zone", "±18 M", "GPS SAMPLE", "TRY AGAIN"]) expect(html).toContain(text);
  expect(html).toContain('aria-label="Close check-in result"');
  expect(html).toContain('aria-label="GPS accuracy from last explicit check-in sample"');
  expect(html).toContain('role="alert"');
  expect(html).not.toContain("radar-ping");
  expect(html).not.toContain("LOCATION SETTINGS");
});

it("header exposes one accessible marquee label and distinct monochrome brand mark", () => {
  const html = render(<AppHeader home={noop} busy={false} />);
  expect(html).toContain('aria-label="Play the real world. Yerevan. Season Zero."');
  expect(html).toContain('class="marquee-track" aria-hidden="true"');
  expect(html).toContain('fill="currentColor"');
  expect(html).toContain('data-icon="brand"');
  expect(html).not.toContain("↗");
});

it("completed Home uses a season summary, while an available next quest stays the next move", () => {
  const props = { me, ranking, busy: false, questLoading: false, questError: "", reload: noop, play: noop, team: noop, ranks: noop };
  const done = { ...quest, run: { id: "r", status: "completed" as const } };
  const completed = render(<HomeScreen {...props} quests={[done]} />);
  expect(completed).toContain("Season Zero checkpoints complete.");
  expect(completed).toContain("YOUR NEXT MOVE");
  expect(completed).toContain("VIEW RANKS");
  const next = render(<HomeScreen {...props} quests={[done, { ...quest, id: "next", title: "Next authored quest" }]} />);
  expect(next).toContain("YOUR NEXT MOVE"); expect(next).toContain("Next authored quest");
  expect(next).not.toContain("CHECKPOINT CLAIMED");
});

it("can omit the ticker while retaining the app header",()=>{
 const html=render(<AppHeader home={noop} busy={false} showTicker={false}/>);
 expect(html).toContain('class="brand"');expect(html).not.toContain("marquee");
});
