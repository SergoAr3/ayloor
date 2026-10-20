import { describe, expect, it, vi } from "vitest";
import { ApiError, ApiTransportError } from "./apiErrors";
import { changeTeam } from "./teamMutation";
import type { Me } from "./types";

const current: Me = {
  user: { id: "user", telegram_id: 1, username: null, first_name: "Player" },
  team: {
    id: "team",
    name: "Kentron Mafia",
    status: "active",
    member_count: 2,
  },
  city: { name: "Yerevan" },
  season: { name: "Season Zero" },
};
const conflict = () =>
  new ApiError(
    409,
    "You already belong to a pending or active team in this city",
  );

describe("create/join reconciliation", () => {
  it("refreshes after a normal successful mutation", async () => {
    const mutate = vi.fn().mockResolvedValue({});
    const refresh = vi.fn().mockResolvedValue(current);
    await expect(changeTeam(mutate, refresh)).resolves.toEqual(current);
    expect(mutate).toHaveBeenCalledOnce();
    expect(refresh).toHaveBeenCalledOnce();
  });

  it.each(["create", "join"])(
    "recovers %s after commit with a lost response without retrying",
    async (operation) => {
      let committed = false;
      const mutate = vi.fn(async () => {
        committed = true;
        throw new ApiTransportError("Lost response");
      });
      const refresh = vi.fn(async () => {
        expect(committed).toBe(true);
        return current;
      });
      await expect(
        changeTeam(mutate, refresh, operation === "join" ? "team" : undefined),
      ).resolves.toEqual(current);
      expect(mutate).toHaveBeenCalledOnce();
      expect(refresh).toHaveBeenCalledOnce();
    },
  );

  it("recovers a membership conflict only after confirming membership through /me", async () => {
    const refresh = vi.fn().mockResolvedValue(current);
    await expect(
      changeTeam(vi.fn().mockRejectedValue(conflict()), refresh, "team"),
    ).resolves.toEqual(current);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it.each([
    new ApiError(409, "Team is full"),
    new ApiError(409, "Invite has no uses remaining"),
    new ApiError(422, "Invalid team name"),
    new ApiError(410, "Invite has expired"),
    new ApiError(403, "Team is blocked"),
  ])("preserves HTTP validation error: $message", async (error) => {
    const refresh = vi.fn();
    await expect(
      changeTeam(vi.fn().mockRejectedValue(error), refresh),
    ).rejects.toBe(error);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("does not turn a conflict into success if /me has no team", async () => {
    const error = conflict();
    await expect(
      changeTeam(
        vi.fn().mockRejectedValue(error),
        vi.fn().mockResolvedValue({ ...current, team: null }),
      ),
    ).rejects.toBe(error);
  });

  it("keeps the real join error if /me shows a different team", async () => {
    const error = conflict();
    await expect(
      changeTeam(
        vi.fn().mockRejectedValue(error),
        vi.fn().mockResolvedValue(current),
        "other-team",
      ),
    ).rejects.toBe(error);
  });

  it("keeps the transport error if reconciliation finds no membership", async () => {
    const error = new ApiTransportError("Lost response");
    await expect(
      changeTeam(
        vi.fn().mockRejectedValue(error),
        vi.fn().mockResolvedValue({ ...current, team: null }),
      ),
    ).rejects.toBe(error);
  });

  it("allows a retry membership conflict to recover after the first reconciliation fails", async () => {
    const lost = new ApiTransportError("Lost response");
    const mutate = vi
      .fn()
      .mockRejectedValueOnce(lost)
      .mockRejectedValueOnce(conflict());
    const refresh = vi
      .fn()
      .mockRejectedValueOnce(new ApiTransportError("Still offline"))
      .mockResolvedValueOnce(current);
    await expect(changeTeam(mutate, refresh, "team")).rejects.toBe(lost);
    await expect(changeTeam(mutate, refresh, "team")).resolves.toEqual(current);
  });
});
