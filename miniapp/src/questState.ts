import { ApiError, ApiTransportError } from "./apiErrors";
import type { Coordinates, Quest, Run } from "./types";

export interface CheckInFeedback {
  title: string;
  description: string;
  locationAccessIssue?: boolean;
}

// Presentation only: errors never change the server run or request location.
export function checkInFeedback(error: string): CheckInFeedback {
  if (error.includes("outside the checkpoint radius")) return {
    title: "OUTSIDE CHECK-IN ZONE",
    description: "You’re too far from the checkpoint. Move closer and try again.",
  };
  if (error.includes("permission denied")) return {
    title: "LOCATION ACCESS DENIED",
    description: "Allow location in Telegram settings, then try CHECK IN again.",
    locationAccessIssue: true,
  };
  if (error.includes("accuracy is too low")) return {
    title: "GPS ACCURACY TOO LOW",
    description: "Your location isn’t precise enough. Move to a clearer view of the sky and try again.",
  };
  if (error.includes("accuracy is unavailable")) return {
    title: "GPS ACCURACY UNAVAILABLE",
    description: "Your device couldn’t report GPS accuracy. Move outdoors and try again.",
  };
  if (error.includes("timed out")) return {
    title: "CHECK-IN TIMED OUT",
    description: "The check-in couldn’t finish. Check your connection and location access, then try again.",
    locationAccessIssue: error.startsWith("Location request"),
  };
  if (error.startsWith("Location is unavailable") || error.startsWith("GPS coordinates are unavailable") || error.includes("Update Telegram")) return {
    title: "GPS UNAVAILABLE",
    description: `${error} Check device location settings and try again.`,
    locationAccessIssue: true,
  };
  return { title: "CHECK-IN FAILED", description: `${error} Please try CHECK IN again.` };
}

// Read server state after an ambiguous mutation; never retry POST automatically.
export async function startQuest(
  mutate: () => Promise<Run>,
  detail: () => Promise<Quest>,
): Promise<Run> {
  try {
    return await mutate();
  } catch (error) {
    const conflict = error instanceof ApiError && error.status === 409 && [
      "This team has already started or completed this quest",
      "Operation conflicts with an existing record",
      "You already belong to a pending or active team in this city",
    ].includes(error.message);
    if (!(error instanceof ApiTransportError) && !conflict) throw error;
    let quest: Quest;
    try { quest = await detail(); } catch { throw error; }
    if (quest.run?.status === "started" || quest.run?.status === "completed") return quest.run;
    throw error;
  }
}

export function currentQuest(quests: Quest[]): Quest | undefined {
  return quests.find(q => q.run?.status === "started" && !q.locked)
    ?? quests.find(q => !q.run && !q.locked)
    ?? quests.find(q => q.run?.status === "completed")
    ?? quests[0];
}

export function mapsLink(quest: Quest): string | null {
  const { latitude: lat, longitude: lon } = quest;
  if (lat == null || lon == null || !Number.isFinite(lat) || !Number.isFinite(lon)
    || Math.abs(lat) > 90 || Math.abs(lon) > 180 || (lat === 0 && lon === 0)) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lon}`)}`;
}

// Display only. The backend is the sole authority on radius and accuracy.
export function sampleDistance(sample: Coordinates, quest: Quest): number | null {
  if (!mapsLink(quest) || ![sample.latitude, sample.longitude, sample.horizontal_accuracy].every(Number.isFinite)
    || Math.abs(sample.latitude) > 90 || Math.abs(sample.longitude) > 180 || sample.horizontal_accuracy < 0) return null;
  const rad = Math.PI / 180;
  const a = Math.sin((quest.latitude! - sample.latitude) * rad / 2) ** 2
    + Math.cos(sample.latitude * rad) * Math.cos(quest.latitude! * rad)
    * Math.sin((quest.longitude! - sample.longitude) * rad / 2) ** 2;
  return Math.round(6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, a))));
}

// Presentation only; never used in the check-in request or backend verification.
export function formatCheckInDistance(meters: number, metersOnly = false): string {
  if (metersOnly || meters < 1000) return `${Math.round(meters)} M`;
  const km = meters / 1000;
  return `${km.toFixed(1)} KM`;
}

// UI thresholds only; never used to accept or reject a check-in.
export const FAR_CHECK_IN = { radiusMultiplier: 5, minimumMeters: 1000 } as const;
export const FIX_LIFETIME_MS = 15 * 60_000;
export function isFarCheckIn(distance: number, radius: number): boolean {
  return distance > Math.max(FAR_CHECK_IN.radiusMultiplier * radius, FAR_CHECK_IN.minimumMeters);
}
export function checkInAge(checkedAt: number, now: number): string | null {
  const elapsed = Math.max(0, now - checkedAt);
  if (!Number.isFinite(elapsed) || elapsed >= FIX_LIFETIME_MS) return null;
  const minutes = Math.floor(elapsed / 60_000);
  return minutes < 1 ? "JUST NOW" : `${minutes} MIN AGO`;
}
export function outsideZoneMeters(distance: number, radius: number): number {
  return Math.round(Math.max(0, distance - radius) / 10) * 10;
}
