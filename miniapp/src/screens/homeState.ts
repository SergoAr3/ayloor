import type { Quest, Team } from "../types";

// Home presentation only: this never starts or completes a server run.
export function homeHero(team: Team | null, quests: Quest[] | null) {
  if (team?.status === "pending") return { kind: "pending" } as const;
  if (!team) return { kind: "no-team" } as const;
  if (team.status !== "active") return { kind: "blocked" } as const;
  const active = quests?.find(quest => quest.run?.status === "started" && !quest.locked);
  if (active) return { kind: "active", quest: active } as const;
  const available = quests?.find(quest => !quest.run && !quest.locked);
  if (available) return { kind: "available", quest: available } as const;
  if (quests?.length === 0) return { kind: "empty" } as const;
  if (quests?.length && quests.every(quest => quest.run?.status === "completed")) return { kind: "done" } as const;
  return { kind: quests ? "closed" : "loading" } as const;
}

export const HOME_COPY = {
  nextMove: "YOUR NEXT MOVE", pendingTitle: "GATHER YOUR TEAM", pendingDescription: "Your team becomes active with 2 players.", teamAction: "TEAM",
  noTeamTitle: "Find your people.", noTeamDescription: "Create a crew and play the real world.", noTeamAction: "CREATE / JOIN TEAM",
  activeStatus: "QUEST IN PROGRESS", activeAction: "CONTINUE QUEST", availableStatus: "NEXT QUEST · NOT STARTED", availableAction: "START QUEST",
  emptyStatus: "NO QUESTS YET", emptyTitle: "Next drop is coming.", emptyDescription: "New checkpoints will appear here. Meanwhile, check the rankings or get your team together.", emptyZone: "NEXT DROP TBA", emptySegments: "NONE YET",
  doneStatus: "ALL DONE ✓", doneTitle: "Season Zero checkpoints complete.", doneDescription: "Your team claimed every checkpoint. Hold your rank.", ranksAction: "VIEW RANKS",
  loading: "Loading quests…", retry: "RETRY QUESTS", closedTitle: "No open checkpoints.", closedDescription: "This quest run is closed.", blockedTitle: "Team unavailable.", blockedDescription: "Open your team to check its status.",
  noSeason: "No active season right now. Your crew can still get ready.", seasonXp: "SEASON XP", cityRank: "CITY RANK", checkpoints: "CHECKPOINTS", topTeams: "TOP TEAMS", ranks: "RANKS", you: "YOU",
} as const;
