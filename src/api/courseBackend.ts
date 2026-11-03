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

export type RetryInput = Readonly<{
  method: 'GET' | 'POST';
  status: number | 'timeout';
  attempt: number;
  retryAfterMs?: number;
  idempotencyKey?: string;
}>;

export type RetrySettings = Readonly<{
  maxAttempts?: number;
  baseDelayMs?: number;
  maxBackoffMs?: number;
}>;

const MAX_TIMER_MS = 2_147_483_647;

function retrySettings(settings: RetrySettings = {}) {
  const maxAttempts = settings.maxAttempts ?? 4;
  const baseDelayMs = settings.baseDelayMs ?? 250;
  const maxBackoffMs = settings.maxBackoffMs ?? 4000;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 4 ||
      !Number.isFinite(baseDelayMs) || baseDelayMs <= 0 ||
      !Number.isFinite(maxBackoffMs) || maxBackoffMs < baseDelayMs || maxBackoffMs > MAX_TIMER_MS) {
    throw new RangeError('Invalid bounded retry settings');
  }
  return { maxAttempts, baseDelayMs, maxBackoffMs };
}

function stableKey(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length >= 8;
}

/** Shared by real HTTP requests and the evaluation adapter. Attempt 1 is the first send. */
export function planBackendRetry(input: RetryInput, settings: RetrySettings = {}) {
  const config = retrySettings(settings);
  const requiresStableIdempotencyKey = input.method === 'POST' && !stableKey(input.idempotencyKey);
  const stop = { retry: false, delayMs: 0, requiresStableIdempotencyKey };
  if (requiresStableIdempotencyKey || !Number.isInteger(input.attempt) ||
      input.attempt < 1 || input.attempt >= config.maxAttempts ||
      !(input.status === 'timeout' || [408, 429, 500, 502, 503, 504].includes(input.status))) return stop;
  const backoff = Math.min(config.maxBackoffMs, config.baseDelayMs * 2 ** (input.attempt - 1));
  const retryAfter = input.retryAfterMs;
  const delayMs = Math.ceil(typeof retryAfter === 'number' && Number.isFinite(retryAfter) && retryAfter >= 0
    ? Math.max(backoff, retryAfter) : backoff);
  // Never shorten a valid provider wait to fit a JS timer (which could wrap to 1ms).
  if (!Number.isFinite(delayMs) || delayMs > MAX_TIMER_MS) return stop;
  return { retry: true, delayMs, requiresStableIdempotencyKey: false };
}

export function parseRetryAfter(value: string | null, now = Date.now()): number | undefined {
  if (value === null || !value.trim()) return undefined;
  const header = value.trim();
  if (/^\d+$/.test(header)) {
    const ms = Number(header) * 1000;
    return Number.isFinite(ms) ? ms : undefined;
  }
  // An HTTP date, not a loosely parsed numeric string such as '-1' or '1.5'.
  if (!/^[A-Za-z]{3}, /.test(header)) return undefined;
  const date = Date.parse(header);
  return Number.isFinite(date) && Number.isFinite(now) ? Math.max(0, date - now) : undefined;
}

export type BackendRequestOptions = Readonly<{
  method?: 'GET' | 'POST';
  headers?: Readonly<Record<string, string>>;
  body?: unknown;
  idempotencyKey?: string;
  timeoutMs?: number;
  retry?: RetrySettings;
}>;

export class BackendRequestError extends Error {
  constructor(readonly kind: 'timeout' | 'network' | 'idempotency', message: string) {
    super(message);
    this.name = 'BackendRequestError';
  }
}

async function timedFetch(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new BackendRequestError('timeout', 'Backend request timed out'));
      controller.abort();
    }, timeoutMs);
  });
  try {
    return await Promise.race([fetch(url, { ...init, signal: controller.signal }), timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function performBackendRequest(
  path: string,
  options: BackendRequestOptions,
  baseUrl: string,
  budget = { attempts: 0 },
  ensureActive: () => void = () => undefined,
): Promise<Response> {
  if (!path.startsWith('/') || path.startsWith('//')) throw new Error('Backend path must start with a single "/"');
  const config = retrySettings(options.retry);
  const timeoutMs = options.timeoutMs ?? 3000;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > MAX_TIMER_MS) throw new RangeError('Invalid backend timeout');
  const method = options.method ?? 'GET';
  const headers = new Headers(options.headers);
  const key = options.idempotencyKey ?? headers.get('Idempotency-Key') ?? undefined;
  if (method === 'POST' && !stableKey(key)) {
    throw new BackendRequestError('idempotency', 'POST requires a stable Idempotency-Key of at least 8 characters');
  }
  if (key !== undefined) headers.set('Idempotency-Key', key);
  const body = options.body === undefined ? undefined : JSON.stringify(options.body);
  if (body !== undefined) headers.set('Content-Type', 'application/json');
  for (;;) {
    ensureActive();
    budget.attempts += 1;
    const started = Date.now();
    let response: Response | undefined;
    let failure: BackendRequestError | undefined;
    try {
      response = await timedFetch(`${baseUrl}${path}`, {
        method, headers, ...(body === undefined ? {} : { body }),
      }, timeoutMs);
    } catch (error: unknown) {
      if (error instanceof BackendRequestError) failure = error;
      else if (error instanceof TypeError) failure = new BackendRequestError('network', 'Backend network request failed');
      else throw error;
    }
    ensureActive();
    const status = response?.status ?? 'timeout';
    const retryAfterMs = parseRetryAfter(response?.headers.get('Retry-After') ?? null);
    const plan = planBackendRetry({
      method, status, attempt: budget.attempts,
      ...(key === undefined ? {} : { idempotencyKey: key }),
      ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
    }, config);
    sanitizeLog('Intento de solicitud al backend', {
      attempt: budget.attempts, status: failure?.kind ?? status,
      durationMs: Math.max(0, Date.now() - started), delayMs: plan.delayMs,
    });
    if (!plan.retry) {
      if (failure) throw failure;
      return response!;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, plan.delayMs));
  }
}

export function requestBackend(
  path: string,
  options: BackendRequestOptions = {},
  baseUrl = getEnvBackendUrl(),
): Promise<Response> {
  return performBackendRequest(path, options, baseUrl);
}

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
 * Performs an authenticated request, sharing a single token refresh across concurrent 401 responses.
 */
async function requestAuthenticated(
  path: string,
  options: BackendRequestOptions,
  baseUrl: string,
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

  const budget = { attempts: 0 };
  // Snapshot the payload once, including across a 401/token refresh boundary.
  const prepared = { ...options, headers: { ...options.headers },
    ...(options.body === undefined ? {} : { body: JSON.parse(JSON.stringify(options.body)) as unknown }) };
  const send = (token: string) => performBackendRequest(path, {
    ...prepared, headers: { ...prepared.headers, Authorization: `Bearer ${token}` },
  }, baseUrl, budget, () => ensureSessionRevision(requestRevision));
  const response = await send(accessToken);
  ensureSessionRevision(requestRevision);
  if (response.status !== 401) {
    return response;
  }
  if (budget.attempts >= retrySettings(options.retry).maxAttempts) return response;

  const newAccessToken = await getAccessTokenAfterUnauthorized(
    accessToken,
    baseUrl,
    requestRevision,
  );
  ensureSessionRevision(requestRevision);
  const retryResponse = await send(newAccessToken);
  ensureSessionRevision(requestRevision);
  if (retryResponse.status === 401) {
    await clearSession(requestRevision);
  }
  return retryResponse;
}

export function getAuthenticated(path: string, baseUrl = getEnvBackendUrl()): Promise<Response> {
  return requestAuthenticated(path, { method: 'GET' }, baseUrl);
}

/** Use the persisted queue's operationId, never generate a retry key. */
export function postAuthenticated(
  path: string,
  body: unknown,
  operationId: string,
  baseUrl = getEnvBackendUrl(),
  options: Omit<BackendRequestOptions, 'method' | 'body' | 'idempotencyKey'> = {},
): Promise<Response> {
  return requestAuthenticated(path, { ...options, method: 'POST', body, idempotencyKey: operationId }, baseUrl);
}

export async function getBackendHealth(
  baseUrl = process.env.EXPO_PUBLIC_COURSE_BACKEND_URL ?? getEnvBackendUrl(),
): Promise<BackendHealth> {
  sanitizeLog('Verificando estado del backend', { endpoint: baseUrl });

  const response = await requestBackend('/health', {}, baseUrl);
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
