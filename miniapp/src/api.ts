import { ApiError, ApiTransportError } from "./apiErrors";

const base = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
let accessToken = sessionStorage.getItem("ayloor-token") || "";

export function setToken(token: string) {
  accessToken = token;
  if (token) sessionStorage.setItem("ayloor-token", token);
  else sessionStorage.removeItem("ayloor-token");
}

export async function api<T>(
  path: string,
  body?: unknown,
  method = body === undefined ? "GET" : "POST",
): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(`${base}/api/v1${path}`, {
      method,
      signal: controller.signal,
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) {
      const data: unknown = await response.json().catch(() => ({}));
      const detail =
        data !== null && typeof data === "object" && "detail" in data
          ? data.detail
          : undefined;
      if (response.status === 401) {
        setToken("");
        window.dispatchEvent(new Event("ayloor-session-expired"));
      }
      throw new ApiError(
        response.status,
        typeof detail === "string"
          ? detail
          : "Request failed. Please try again.",
      );
    }
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof DOMException && error.name === "AbortError")
      throw new ApiTransportError("Request timed out. Please try again.");
    // A dropped connection or unreadable success response does not establish
    // whether a mutation committed. Keep it distinct from HTTP validation errors.
    throw new ApiTransportError("Connection interrupted. Please try again.");
  } finally {
    window.clearTimeout(timeout);
  }
}
