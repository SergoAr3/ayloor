import { apiBase } from "../apiBase";
import { ApiError, ApiTransportError } from "../apiErrors";

export const guideSlug = "explore-demo-v1";
export const storageKey = "ayloor-explore-demo-v1";
export type Guide = { slug: string; title: string; description: string; stop_count: number };
export type Run = {
  id: string; guide: Guide; phase: "clue" | "reveal" | "finished";
  stop: { id: string; position: number; title: string; clue: string; hint: string | null; reveal: string | null };
};
export type Saved = { startKey: string } | { runId: string; credential: string };
export type Start = { credential: string; run: Run };

export function loadSaved(): Saved | null {
  const raw = localStorage.getItem(storageKey);
  if (!raw) return null;
  const data: unknown = JSON.parse(raw);
  if (data && typeof data === "object") {
    if ("startKey" in data && typeof data.startKey === "string" && /^[a-f0-9]{64}$/.test(data.startKey))
      return { startKey: data.startKey };
    if ("runId" in data && typeof data.runId === "string" && /^[a-f0-9-]{36}$/.test(data.runId)
      && "credential" in data && typeof data.credential === "string" && /^[a-f0-9]{64}$/.test(data.credential))
      return { runId: data.runId, credential: data.credential };
  }
  throw new Error("Saved demo access is unreadable. Start over on this device to continue.");
}

export function save(value: Saved): void {
  localStorage.setItem(storageKey, JSON.stringify(value));
}

export function newStartKey(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function exploreApi<T>(path: string, credential?: string, body?: unknown): Promise<T> {
  const timeout = new AbortController();
  const timer = window.setTimeout(() => timeout.abort(), 20_000);
  try {
    const response = await fetch(`${apiBase(import.meta.env.VITE_API_BASE_URL, import.meta.env.PROD)}/api/v1/explore${path}`, {
      method: body === undefined ? "GET" : "POST", signal: timeout.signal,
      credentials: "omit", cache: "no-store",
      headers: { ...(credential ? { Authorization: `Bearer ${credential}` } : {}),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new ApiError(response.status, typeof data.detail === "string" ? data.detail : "Request failed. Please retry.");
    }
    return await response.json() as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiTransportError("Connection interrupted. Resume to check saved progress before trying again.");
  } finally { clearTimeout(timer); }
}
