import { describe, expect, it, vi } from "vitest";
import { getInviteCode, requestLocation } from "./telegram";
import type { WebApp } from "./types";

describe("stateless invite handoff", () => {
  it("reads query and Telegram start parameter", () => {
    expect(getInviteCode("?invite=abc-123_X")).toBe("abc-123_X");
    expect(getInviteCode("", "join_abc")).toBe("abc");
    expect(getInviteCode("?invite=one", "join_two")).toBe("one");
    expect(getInviteCode("?invite=%3Cscript%3E")).toBeNull();
    expect(getInviteCode("")).toBeNull();
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
