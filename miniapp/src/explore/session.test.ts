import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { exploreApi, type Run } from "./api";
import { entryGuide, lastGuideKey, legacyStorageKey, loadSaved, previousWalkLink, restoreWalk, save, storageKey } from "./session";

vi.mock("./api", () => ({ exploreApi: vi.fn() }));
const api = vi.mocked(exploreApi);
const first = { runId: "00000000-0000-4000-8000-000000000001", credential: "a".repeat(64) };
const second = { runId: "00000000-0000-4000-8000-000000000002", credential: "b".repeat(64) };
let values: Map<string, string>;
function run(slug: string, id = first.runId) {
  return { id, guide: { slug, title: slug, description: "Test", stop_count: 3 }, phase: "reveal" } as Run;
}

beforeEach(() => {
  values = new Map();
  vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
  api.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

it.each(["?guide=", "?guide=../walk", "?guide=A", "?guide=a&guide=b", `?guide=${"a".repeat(101)}`])("rejects invalid entry %s without fallback", search => {
  expect(() => entryGuide(search)).toThrow("Invalid walk link");
  expect(api).not.toHaveBeenCalled();
});
it("has no implicit demo or latest alias", () => {
  expect(entryGuide("")).toBeNull();
  expect(entryGuide("?guide=example-walk-v2")).toBe("example-walk-v2");
});
it("isolates both pending starts and credentials by version", () => {
  save("walk-v1", first);
  save("walk-v2", { startKey: "c".repeat(64) });
  expect(loadSaved("walk-v1")).toEqual(first);
  expect(loadSaved("walk-v2")).toEqual({ startKey: "c".repeat(64) });
  save("walk-v2", second);
  expect(loadSaved("walk-v1")).toEqual(first);
  expect(loadSaved("walk-v2")).toEqual(second);
});
it("resumes pinned metadata by run, without depending on current entry metadata", async () => {
  save("walk-v1", first);
  save("walk-v2", second);
  const original = run("walk-v1");
  api.mockResolvedValue(original);
  const state = await restoreWalk("walk-v1");
  expect(state.run).toBe(original);
  expect(state.guide.slug).toBe("walk-v1");
  expect(api.mock.calls).toEqual([[`/runs/${first.runId}`, first.credential]]);
});
it("bare entry resumes last saved version but cannot start a default", async () => {
  await expect(restoreWalk(null)).rejects.toThrow("No walk selected");
  expect(api).not.toHaveBeenCalled();
  save("walk-v2", second);
  api.mockResolvedValue(run("walk-v2", second.runId));
  expect((await restoreWalk(null)).slug).toBe("walk-v2");
});
it("a new entry offers the old saved walk separately without consuming its credential", async () => {
  save("walk-v1", first);
  api.mockResolvedValue(run("walk-v2").guide);
  expect(previousWalkLink("walk-v2")).toBe("/explore.html?guide=walk-v1");
  const result = await restoreWalk("walk-v2");
  expect(result.saved).toBeNull(); expect(result.run).toBeNull();
  expect(api.mock.calls).toEqual([["/guides/walk-v2"]]);
  expect(values.get(lastGuideKey)).toBe("walk-v1");
});
it("unavailable explicit entry never falls back to another saved guide", async () => {
  save("walk-v1", first);
  api.mockRejectedValue(new Error("Guide is not available"));
  await expect(restoreWalk("unknown-v1")).rejects.toThrow("not available");
  expect(api.mock.calls).toEqual([["/guides/unknown-v1"]]);
  expect(loadSaved("walk-v1")).toEqual(first);
});
it("rejects a mismatched stored run instead of relabelling it as the entry guide", async () => {
  save("walk-v2", first);
  api.mockResolvedValue(run("walk-v1"));
  await expect(restoreWalk("walk-v2")).rejects.toThrow("does not match");
  expect(loadSaved("walk-v2")).toEqual(first);
});
it("legacy credentials resolve their actual server guide and are never deleted", async () => {
  values.set(legacyStorageKey, JSON.stringify(first));
  api.mockResolvedValue(run("explore-demo-v1"));
  const state = await restoreWalk(null);
  expect(state.slug).toBe("explore-demo-v1"); expect(state.migrate).toBe(true);
  expect(values.get(legacyStorageKey)).toBe(JSON.stringify(first));
  // Resolver is read-only; caller persists migration only after checking its epoch.
  expect(loadSaved("explore-demo-v1")).toBeNull();
});
it("legacy pending Start belongs only to the original demo version", async () => {
  values.set(legacyStorageKey, JSON.stringify({ startKey: "c".repeat(64) }));
  api.mockResolvedValue(run("walk-v2").guide);
  expect((await restoreWalk("walk-v2")).saved).toBeNull();
  api.mockResolvedValue(run("explore-demo-v1").guide);
  const old = await restoreWalk(null);
  expect(old.slug).toBe("explore-demo-v1"); expect(old.migrate).toBe(true);
  expect(old.saved).toEqual({ startKey: "c".repeat(64) });
});
it("scoped access wins over retained legacy credentials without overwriting either", async () => {
  values.set(legacyStorageKey, JSON.stringify(first));
  save("explore-demo-v1", second);
  api.mockResolvedValue(run("explore-demo-v1", second.runId));
  const restored = await restoreWalk("explore-demo-v1");
  expect(restored.saved).toEqual(second); expect(restored.migrate).toBe(false);
  expect(api.mock.calls).toEqual([[`/runs/${second.runId}`, second.credential]]);
  expect(values.get(legacyStorageKey)).toBe(JSON.stringify(first));
});
it("a broken record blocks only that version and is not overwritten", async () => {
  values.set(storageKey("walk-v1"), "{broken");
  save("walk-v2", second);
  await expect(restoreWalk("walk-v1")).rejects.toThrow("unreadable");
  expect(api).not.toHaveBeenCalled();
  api.mockResolvedValue(run("walk-v2", second.runId));
  expect((await restoreWalk("walk-v2")).saved).toEqual(second);
  expect(values.get(storageKey("walk-v1"))).toBe("{broken");
});
