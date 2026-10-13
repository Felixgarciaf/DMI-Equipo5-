import type { CampusRole } from "../campusops/contracts";
import { secureStorageService } from "./secureStorage";

export const SESSION_TOKEN_KEY = "session_token";
export const REFRESH_TOKEN_KEY = "refresh_token";
export const SESSION_ACTOR_KEY = "session_actor";

export type SessionStorage = Readonly<{
  saveSensitiveData(key: string, value: string): Promise<void>;
  getSensitiveData(key: string): Promise<string | null>;
  removeSensitiveData(key: string): Promise<void>;
}>;

export type SessionPrincipal = Readonly<{
  actorId: string;
  role: CampusRole;
}>;

export type AuthenticatedSession = Readonly<{
  status: "authenticated";
  principal: SessionPrincipal;
  accessToken: string;
  refreshToken?: string;
  generation: number;
}>;

export type UnauthenticatedSession = Readonly<{
  status: "unauthenticated";
  principal: null;
  accessToken: null;
  refreshToken: null;
  generation: null;
}>;

export type SessionState = AuthenticatedSession | UnauthenticatedSession;

export const unauthenticatedSession: UnauthenticatedSession = {
  status: "unauthenticated",
  principal: null,
  accessToken: null,
  refreshToken: null,
  generation: null,
};

function isCampusRole(value: unknown): value is CampusRole {
  return (
    value === "reporter" || value === "technician" || value === "coordinator"
  );
}

export async function persistSession(
  session: AuthenticatedSession,
  storage: SessionStorage = secureStorageService,
): Promise<void> {
  await storage.saveSensitiveData(SESSION_TOKEN_KEY, session.accessToken);
  await storage.saveSensitiveData(
    SESSION_ACTOR_KEY,
    JSON.stringify({
      actorId: session.principal.actorId,
      role: session.principal.role,
      generation: session.generation,
    }),
  );

  if (session.refreshToken) {
    await storage.saveSensitiveData(REFRESH_TOKEN_KEY, session.refreshToken);
  }
}

export async function readPersistedSession(
  storage: SessionStorage = secureStorageService,
): Promise<SessionState> {
  const token = await storage.getSensitiveData(SESSION_TOKEN_KEY);
  const actorPayload = await storage.getSensitiveData(SESSION_ACTOR_KEY);

  if (!token || !actorPayload) return unauthenticatedSession;

  try {
    const actor = JSON.parse(actorPayload) as Record<string, unknown>;
    if (
      typeof actor.actorId !== "string" ||
      actor.actorId.trim() === "" ||
      !isCampusRole(actor.role) ||
      typeof actor.generation !== "number" ||
      !Number.isInteger(actor.generation)
    ) {
      return unauthenticatedSession;
    }

    const refreshToken = await storage.getSensitiveData(REFRESH_TOKEN_KEY);
    const session: AuthenticatedSession = {
      status: "authenticated",
      principal: {
        actorId: actor.actorId,
        role: actor.role,
      },
      accessToken: token,
      generation: actor.generation,
    };

    return refreshToken ? { ...session, refreshToken } : session;
  } catch {
    return unauthenticatedSession;
  }
}

export async function clearPersistedSession(
  storage: SessionStorage = secureStorageService,
): Promise<void> {
  await storage.removeSensitiveData(SESSION_TOKEN_KEY);
  await storage.removeSensitiveData(REFRESH_TOKEN_KEY);
  await storage.removeSensitiveData(SESSION_ACTOR_KEY);
}
