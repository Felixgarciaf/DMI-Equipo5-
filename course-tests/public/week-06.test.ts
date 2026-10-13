import {
  getAuthenticated,
  getSessionStatus,
  subscribeToSessionStatus,
} from '../../src/api/courseBackend';
import { coordinateRefresh } from '../../src/course-evaluation';
import { logoutSession } from '../../src/security/logout';
import { secureStorageService } from '../../src/security/secureStorage';

const mockSecureStore = new Map<string, string>();

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockSecureStore.set(key, value);
  }),
  getItemAsync: jest.fn(async (key: string) => mockSecureStore.get(key) ?? null),
  deleteItemAsync: jest.fn(async (key: string) => {
    mockSecureStore.delete(key);
  }),
}));

beforeEach(() => {
  mockSecureStore.clear();
  jest.restoreAllMocks();
});

afterEach(() => {
  jest.useRealTimers();
});

test('coalesces concurrent 401s into one refresh and retries each request once', () => {
  const summary = coordinateRefresh([
    { type: 'request401', requestId: 'a', generation: 0 },
    { type: 'request401', requestId: 'b', generation: 0 },
    { type: 'request401', requestId: 'c', generation: 0 },
    { type: 'refreshSucceeded', generation: 1, token: 'course-token-1' },
  ]);
  expect(summary).toEqual({
    status: 'authenticated',
    activeGeneration: 1,
    refreshCalls: 1,
    retriedRequestIds: ['a', 'b', 'c'],
    persistedToken: 'course-token-1',
  });
});

test('three concurrent 401s share one refresh and retry with the saved token', async () => {
  mockSecureStore.set('accessToken', 'course-expired-token');
  mockSecureStore.set('refreshToken', 'course-refresh-0');

  const events: string[] = [];
  let initial401Count = 0;
  let refreshCount = 0;
  let retryCount = 0;
  let releaseRefresh: () => void = () => undefined;
  let signalAll401s: () => void = () => undefined;
  const refreshGate = new Promise<void>((resolve) => {
    releaseRefresh = resolve;
  });
  const all401sReceived = new Promise<void>((resolve) => {
    signalAll401s = resolve;
  });

  jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname === '/v1/session/refresh') {
      refreshCount += 1;
      events.push('REFRESH START');
      await refreshGate;
      events.push('REFRESH SUCCESS');
      return new Response(
        JSON.stringify({ accessToken: 'course-valid-token' }),
        { status: 200 },
      );
    }

    const requestId = url.searchParams.get('request') ?? 'unknown';
    const authorization = new Headers(init?.headers).get('Authorization');
    if (authorization === 'Bearer course-expired-token') {
      initial401Count += 1;
      events.push(`401 ${requestId}`);
      if (initial401Count === 3) signalAll401s();
      return new Response(JSON.stringify({ code: 'unauthorized' }), { status: 401 });
    }
    if (authorization === 'Bearer course-valid-token') {
      retryCount += 1;
      events.push(`RETRY ${requestId}`);
      return new Response(JSON.stringify({ id: requestId }), { status: 200 });
    }

    throw new Error('Unexpected Authorization header');
  });

  const requestIds = ['A', 'B', 'C'];
  const requests = requestIds.map((requestId) => {
    events.push(`REQUEST ${requestId}`);
    return getAuthenticated(
      `/v1/resources?request=${requestId}`,
      'http://backend.test',
    );
  });

  await all401sReceived;
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(initial401Count).toBe(3);
  expect(refreshCount).toBe(1);

  releaseRefresh();
  const responses = await Promise.all(requests);

  expect(responses.map(({ status }) => status)).toEqual([200, 200, 200]);
  expect(retryCount).toBe(3);
  expect(refreshCount).toBe(1);
  expect(getSessionStatus()).toBe('authenticated');
  expect(await secureStorageService.getSensitiveData('accessToken')).toBe(
    'course-valid-token',
  );
  expect(requestIds.every((id) => events.includes(`REQUEST ${id}`))).toBe(true);
  expect(requestIds.every((id) => events.includes(`RETRY ${id}`))).toBe(true);
  expect(events.filter((event) => event.startsWith('401 '))).toHaveLength(3);
  expect(events.filter((event) => event === 'REFRESH START')).toHaveLength(1);
  expect(events.filter((event) => event === 'REFRESH SUCCESS')).toHaveLength(1);
  console.log([
    '',
    '=== SEMANA 6 / REFRESH EXITOSO (transporte simulado en Jest) ===',
    ...events.map((event) =>
      event.startsWith('RETRY ') ? `${event} → 200` : event,
    ),
    'TOKEN NUEVO: valor guardado en almacenamiento seguro simulado (omitido del log)',
    `RESUMEN VERIFICADO: solicitudes=${requestIds.length}, 401=${initial401Count}, refresh=${refreshCount}, retries=${retryCount}, respuestas200=${responses.filter(({ status }) => status === 200).length}`,
    '=== FIN REFRESH EXITOSO ===',
    '',
  ].join('\n'));
});

test('a failed shared refresh clears credentials and requires login without retrying again', async () => {
  mockSecureStore.set('accessToken', 'course-expired-token');
  mockSecureStore.set('refreshToken', 'invalid-refresh-token');

  let initial401Count = 0;
  let refreshCount = 0;
  let retryCount = 0;
  let releaseRefresh: () => void = () => undefined;
  let signalAll401s: () => void = () => undefined;
  const refreshGate = new Promise<void>((resolve) => {
    releaseRefresh = resolve;
  });
  const all401sReceived = new Promise<void>((resolve) => {
    signalAll401s = resolve;
  });

  const statusChanges: string[] = [];
  const unsubscribe = subscribeToSessionStatus((status) => {
    statusChanges.push(status);
  });

  jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname === '/v1/session/refresh') {
      refreshCount += 1;
      await refreshGate;
      return new Response(JSON.stringify({ code: 'invalid_grant' }), {
        status: 401,
      });
    }

    const authorization = new Headers(init?.headers).get('Authorization');
    if (authorization === 'Bearer course-expired-token') {
      initial401Count += 1;
      if (initial401Count === 3) signalAll401s();
      return new Response(JSON.stringify({ code: 'unauthorized' }), {
        status: 401,
      });
    }

    retryCount += 1;
    throw new Error(`Unexpected retry authorization: ${authorization}`);
  });

  const requests = ['A', 'B', 'C'].map((requestId) =>
    getAuthenticated(
      `/v1/resources?request=${requestId}`,
      'http://backend.test',
    ),
  );

  await all401sReceived;
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(initial401Count).toBe(3);
  expect(refreshCount).toBe(1);

  releaseRefresh();
  const results = await Promise.allSettled(requests);

  expect(results.every((result) => result.status === 'rejected')).toBe(true);
  expect(refreshCount).toBe(1);
  expect(retryCount).toBe(0);
  expect(await secureStorageService.getSensitiveData('accessToken')).toBeNull();
  expect(await secureStorageService.getSensitiveData('refreshToken')).toBeNull();
  expect(getSessionStatus()).toBe('anonymous');
  expect(statusChanges).toContain('anonymous');
  console.log([
    '',
    '=== SEMANA 6 / REFRESH FALLIDO (transporte simulado en Jest) ===',
    'REQUEST A → 401',
    'REQUEST B → 401',
    'REQUEST C → 401',
    `REFRESH → ERROR / invalid_grant (refreshCount=${refreshCount})`,
    'accessToken → eliminado (SecureStore devuelve null)',
    'refreshToken → eliminado (SecureStore devuelve null)',
    `sesión → ${getSessionStatus()}`,
    `Login requerido → preparado por estado anonymous; retries=${retryCount}; segundo refresh=no`,
    '=== FIN REFRESH FALLIDO ===',
    '',
  ].join('\n'));
  unsubscribe();
});

test('a 401 from the single retry does not start another refresh', async () => {
  mockSecureStore.set('accessToken', 'course-expired-token');
  mockSecureStore.set('refreshToken', 'course-refresh-0');

  let requestCount = 0;
  let refreshCount = 0;
  jest.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = new URL(String(input));
    if (url.pathname === '/v1/session/refresh') {
      refreshCount += 1;
      return new Response(
        JSON.stringify({ accessToken: 'course-valid-token' }),
        { status: 200 },
      );
    }

    requestCount += 1;
    return new Response(JSON.stringify({ code: 'unauthorized' }), {
      status: 401,
    });
  });

  const response = await getAuthenticated(
    '/v1/resources',
    'http://backend.test',
  );

  expect(response.status).toBe(401);
  expect(requestCount).toBe(2);
  expect(refreshCount).toBe(1);
  expect(await secureStorageService.getSensitiveData('accessToken')).toBeNull();
  expect(await secureStorageService.getSensitiveData('refreshToken')).toBeNull();
  expect(getSessionStatus()).toBe('anonymous');
});

test('renews at the exact expiry time using a controlled clock', async () => {
  jest.useFakeTimers().setSystemTime(new Date('2026-10-12T12:00:00.000Z'));
  const expiresAt = Date.now() + 60_000;
  mockSecureStore.set('accessToken', 'course-expiring-token');
  mockSecureStore.set('refreshToken', 'course-refresh-0');

  let refreshCount = 0;
  let refreshSucceeded = false;
  jest.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = new URL(String(input));
    if (url.pathname === '/v1/session/refresh') {
      refreshCount += 1;
      refreshSucceeded = true;
      return new Response(
        JSON.stringify({ accessToken: 'course-renewed-token', expiresIn: 60 }),
        { status: 200 },
      );
    }

    if (!refreshSucceeded && Date.now() >= expiresAt) {
      return new Response(JSON.stringify({ code: 'expired' }), { status: 401 });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  });

  const beforeExpiry = await getAuthenticated(
    '/v1/resources',
    'http://backend.test',
  );
  expect(beforeExpiry.status).toBe(200);
  expect(refreshCount).toBe(0);
  expect(getSessionStatus()).toBe('authenticated');

  jest.setSystemTime(expiresAt);
  const atExpiry = await getAuthenticated('/v1/resources', 'http://backend.test');

  expect(atExpiry.status).toBe(200);
  expect(refreshCount).toBe(1);
  expect(getSessionStatus()).toBe('authenticated');
  expect(await secureStorageService.getSensitiveData('accessToken')).toBe(
    'course-renewed-token',
  );
});

test('a failed refresh at expiry clears the persisted session', async () => {
  jest.useFakeTimers().setSystemTime(new Date('2026-10-12T12:00:00.000Z'));
  const expiresAt = Date.now() + 1_000;
  mockSecureStore.set('accessToken', 'course-expiring-token');
  mockSecureStore.set('refreshToken', 'course-refresh-0');

  let refreshCount = 0;
  jest.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = new URL(String(input));
    if (url.pathname === '/v1/session/refresh') {
      refreshCount += 1;
      return new Response(JSON.stringify({ code: 'invalid_grant' }), {
        status: 401,
      });
    }
    if (Date.now() >= expiresAt) {
      return new Response(JSON.stringify({ code: 'expired' }), { status: 401 });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  });

  jest.setSystemTime(expiresAt);
  await expect(
    getAuthenticated('/v1/resources', 'http://backend.test'),
  ).rejects.toThrow('Token refresh failed with 401');

  expect(refreshCount).toBe(1);
  expect(await secureStorageService.getSensitiveData('accessToken')).toBeNull();
  expect(await secureStorageService.getSensitiveData('refreshToken')).toBeNull();
  expect(getSessionStatus()).toBe('anonymous');
});

test('logout while refresh is pending rejects its late result without retrying', async () => {
  mockSecureStore.set('accessToken', 'course-expired-token');
  mockSecureStore.set('refreshToken', 'course-refresh-0');

  let releaseRefresh: (response: Response) => void = () => undefined;
  let signalRefreshStarted: () => void = () => undefined;
  let requestCount = 0;
  let retryCount = 0;
  const refreshStarted = new Promise<void>((resolve) => {
    signalRefreshStarted = resolve;
  });
  const refreshResult = new Promise<Response>((resolve) => {
    releaseRefresh = resolve;
  });

  jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname === '/v1/session/refresh') {
      signalRefreshStarted();
      return refreshResult;
    }
    requestCount += 1;
    if (requestCount > 1) {
      retryCount += 1;
    }
    return new Response(JSON.stringify({ code: 'expired' }), { status: 401 });
  });

  const request = getAuthenticated('/v1/resources', 'http://backend.test');
  await refreshStarted;
  await logoutSession();
  releaseRefresh(
    new Response(
      JSON.stringify({ accessToken: 'course-late-token', expiresIn: 60 }),
      { status: 200 },
    ),
  );

  await expect(request).rejects.toThrow('Session ended during token refresh');
  expect(requestCount).toBe(1);
  expect(retryCount).toBe(0);
  expect(await secureStorageService.getSensitiveData('accessToken')).toBeNull();
  expect(await secureStorageService.getSensitiveData('refreshToken')).toBeNull();
  expect(getSessionStatus()).toBe('anonymous');
});

test('logout removes persisted session state', () => {
  expect(coordinateRefresh([{ type: 'logout' }]).persistedToken).toBeNull();
});
