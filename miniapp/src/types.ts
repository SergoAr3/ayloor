export interface User {
  id: string;
  telegram_id: number;
  username: string | null;
  first_name: string | null;
}
export interface Team {
  id: string;
  name: string;
  status: "pending" | "active" | "blocked";
  member_count: number;
}
export interface Me {
  user: User;
  team: Team | null;
  city: { name: string };
  season: { name: string } | null;
}
export interface Invite {
  code: string;
  team: Team;
  link: string | null;
  remaining_uses: number | null;
}
export interface Member {
  user: User;
  role: "captain" | "member";
}
export interface Run {
  id: string;
  status: "started" | "completed" | "failed";
  gps_verified_at?: string | null;
}
export interface Quest {
  id: string;
  title: string;
  description: string;
  look_for_hint?: string | null;
  hero_image_url?: string | null;
  place_label?: string | null;
  base_xp: number;
  latitude: number | null;
  longitude: number | null;
  radius_m: number | null;
  run: Run | null;
  field_test_step?: number | null;
  locked?: boolean;
  hint_available?: boolean;
  hint_used?: boolean;
  hint_text?: string | null;
  wrong_answer_penalized?: boolean;
}
export interface FieldTest {
  status: "ready" | "running" | "expired" | "finished";
  server_now: string;
  started_at: string | null;
  deadline_at: string | null;
  finished_at: string | null;
  elapsed_seconds: number;
  remaining_seconds: number;
  score: number;
  maximum_score: number;
  completed_quests: number;
  total_quests: number;
  leaderboard_position: number | null;
}
export interface FieldAction {
  quest: Quest;
  correct: boolean | null;
  awarded_xp: number;
  penalty_xp: number;
  already_applied: boolean;
}
export interface Ranking {
  entries: { rank: number; team_id: string; team_name: string; xp: number }[];
  current_user_team_rank: number | null;
  current_user_team_xp: number | null;
  xp_to_next_rank: number | null;
}
export interface Coordinates {
  latitude: number;
  longitude: number;
  horizontal_accuracy: number;
}
export interface LocationManager {
  isInited: boolean;
  isLocationAvailable: boolean;
  isAccessRequested?: boolean;
  isAccessGranted?: boolean;
  init(callback: () => void): void;
  getLocation(
    callback: (
      data:
        | (Omit<Coordinates, "horizontal_accuracy"> & {
            horizontal_accuracy: number | null;
          })
        | null,
    ) => void,
  ): void;
  openSettings?: () => void;
}
export interface WebApp {
  initData: string;
  initDataUnsafe?: { start_param?: string };
  ready(): void;
  expand(): void;
  isVersionAtLeast(version: string): boolean;
  openTelegramLink(url: string): void;
  onEvent?(event: "locationManagerUpdated", callback: () => void): void;
  offEvent?(event: "locationManagerUpdated", callback: () => void): void;
  LocationManager?: LocationManager;
}
declare global {
  interface Window {
    Telegram?: { WebApp: WebApp };
  }
}
