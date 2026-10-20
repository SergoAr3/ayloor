import { ApiError, ApiTransportError } from "./apiErrors";
import type { Me } from "./types";

const membershipConflict =
  "You already belong to a pending or active team in this city";

export async function changeTeam(
  mutate: () => Promise<unknown>,
  refresh: () => Promise<Me>,
  expectedTeamId?: string,
): Promise<Me> {
  try {
    await mutate();
  } catch (error) {
    const ambiguous = error instanceof ApiTransportError;
    const alreadyMember =
      error instanceof ApiError &&
      error.status === 409 &&
      error.message === membershipConflict;
    if (!ambiguous && !alreadyMember) throw error;
    // Reconcile state without retrying a mutation or assuming every 409 is success.
    let current: Me;
    try {
      current = await refresh();
    } catch {
      throw error;
    }
    if (!current.team || (expectedTeamId && current.team.id !== expectedTeamId))
      throw error;
    return current;
  }
  return refresh();
}
