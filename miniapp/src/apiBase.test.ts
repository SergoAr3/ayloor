import { describe, expect, it } from "vitest";
import { apiBase } from "./apiBase";

describe("production API origin", () => {
  it.each(["https://backend.example.org", "https://backend.example.org/"])("accepts %s", origin => {
    expect(apiBase(origin, true)).toBe("https://backend.example.org");
  });
  it.each([
    undefined, "", " ", "http://backend.example.org", "https://localhost", "https://app.localhost",
    "https://127.0.0.1", "https://[::1]", "https://backend.railway.internal",
    "https://user:secret@backend.example.org", "https://backend.example.org/api/v1",
    "https://backend.example.org?token=secret", "https://backend.example.org/#fragment", "invalid",
  ])("rejects invalid/missing configuration without echoing it: %s", origin => {
    expect(() => apiBase(origin, true)).toThrow("Production VITE_API_BASE_URL");
    try { apiBase(origin, true); } catch (error) { expect(String(error)).not.toContain("secret"); }
  });
  it("preserves development same-origin proxy and localhost E2E", () => {
    expect(apiBase("", false)).toBe("");
    expect(apiBase("http://127.0.0.1:8001/", false)).toBe("http://127.0.0.1:8001");
  });
});
