import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CompleteScreen, QuestScreen } from "./QuestScreens";
import { QuestsScreen } from "./QuestsScreen";
import { AppHeader, ActionButton } from "../components/ui";
import type { Quest } from "../types";

const quest: Quest = { id: "q", title: "Completed checkpoint", description: "Public path", base_xp: 175, radius_m: 250, latitude: 40, longitude: 44, run: { id: "r", status: "completed" }, place_label: "Public square" };
const noop = () => {};
it("shows one idle beacon only for an active quest outside measurement stages", () => {
  const props = { quest: { ...quest, run: { id: "r", status: "started" as const } }, teamActive: true, busy: false, stage: "" as const, feedback: null, sample: null, development: false,
    coordinates: { latitude: 40, longitude: 44, horizontal_accuracy: 18 }, setCoordinates: noop, start: noop, checkIn: noop, devCheckIn: noop, back: noop };
  const html = renderToStaticMarkup(<QuestScreen {...props} />);
  expect(html.match(/class="quest-live-beacon"/g)).toHaveLength(1);
  expect(html.match(/class="quest-idle-ring"/g)).toHaveLength(1);
  for (const stage of ["location", "verification"] as const) {
    const checking = renderToStaticMarkup(<QuestScreen {...props} stage={stage} />);
    expect(checking).not.toContain("quest-live-beacon"); expect(checking).toContain("radar-ping");
  }
  for (const run of [null, { id: "r", status: "completed" as const }, { id: "r", status: "failed" as const }]) {
    expect(renderToStaticMarkup(<QuestScreen {...props} quest={{ ...quest, run }} />)).not.toContain("quest-live-beacon");
  }
});
it("renders one clickable completed row without an extra CTA", () => {
  const html = renderToStaticMarkup(<QuestsScreen quests={[quest]} busy={false} open={noop} team={{ id: "t", name: "Crew", status: "active", member_count: 2 }} seasonName="Season Zero" seasonXp={175} teamScreen={noop} />);
  expect(html).toContain('class="quest-row completed"');
  expect(html).toContain("DONE ✓");
  expect(html).toContain("1 / 1 · 175 XP");
  expect(html).not.toContain("OPEN DETAILS");
  expect(html).not.toContain("disabled");
});
it("completed detail is read-only even with stale check-in props or inactive team", () => {
  const html = renderToStaticMarkup(<QuestScreen quest={quest} teamActive={false} busy={false} stage="verification" feedback={{ title: "CHECK-IN FAILED", description: "retry" }} sample={null} development={true} coordinates={{ latitude: 40, longitude: 44, horizontal_accuracy: 18 }} setCoordinates={noop} start={noop} checkIn={noop} devCheckIn={noop} settings={noop} back={noop} />);
  for (const value of ["QUEST COMPLETE", "BACK TO QUESTS", "250 M", "MAP", "PLACE", "Public square"]) expect(html).toContain(value);
  for (const value of ["START QUEST", "CHECK IN", "LOCATION SETTINGS", "Check-in progress", "CHECK-IN FAILED", "Development coordinates", "radar-ping"]) expect(html).not.toContain(value);
  expect(quest.run?.status).toBe("completed");
});

it("derives progress from all real quests and season XP, with active quests first", () => {
  const quests: Quest[] = [{ ...quest, id: "a", run: null }, quest, { ...quest, id: "b", run: { id: "rb", status: "started" } }, { ...quest, id: "c", run: null }];
  const html = renderToStaticMarkup(<QuestsScreen quests={quests} busy={false} open={noop} team={{ id: "t", name: "Crew", status: "active", member_count: 2 }} seasonName="AYLOOR YEREVAN — SEASON ZERO" seasonXp={345} teamScreen={noop} />);
  expect(html).toContain("1 / 4 · 345 XP");
  expect(html).toContain("SEASON PROGRESS");
  expect(html).not.toContain("AYLOOR YEREVAN");
  expect(html).toContain('aria-valuemax="4" aria-valuenow="1"');
  expect(html).toContain('class="quest-row progress"');
  expect(html.indexOf('aria-label="IN PROGRESS"')).toBeLessThan(html.indexOf('aria-label="AVAILABLE"'));
  expect(html.indexOf('aria-label="AVAILABLE"')).toBeLessThan(html.indexOf('aria-label="COMPLETED"'));
  expect(html).not.toContain("Distance");
});
it("keeps unknown progress unknown and pending discovery separate from start", () => {
  const active = renderToStaticMarkup(<QuestsScreen quests={null} busy={false} open={noop} team={{ id: "t", name: "Crew", status: "active", member_count: 2 }} seasonName={null} seasonXp={null} teamScreen={noop} />);
  expect(active).toContain("— / — · — XP");
  expect(active).not.toContain('role="progressbar"');
  const pending = renderToStaticMarkup(<QuestsScreen quests={[{ ...quest, run: null }]} busy={false} open={noop} team={{ id: "t", name: "Crew", status: "pending", member_count: 1 }} seasonName="Season Zero" seasonXp={null} teamScreen={noop} />);
  expect(pending).toContain("GATHER YOUR TEAM");
  expect(pending).toContain("Quests start with 2 players. You have 1.");
  expect(pending).toContain('class="quest-row available team-locked"');
  expect(pending).not.toContain('role="progressbar"');
  expect(pending).not.toContain("START QUEST");
});
it("uses a bounded continuous indicator for many quests", () => {
  const quests = Array.from({ length: 50 }, (_, i) => ({ ...quest, id: `q${i}`, run: i < 7 ? quest.run : null }));
  const html = renderToStaticMarkup(<QuestsScreen quests={quests} busy={false} open={noop} team={{ id: "t", name: "Crew", status: "active", member_count: 2 }} seasonName="Season Zero" seasonXp={175} teamScreen={noop} />);
  expect(html).toContain("7 / 50 · 175 XP");
  expect(html).toContain('class="season-segments continuous"');
  expect(Number(html.match(/style="width:([\d.]+)%"/)![1])).toBeCloseTo(14);
});
it("renders one numbered checkpoint tile and a semantic overlay stamp for one completed quest", () => {
  const html = renderToStaticMarkup(<QuestsScreen quests={[quest]} busy={false} open={noop} team={{ id: "t", name: "Crew", status: "active", member_count: 2 }} seasonName="Season Zero" seasonXp={175} teamScreen={noop} />);
  expect(html).toContain('class="checkpoint-segment filled" aria-hidden="true">01 ✓</span>');
  expect(html.match(/class="checkpoint-segment/g)).toHaveLength(1);
  expect(html).not.toContain('season-segments continuous');
  expect(html).not.toContain('style="width:');
  expect(html).toContain('class="quest-done-stamp">DONE ✓</span>');
  expect(html).not.toContain('class="quest-chip"');
});
it("tracks each quest in source order rather than colouring the first completed-count tiles", () => {
  const quests: Quest[] = [{ ...quest, id: "available", run: null }, quest, { ...quest, id: "started", run: { id: "s", status: "started" } }];
  const html = renderToStaticMarkup(<QuestsScreen quests={quests} busy={false} open={noop} team={{ id: "t", name: "Crew", status: "active", member_count: 2 }} seasonName="Season Zero" seasonXp={175} teamScreen={noop} />);
  expect(html).toContain('class="checkpoint-segment" aria-hidden="true">01</span>');
  expect(html).toContain('class="checkpoint-segment filled" aria-hidden="true">02 ✓</span>');
  expect(html).toContain('class="checkpoint-segment" aria-hidden="true">03</span>');
  expect(html.match(/class="checkpoint-segment/g)).toHaveLength(3);
  expect(html).not.toContain('style="width:');
  expect(html).toContain('aria-valuemax="3" aria-valuenow="1"');
});
it("unstarted detail exposes discovery and START without reusing a stale fix", () => {
  const html = renderToStaticMarkup(<QuestScreen quest={{ ...quest, run: null }} teamActive={true} busy={false} stage="" feedback={null} sample={{ questId: quest.id, data: { latitude: 40.01, longitude: 44, horizontal_accuracy: 18 } }} development={false} coordinates={{ latitude: 40, longitude: 44, horizontal_accuracy: 18 }} setCoordinates={noop} start={noop} checkIn={noop} devCheckIn={noop} back={noop} />);
  for (const text of ["START QUEST", "MAP", "PLACE", "250 M", "+175 XP", "OPEN IN MAPS", "Public square"]) expect(html).toContain(text);
  for (const text of ["YOUR FIX", "Distance at last check-in", "GPS ACCURACY", "radar-ping"]) expect(html).not.toContain(text);
  expect(html).not.toMatch(/<button[^>]*><span>CHECK IN<\/span>/);
});

it("uses monochrome SVG arrows and one set of detail metadata", () => {
  const header = renderToStaticMarkup(<AppHeader home={noop} busy={false} />);
  const button = renderToStaticMarkup(<ActionButton onClick={noop}>OPEN</ActionButton>);
  for (const html of [header, button]) {
    expect(html).toContain('currentColor');
    expect(html).toContain('<svg');
    expect(html).not.toContain("\u2197");
    expect(html).not.toContain("\uFE0F");
  }
  const html = renderToStaticMarkup(<QuestScreen quest={quest} teamActive={true} busy={false} stage="" feedback={null} sample={null} development={false} coordinates={{ latitude: 40, longitude: 44, horizontal_accuracy: 18 }} setCoordinates={noop} start={noop} checkIn={noop} devCheckIn={noop} back={noop} />);
  expect(html.match(/\+175 XP/g)).toHaveLength(1);
  expect(html.match(/TEAM QUEST/g)).toHaveLength(1);
  expect(html.match(/250 M RADIUS/g)).toHaveLength(1);
  expect(html).not.toContain("QUEST REWARD");
  expect(html).not.toContain("EARNED");
  expect(html).not.toContain('class="quest-dock check-in-action"');
  expect(html).not.toContain('class="quest-dock unstarted-actions"');
  expect(html).toContain('class="back quest-back"');
});
it("keeps awarded XP honest and completion actions together in a compact dock", () => {
  const props = { quest, team: { id: "t", name: "Crew", status: "active" as const, member_count: 2 }, ranking: null, busy: false, ranks: noop, crew: noop, cityName: "Yerevan" };
  const success = renderToStaticMarkup(<CompleteScreen {...props} awarded={125} />);
  expect(success).toContain('+125<span>XP</span>');
  expect(success).toContain('class="quest-dock completion-actions"');
  expect(success).toContain("VIEW LEADERBOARD");
  expect(success).toContain("BACK TO TEAM");
  expect(success).toContain("Rank unavailable");
  for (const awarded of [0, null]) {
    const html = renderToStaticMarkup(<CompleteScreen {...props} awarded={awarded} />);
    expect(html).not.toContain('class="xp"');
    expect(html).not.toContain("+175");
  }
});

it('rich active detail uses real steps, crew and authored briefing without awarding XP',()=>{
 const html=renderToStaticMarkup(<QuestScreen quest={{...quest,run:{id:'r',status:'started'}}} team={{id:'t',name:'SuperBobri',status:'active',member_count:3}} teamActive busy={false} stage="" feedback={null} sample={null} development={false} coordinates={{latitude:40,longitude:44,horizontal_accuracy:18}} setCoordinates={noop} start={noop} checkIn={noop} devCheckIn={noop} back={noop}/>);
 for(const text of ['quest-check-in-steps','TAP CHECK IN','TEAM EARNS','+175 XP','SuperBobri','3 / 5','ANY TEAMMATE CAN CHECK IN','BRIEFING','Public path','Walk, don’t rush.'])expect(html).toContain(text);
 expect(html).not.toContain('YOUR FIX');expect(html).not.toContain('CHECKPOINT CLAIMED BY YOUR TEAM');
});
it('completed rich detail is read-only and omits actionable check-in instructions',()=>{
 const html=renderToStaticMarkup(<QuestScreen quest={quest} team={{id:'t',name:'Crew',status:'active',member_count:2}} teamActive busy={false} stage="" feedback={null} sample={null} development={false} coordinates={{latitude:40,longitude:44,horizontal_accuracy:18}} setCoordinates={noop} start={noop} checkIn={noop} devCheckIn={noop} back={noop}/>);
 expect(html).toContain('CHECKPOINT CLAIMED BY YOUR TEAM');expect(html).toContain('Completion confirmed');expect(html).not.toContain('quest-check-in-steps');expect(html).not.toContain('TAP CHECK IN');expect(html).toContain('BACK TO QUESTS');
});
