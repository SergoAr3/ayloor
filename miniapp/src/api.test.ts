import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, ApiTransportError } from "./apiErrors";

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal("sessionStorage", {
    getItem: () => null,
    setItem: vi.fn(),
    removeItem: vi.fn(),
  });
  vi.stubGlobal("window", { setTimeout, clearTimeout, dispatchEvent: vi.fn() });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("API error classification", () => {
  it("preserves HTTP status and validation detail", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: "Team is full" }), {
          status: 409,
        }),
      ),
    );
    const { api } = await import("./api");
    await expect(api("/invites/code/join", {})).rejects.toMatchObject({
      name: "ApiError",
      status: 409,
      message: "Team is full",
    });
  });

  it.each([
    new TypeError("Failed to fetch"),
    new DOMException("Timeout", "AbortError"),
  ])(
    "classifies interrupted requests as ambiguous transport failures",
    async (error) => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(error));
      const { api } = await import("./api");
      await expect(
        api("/teams", { name: "Kentron Mafia" }),
      ).rejects.toHaveProperty("name", "ApiTransportError");
    },
  );

  it("classifies an unreadable success response as ambiguous", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(new Response("truncated JSON", { status: 201 })),
    );
    const { api } = await import("./api");
    await expect(
      api("/teams", { name: "Kentron Mafia" }),
    ).rejects.toHaveProperty("name", "ApiTransportError");
  });

  it("keeps validation and transport error classes distinct", () => {
    expect(new ApiError(422, "Invalid input")).not.toBeInstanceOf(
      ApiTransportError,
    );
  });

  it.each(["null", "[]", "invalid JSON"])(
    "keeps HTTP errors distinct even with an unexpected error body: %s",
    async (body) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response(body, { status: 422 })),
      );
      const { api } = await import("./api");
      await expect(
        api("/teams", { name: "Kentron Mafia" }),
      ).rejects.toMatchObject({ name: "ApiError", status: 422 });
    },
  );

  it("preserves session expiration handling for HTTP 401", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ detail: "Expired token" }), {
            status: 401,
          }),
        ),
    );
    const { api } = await import("./api");
    await expect(api("/me")).rejects.toMatchObject({
      name: "ApiError",
      status: 401,
    });
    expect(sessionStorage.removeItem).toHaveBeenCalledWith("ayloor-token");
    expect(window.dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "ayloor-session-expired" }),
    );
  });
});
