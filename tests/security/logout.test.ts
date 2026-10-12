import { logoutSession } from "../../src/security/logout";
import {
  REFRESH_TOKEN_KEY,
  SESSION_ACTOR_KEY,
  SESSION_TOKEN_KEY,
  persistSession,
  readPersistedSession,
  type SessionStorage,
} from "../../src/security/session";

class MemorySessionStorage implements SessionStorage {
  readonly values = new Map<string, string>();

  async saveSensitiveData(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }

  async getSensitiveData(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async removeSensitiveData(key: string): Promise<void> {
    this.values.delete(key);
  }
}

test("logout removes persisted session tokens and actor state", async () => {
  const storage = new MemorySessionStorage();
  await persistSession(
    {
      status: "authenticated",
      principal: { actorId: "technician-1", role: "technician" },
      accessToken: "course-access-token",
      refreshToken: "course-refresh-token",
      generation: 2,
    },
    storage,
  );

  await expect(readPersistedSession(storage)).resolves.toMatchObject({
    status: "authenticated",
    accessToken: "course-access-token",
  });

  await expect(logoutSession(storage)).resolves.toEqual({
    status: "unauthenticated",
    principal: null,
    accessToken: null,
    refreshToken: null,
    generation: null,
  });
  expect(storage.values.has(SESSION_TOKEN_KEY)).toBe(false);
  expect(storage.values.has(REFRESH_TOKEN_KEY)).toBe(false);
  expect(storage.values.has(SESSION_ACTOR_KEY)).toBe(false);
  await expect(readPersistedSession(storage)).resolves.toEqual({
    status: "unauthenticated",
    principal: null,
    accessToken: null,
    refreshToken: null,
    generation: null,
  });
});
