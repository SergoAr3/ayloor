import { describe, expect, it, vi } from "vitest";
import { canOpenLocationSettings, getInviteCode, openLocationSettings, requestLocation } from "./telegram";
import type { LocationManager, WebApp } from "./types";

describe("stateless invite handoff", () => {
  it("reads query and Telegram start parameter", () => {
    expect(getInviteCode("?invite=abc-123_X")).toBe("abc-123_X");
    expect(getInviteCode("", "join_abc")).toBe("abc");
    expect(getInviteCode("?invite=one", "join_two")).toBe("one");
    expect(getInviteCode("?invite=%3Cscript%3E")).toBeNull();
    expect(getInviteCode("")).toBeNull();
  });
});

describe("location settings recovery", () => {
  function client(overrides: Partial<LocationManager> = {}, supported = true) {
    const manager: LocationManager = {
      isInited: true, isLocationAvailable: true, isAccessRequested: true, isAccessGranted: false,
      init: vi.fn(), getLocation: vi.fn(), openSettings: vi.fn(), ...overrides,
    };
    const app = { isVersionAtLeast: () => supported, LocationManager: manager } as unknown as WebApp;
    return { app, manager };
  }

  it("opens initialized denied-access settings synchronously, once, without GPS", () => {
    const { app, manager } = client();
    expect(canOpenLocationSettings(app)).toBe(true);
    expect(openLocationSettings(app)).toBe(true);
    expect(manager.openSettings).toHaveBeenCalledOnce();
    expect(manager.openSettings).toHaveBeenCalledWith();
    expect(manager.init).not.toHaveBeenCalled();
    expect(manager.getLocation).not.toHaveBeenCalled();
  });

  it.each([
    { isInited: false }, { isLocationAvailable: false }, { isAccessRequested: false },
    { isAccessGranted: true }, { isAccessGranted: undefined }, { openSettings: undefined },
  ])("does not offer or open settings for unsupported/unhelpful state %o", overrides => {
    const { app, manager } = client(overrides);
    expect(canOpenLocationSettings(app)).toBe(false);
    expect(openLocationSettings(app)).toBe(false);
    expect(manager.init).not.toHaveBeenCalled();
    expect(manager.getLocation).not.toHaveBeenCalled();
    if (manager.openSettings) expect(manager.openSettings).not.toHaveBeenCalled();
  });

  it("rejects missing and older Telegram clients", () => {
    const { app, manager } = client({}, false);
    expect(openLocationSettings(undefined)).toBe(false);
    expect(openLocationSettings({ ...app, LocationManager: undefined })).toBe(false);
    expect(openLocationSettings(app)).toBe(false);
    expect(manager.openSettings).not.toHaveBeenCalled();
  });

  it("returns failure when a supported client throws instead of silently succeeding", () => {
    const { app, manager } = client({ openSettings: vi.fn(() => { throw new Error("Unavailable"); }) });
    expect(openLocationSettings(app)).toBe(false);
    expect(manager.openSettings).toHaveBeenCalledOnce();
  });
});

describe("explicit location check-in", () => {
  function webapp(
    data: {
      latitude: number;
      longitude: number;
      horizontal_accuracy: number | null;
    } | null,
  ) {
    return {
      isVersionAtLeast: () => true,
      LocationManager: {
        isInited: false,
        isLocationAvailable: true,
        init: (callback: () => void) => callback(),
        getLocation: (callback: (d: typeof data) => void) => callback(data),
      },
    } as unknown as WebApp;
  }
  it("passes Telegram location and accuracy", async () => {
    await expect(
      requestLocation(
        webapp({ latitude: 40, longitude: 44, horizontal_accuracy: 20 }),
        false,
      ),
    ).resolves.toEqual({
      latitude: 40,
      longitude: 44,
      horizontal_accuracy: 20,
    });
  });
  it("rejects permission denial and missing accuracy", async () => {
    await expect(requestLocation(webapp(null), false)).rejects.toThrow(
      "permission denied",
    );
    await expect(
      requestLocation(
        webapp({ latitude: 0, longitude: 0, horizontal_accuracy: null }),
        false,
      ),
    ).rejects.toThrow("accuracy");
  });
  it.each([
    { latitude: NaN, longitude: 44, horizontal_accuracy: 20 },
    { latitude: 40, longitude: 44, horizontal_accuracy: Infinity },
    { latitude: 40, longitude: 44, horizontal_accuracy: -1 },
  ])("rejects invalid device samples before check-in", async data => {
    await expect(requestLocation(webapp(data), false)).rejects.toThrow(/unavailable/);
  });
  it("does not use browser fallback in production", async () => {
    const get = vi.fn();
    vi.stubGlobal("navigator", { geolocation: { getCurrentPosition: get } });
    await expect(requestLocation(undefined, false)).rejects.toThrow(
      "Update Telegram",
    );
    expect(get).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
