import {
  clearPersistedSession,
  type SessionState,
  type SessionStorage,
  unauthenticatedSession,
} from "./session";

export async function logoutSession(
  storage?: SessionStorage,
): Promise<SessionState> {
  await clearPersistedSession(storage);
  return unauthenticatedSession;
}
