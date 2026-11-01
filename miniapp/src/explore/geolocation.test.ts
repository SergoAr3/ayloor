import { afterEach, expect, it, vi } from "vitest";
import { requestLocation } from "./geolocation";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

function setup(getCurrentPosition = vi.fn()) {
  vi.stubGlobal("window", { isSecureContext: true, setTimeout });
  vi.stubGlobal("navigator", { geolocation: { getCurrentPosition } });
  return getCurrentPosition;
}

it("requests one fresh sample explicitly with finite timeout and high accuracy", async () => {
  const gps = setup(vi.fn((success) => success({ coords: { latitude: 1, longitude: 2, accuracy: 5 }, timestamp: 1000 })));
  expect(gps).not.toHaveBeenCalled();
  await expect(requestLocation(new AbortController().signal)).resolves.toEqual({ latitude: 1, longitude: 2, accuracy_m: 5, captured_at: "1970-01-01T00:00:01.000Z" });
  expect(gps).toHaveBeenCalledTimes(1);
  expect(gps.mock.calls[0][2]).toEqual({ enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
});

it.each([[1, "permission denied"], [2, "unavailable"], [3, "timed out"]])("explains GPS error %s", async (code, message) => {
  setup(vi.fn((_success, error) => error({ code })));
  await expect(requestLocation(new AbortController().signal)).rejects.toThrow(String(message));
});

it("handles insecure context and unavailable browser API without requesting GPS", async () => {
  const gps = setup();
  vi.stubGlobal("window", { isSecureContext: false });
  await expect(requestLocation(new AbortController().signal)).rejects.toThrow("HTTPS");
  expect(gps).not.toHaveBeenCalled();
  vi.stubGlobal("window", { isSecureContext: true });
  vi.stubGlobal("navigator", {});
  await expect(requestLocation(new AbortController().signal)).rejects.toThrow("unavailable");
});

it("times out even when browser never calls back, ignoring a late success", async () => {
  vi.useFakeTimers();
  const gps = setup();
  const result = expect(requestLocation(new AbortController().signal)).rejects.toThrow("timed out");
  await vi.advanceTimersByTimeAsync(20000);
  await result;
  gps.mock.calls[0][0]({ coords: { latitude: 0, longitude: 0, accuracy: 10 }, timestamp: Date.now() });
  expect(vi.getTimerCount()).toBe(0);
});

it("cancels local work on stop change and ignores later GPS callbacks", async () => {
  const gps = setup();
  const controller = new AbortController();
  const result = expect(requestLocation(controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  controller.abort();
  await result;
  gps.mock.calls[0][0]({ coords: { latitude: 0, longitude: 0, accuracy: 10 }, timestamp: Date.now() });
});

it.each([NaN, Infinity, -1])("rejects unusable accuracy %s", async accuracy => {
  setup(vi.fn(success => success({ coords: { latitude: 0, longitude: 0, accuracy }, timestamp: Date.now() })));
  await expect(requestLocation(new AbortController().signal)).rejects.toThrow("unavailable");
});
