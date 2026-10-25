import type { Coordinates, WebApp } from "./types";

export function getInviteCode(
  search: string,
  startParam?: string,
): string | null {
  const code =
    new URLSearchParams(search).get("invite") ||
    startParam?.replace(/^join_/, "");
  return code && /^[A-Za-z0-9_-]{1,40}$/.test(code) ? code : null;
}

export function canOpenLocationSettings(webapp: WebApp | undefined): boolean {
  const manager = webapp?.LocationManager;
  return Boolean(
    typeof webapp?.isVersionAtLeast === "function" && webapp.isVersionAtLeast("8.0")
    && manager?.isInited && manager.isLocationAvailable
    && manager.isAccessRequested === true && manager.isAccessGranted === false
    && typeof manager.openSettings === "function",
  );
}

// Call synchronously from a user click. Initialization already happens during
// CHECK IN; awaiting init here could lose Telegram's user-interaction context.
export function openLocationSettings(webapp: WebApp | undefined): boolean {
  if (!canOpenLocationSettings(webapp)) return false;
  try {
    webapp!.LocationManager!.openSettings!();
    return true;
  } catch {
    return false;
  }
}

export function requestLocation(
  webapp: WebApp | undefined,
  development: boolean,
): Promise<Coordinates> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Location request timed out. Please retry.")),
      30000,
    );
    const done = (coordinates: Coordinates) => {
      clearTimeout(timer);
      if (!Number.isFinite(coordinates.latitude) || !Number.isFinite(coordinates.longitude)
        || Math.abs(coordinates.latitude) > 90 || Math.abs(coordinates.longitude) > 180) {
        reject(new Error("GPS coordinates are unavailable. Please retry outdoors."));
        return;
      }
      if (!Number.isFinite(coordinates.horizontal_accuracy) || coordinates.horizontal_accuracy < 0) {
        reject(new Error("GPS accuracy is unavailable. Please retry outdoors."));
        return;
      }
      resolve(coordinates);
    };
    const fail = (message: string) => {
      clearTimeout(timer);
      reject(new Error(message));
    };
    const manager = webapp?.LocationManager;
    if (manager && webapp?.isVersionAtLeast("8.0")) {
      const get = () => {
        if (!manager.isLocationAvailable) {
          fail("Location is unavailable on this device.");
          return;
        }
        manager.getLocation((data) => {
          if (!data) {
            fail(
              "Location permission denied. Open location settings and retry.",
            );
            return;
          }
          if (data.horizontal_accuracy === null) {
            fail("GPS accuracy is unavailable. Please retry outdoors.");
            return;
          }
          done({
            latitude: data.latitude,
            longitude: data.longitude,
            horizontal_accuracy: data.horizontal_accuracy,
          });
        });
      };
      if (manager.isInited) get();
      else manager.init(get);
    } else if (development && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) =>
          done({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            horizontal_accuracy: position.coords.accuracy,
          }),
        () => fail("Location permission denied or GPS unavailable."),
        { enableHighAccuracy: true, maximumAge: 0, timeout: 25000 },
      );
    } else
      fail(
        "Update Telegram to a version with location support and open AYLOOR there.",
      );
  });
}
