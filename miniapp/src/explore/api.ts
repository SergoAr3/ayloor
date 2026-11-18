import { apiBase } from "../apiBase";
import { ApiError, ApiTransportError } from "../apiErrors";

export type Guide = { slug: string; title: string; description: string; stop_count: number };
export type ArrivalState = { status: "not_configured" | "unconfirmed" | "confirmed"; confirmed_at: string | null };
export type Checkpoint = { latitude: number; longitude: number; radius_m: number; max_accuracy_m: number };
export type Run = {
  id: string; guide: Guide; phase: "clue" | "reveal" | "finished";
  arrival: ArrivalState;
  stop: { directions: string | null; checkpoint: Checkpoint | null; id: string; position: number; title: string; clue: string; hint: string | null; reveal: string | null };
};
export type Start = { credential: string; run: Run };

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
