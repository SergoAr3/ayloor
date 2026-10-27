import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FieldTestStatus, duration, fieldClock } from "./FieldTestStatus";
import { FieldAnswer } from "./FieldAnswer";
import { homeHero } from "../screens/homeState";
import { QuestScreen } from "../screens/QuestScreens";
import type { FieldTest, Quest } from "../types";

const noop = () => {};
const field: FieldTest = {
  status: "finished", server_now: "2026-10-27T12:10:00Z", started_at: "2026-10-27T11:00:00Z",
  deadline_at: "2026-10-27T12:30:00Z", finished_at: "2026-10-27T12:10:00Z",
  elapsed_seconds: 4200, remaining_seconds: 1200, score: 925, maximum_score: 1000,
  completed_quests: 4, total_quests: 4, leaderboard_position: 3,
};
const quest: Quest = { id: "q", title: "Opera", description: "Public paths", base_xp: 250,
  latitude: 40, longitude: 44, radius_m: 100, field_test_step: 2, hint_available: true,
  run: { id: "r", status: "started" }, locked: false };

it("derives summary from backend values, including a different actual score/rank", () => {
  const html = renderToStaticMarkup(<FieldTestStatus field={field} busy={false} refresh={noop} />);
  for (const value of ["925 / 1000 XP", "4 / 4 quests", "70:00", "Leaderboard #3", "FINISHED"]) expect(html).toContain(value);
  const other = renderToStaticMarkup(<FieldTestStatus field={{ ...field, score: 1000, leaderboard_position: 1 }} busy={false} refresh={noop} />);
  expect(other).toContain("1000 / 1000 XP"); expect(other).not.toContain("925");
});
it("interpolates only running clocks and freezes server-confirmed finish/expiry", () => {
  expect(duration(5400)).toBe("90:00");
  expect(fieldClock(field, 200)).toEqual({ elapsed: 4200, remaining: 1200 });
  expect(fieldClock({ ...field, status: "running" }, 30)).toEqual({ elapsed: 4230, remaining: 1170 });
  expect(fieldClock({ ...field, status: "running" }, 9999)).toEqual({ elapsed: 5400, remaining: 0 });
  const expired = renderToStaticMarkup(<FieldTestStatus field={{ ...field, status: "expired" }} busy={false} refresh={noop} />);
  expect(expired).toContain("TIME EXPIRED"); expect(expired).toContain("Your earned XP is saved");
});
it("gates answer and hint on saved server GPS, then restores paid actions on reload", () => {
  const before = renderToStaticMarkup(<FieldAnswer quest={quest} busy={false} feedback="" answer={noop} hint={noop} />);
  expect(before).toContain("CHECK IN BEFORE");
  expect(before).toMatch(/<input[^>]*disabled/);
  expect(before).toContain("HINT · −50 XP"); expect(before).not.toContain("Engine test code");
  const after = renderToStaticMarkup(<FieldAnswer quest={{ ...quest, run: { ...quest.run!, gps_verified_at: "now" }, hint_used: true, hint_text: "Private revealed hint", wrong_answer_penalized: true }} busy={false} feedback="Wrong answer. No additional penalty." answer={noop} hint={noop} />);
  expect(after).toContain("GPS VERIFIED"); expect(after).toContain("Private revealed hint");
  expect(after).toContain("−25 XP"); expect(after).toContain("No additional penalty");
  expect(after).not.toContain("HINT · −50 XP"); expect(after).not.toMatch(/<input[^>]*disabled/);
});
it("does not offer answer/start/check-in for backend-locked quests", () => {
  const locked = { ...quest, locked: true, run: null };
  expect(homeHero({ id: "t", name: "Crew", status: "active", member_count: 2 }, [locked]).kind).toBe("closed");
  const html = renderToStaticMarkup(<QuestScreen quest={locked} teamActive busy={false} stage="" feedback={null} sample={null} development={false} coordinates={{ latitude: 40, longitude: 44, horizontal_accuracy: 20 }} setCoordinates={noop} start={noop} checkIn={noop} devCheckIn={noop} back={noop} />);
  expect(html).toContain("LOCKED / UP NEXT"); expect(html).not.toContain("START QUEST");
  expect(html).not.toContain('aria-label="Quest check-in"');
});
