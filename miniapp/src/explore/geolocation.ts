export type LocationSample = { latitude: number; longitude: number; accuracy_m: number; captured_at: string };

// No permission query/prompt at entry, no watchPosition and no cached samples.
export function requestLocation(signal: AbortSignal): Promise<LocationSample> {
  return new Promise((resolve, reject) => {
    if (!window.isSecureContext || !navigator.geolocation) {
      reject(new Error("Location is unavailable. Use an HTTPS browser or continue with the directions."));
      return;
    }
    let settled = false;
    const finish = (sample?: LocationSample, error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      if (sample) resolve(sample); else reject(error);
    };
    const abort = () => finish(undefined, new DOMException("Location request cancelled", "AbortError"));
    // Browser GPS timeout can exclude time spent in the permission prompt.
    const timer = window.setTimeout(() => finish(undefined, new Error("Location timed out. You can retry or use the directions.")), 20_000);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) { abort(); return; }
    try {
      navigator.geolocation.getCurrentPosition(position => {
        const { latitude, longitude, accuracy } = position.coords;
        if (![latitude, longitude, accuracy, position.timestamp].every(Number.isFinite)
          || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180 || accuracy < 0) {
          finish(undefined, new Error("Location is unavailable. Please retry or use the directions."));
          return;
        }
        finish({ latitude, longitude, accuracy_m: accuracy, captured_at: new Date(position.timestamp).toISOString() });
      }, error => finish(undefined, new Error(error.code === 1
        ? "Location permission denied. You can enable it in browser settings or use the directions."
        : error.code === 3 ? "Location timed out. You can retry or use the directions."
        : "Location is unavailable. Please retry or use the directions.")),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 });
    } catch { finish(undefined, new Error("Location is unavailable. Please retry or use the directions.")); }
  });
}
