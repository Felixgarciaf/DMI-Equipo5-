import { redactForTelemetry } from '../campusops/telemetry/redactForTelemetry';
import { secureStorageService } from '../security/secureStorage';

const ACCESS_TOKEN_KEY = 'accessToken';
const REFRESH_TOKEN_KEY = 'refreshToken';
let refreshPromise: Promise<string> | null = null;
let sessionRevision = 0;

export type SessionStatus = 'authenticated' | 'anonymous';

let sessionStatus: SessionStatus = 'anonymous';
const sessionStatusListeners = new Set<(status: SessionStatus) => void>();

function updateSessionStatus(status: SessionStatus): void {
  sessionStatus = status;
  for (const listener of sessionStatusListeners) {
    listener(status);
  }
}

export function getSessionStatus(): SessionStatus {
  return sessionStatus;
}

export function subscribeToSessionStatus(
  listener: (status: SessionStatus) => void,
): () => void {
  sessionStatusListeners.add(listener);
  return () => sessionStatusListeners.delete(listener);
}

async function clearBackendTokens(): Promise<void> {
  await Promise.all([
    secureStorageService.removeSensitiveData(ACCESS_TOKEN_KEY),
    secureStorageService.removeSensitiveData(REFRESH_TOKEN_KEY),
  ]);
}

async function clearSession(expectedRevision?: number): Promise<void> {
  if (expectedRevision !== undefined && expectedRevision !== sessionRevision) {
    return;
  }

  sessionRevision += 1;
  refreshPromise = null;
  try {
    await clearBackendTokens();
  } finally {
    updateSessionStatus('anonymous');
  }
}

export async function logoutBackendSession(): Promise<void> {
  await clearSession();
}

export type BackendHealth = Readonly<{
  ok: true;
  service: 'dmi-controlled-backend';
  contractVersion: 1;
}>;

const getEnvBackendUrl = (): string => {
  return process.env.EXPO_PUBLIC_COURSE_BACKEND_URL ?? 'http://127.0.0.1:4310';
};

/**
 * Sanitiza la información enviada a consola utilizando el redactor
 * canónico de CampusOps para evitar filtraciones de datos sensibles.
 */
export function sanitizeLog(
  message: string,
  data?: Record<string, unknown>,
): void {
  if (!data) {
    console.log(`[CampusOps Audit Log]: ${message}`);
    return;
  }

  const safeData = redactForTelemetry(data);

  console.log(`[CampusOps Audit Log]: ${message}`, safeData);
}

function ensureSessionRevision(revision: number): void {
  if (revision !== sessionRevision) {
    throw new Error('Session ended during token refresh');
  }
}

async function refreshAccessToken(
  baseUrl: string,
  revision: number,
): Promise<string> {
  const refreshToken = await secureStorageService.getSensitiveData(REFRESH_TOKEN_KEY);
  ensureSessionRevision(revision);
  if (!refreshToken) {
    throw new Error('Refresh token is not available');
  }

  const response = await fetch(`${baseUrl}/v1/session/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  ensureSessionRevision(revision);
  if (!response.ok) {
    throw new Error(`Token refresh failed with ${response.status}`);
  }

  const payload: unknown = await response.json();
  ensureSessionRevision(revision);
  const rotatedRefreshToken =
    typeof payload === 'object' && payload !== null && 'refreshToken' in payload
      ? payload.refreshToken
      : undefined;
  if (
    typeof payload !== 'object' ||
    payload === null ||
    !('accessToken' in payload) ||
    typeof payload.accessToken !== 'string' ||
    payload.accessToken.length === 0 ||
    (rotatedRefreshToken !== undefined &&
      typeof rotatedRefreshToken !== 'string')
  ) {
    throw new Error('Token refresh response contract mismatch');
  }

  try {
    await secureStorageService.saveSensitiveData(ACCESS_TOKEN_KEY, payload.accessToken);
    ensureSessionRevision(revision);
    if (
      typeof rotatedRefreshToken === 'string' &&
      rotatedRefreshToken.length > 0
    ) {
      await secureStorageService.saveSensitiveData(
        REFRESH_TOKEN_KEY,
        rotatedRefreshToken,
      );
    }
    ensureSessionRevision(revision);
  } catch (error) {
    if (revision !== sessionRevision) {
      await clearBackendTokens();
    }
    throw error;
  }
  return payload.accessToken;
}

async function getAccessTokenAfterUnauthorized(
  rejectedToken: string,
  baseUrl: string,
  revision: number,
): Promise<string> {
  ensureSessionRevision(revision);
  if (refreshPromise) {
    return refreshPromise;
  }

  const currentToken = await secureStorageService.getSensitiveData(ACCESS_TOKEN_KEY);
  ensureSessionRevision(revision);
  if (refreshPromise) {
    return refreshPromise;
  }
  if (currentToken && currentToken !== rejectedToken) {
    return currentToken;
  }

  const activeRefresh = refreshAccessToken(baseUrl, revision)
    .catch(async (refreshError: unknown) => {
      if (revision === sessionRevision) {
        try {
          await clearSession(revision);
        } catch (cleanupError: unknown) {
          throw new AggregateError(
            [refreshError, cleanupError],
            'Token refresh failed and session cleanup was incomplete',
          );
        }
      }
      throw refreshError;
    })
    .finally(() => {
      if (refreshPromise === activeRefresh) {
        refreshPromise = null;
      }
    });
  refreshPromise = activeRefresh;
  return activeRefresh;
}

/**
 * Performs an authenticated GET, sharing a single token refresh across concurrent 401 responses.
 */
export async function getAuthenticated(
  path: string,
  baseUrl = getEnvBackendUrl(),
): Promise<Response> {
  if (!path.startsWith('/')) {
    throw new Error('Authenticated path must start with "/"');
  }

  const requestRevision = sessionRevision;
  const accessToken = await secureStorageService.getSensitiveData(ACCESS_TOKEN_KEY);
  ensureSessionRevision(requestRevision);
  if (!accessToken) {
    throw new Error('Access token is not available');
  }
  updateSessionStatus('authenticated');

  const url = `${baseUrl}${path}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  ensureSessionRevision(requestRevision);
  if (response.status !== 401) {
    return response;
  }

  const newAccessToken = await getAccessTokenAfterUnauthorized(
    accessToken,
    baseUrl,
    requestRevision,
  );
  ensureSessionRevision(requestRevision);
  const retryResponse = await fetch(url, {
    headers: { Authorization: `Bearer ${newAccessToken}` },
  });
  ensureSessionRevision(requestRevision);
  if (retryResponse.status === 401) {
    await clearSession(requestRevision);
  }
  return retryResponse;
}

export async function getBackendHealth(
  baseUrl = process.env.EXPO_PUBLIC_COURSE_BACKEND_URL ?? getEnvBackendUrl(),
): Promise<BackendHealth> {
  sanitizeLog('Verificando estado del backend', { endpoint: baseUrl });

  const response = await fetch(`${baseUrl}/health`);
  if (!response.ok) {
    throw new Error(`Backend health failed with ${response.status}`);
  }
  const payload: unknown = await response.json();
  if (
    typeof payload !== 'object' ||
    payload === null ||
    !('ok' in payload) ||
    payload.ok !== true ||
    !('contractVersion' in payload) ||
    payload.contractVersion !== 1
  ) {
    throw new Error('Backend health contract mismatch');
  }
  return payload as BackendHealth;
}