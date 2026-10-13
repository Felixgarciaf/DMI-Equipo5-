import { logoutBackendSession } from "../api/courseBackend";
import {
  clearPersistedSession,
  type SessionState,
  type SessionStorage,
  unauthenticatedSession,
} from "./session";

export async function logoutSession(
  storage?: SessionStorage,
): Promise<SessionState> {
  await Promise.all([
    clearPersistedSession(storage),
    logoutBackendSession(),
  ]);
  return unauthenticatedSession;
}
