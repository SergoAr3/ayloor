import { afterEach, expect, it, vi } from "vitest";
import { ApiError, ApiTransportError } from "../apiErrors";
import { exploreApi, newStartKey } from "./api";
import { loadSaved, save, storageKey, lastGuideKey } from "./session";

afterEach(() => vi.unstubAllGlobals());

it("restores pending starts and run access without ever reading the Telegram token", () => {
  const values = new Map<string, string>();
  const get = vi.fn((key: string) => values.get(key) ?? null);
  vi.stubGlobal("localStorage", { getItem: get, setItem: (key: string, value: string) => values.set(key, value) });
  expect(loadSaved("walk-v1")).toBeNull();
  const pending = { startKey: "a".repeat(64) };
  save("walk-v1", pending); expect(loadSaved("walk-v1")).toEqual(pending);
  const ready = { runId: "00000000-0000-4000-8000-000000000001", credential: "b".repeat(64) };
  save("walk-v1", ready); expect(loadSaved("walk-v1")).toEqual(ready);
  values.set(storageKey("walk-v1"), '{"credential":"invalid"}');
  expect(() => loadSaved("walk-v1")).toThrow("Saved walk access is unreadable");
  expect(get.mock.calls.every(([key]) => key === storageKey("walk-v1") || key === lastGuideKey)).toBe(true);
});

it("propagates unavailable storage instead of silently starting an unresumable run", () => {
  vi.stubGlobal("localStorage", { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } });
  expect(() => loadSaved("walk-v1")).toThrow("blocked");
  expect(() => save("walk-v1", { startKey: "a".repeat(64) })).toThrow("blocked");
});

it("uses crypto randomness for a secret 256-bit retry key", () => {
  const key = newStartKey();
  expect(key).toMatch(/^[a-f0-9]{64}$/);
  expect(newStartKey()).not.toBe(key);
});

it("isolates credentials and 401 handling from multiplayer, omits cookies and caching", async () => {
  vi.stubGlobal("window", globalThis);
  const dispatch = vi.fn();
  vi.stubGlobal("sessionStorage", { removeItem: vi.fn(() => { throw new Error("must not touch legacy"); }) });
  vi.stubGlobal("dispatchEvent", dispatch);
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: "Invalid run" }), { status: 401 }));
  vi.stubGlobal("fetch", fetcher);
  await expect(exploreApi("/runs/id", "run-token")).rejects.toBeInstanceOf(ApiError);
  expect(fetcher.mock.calls[0][1]).toMatchObject({ credentials: "omit", cache: "no-store", headers: { Authorization: "Bearer run-token" } });
  expect(dispatch).not.toHaveBeenCalled();
});

it("distinguishes ambiguous writes from server validation failures without retrying", async () => {
  vi.stubGlobal("window", globalThis);
  const fetcher = vi.fn().mockRejectedValue(new Error("lost response"));
  vi.stubGlobal("fetch", fetcher);
  await expect(exploreApi("/runs/id/continue", "token", { stop_id: "s" })).rejects.toBeInstanceOf(ApiTransportError);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
