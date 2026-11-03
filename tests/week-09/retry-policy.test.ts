import { planRetry } from '../../src/course-evaluation';
import { getAuthenticated, parseRetryAfter, planBackendRetry, requestBackend } from '../../src/api/courseBackend';
import { secureStorageService } from '../../src/security/secureStorage';

beforeEach(() => {
  jest.useFakeTimers({ now: new Date('2026-10-30T12:00:00Z') });
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

test('policy uses progressive finite backoff and stops from attempt 4', () => {
  const plans = [1, 2, 3, 4, 5].map((attempt) => planRetry({ method: 'GET', status: 'timeout', attempt }));
  expect(plans.map((p) => p.delayMs)).toEqual([250, 500, 1000, 0, 0]);
  expect(plans.map((p) => p.retry)).toEqual([true, true, true, false, false]);
});

test.each([0, -1, NaN, Infinity, 1.5])('invalid attempt %s never retries', (attempt) => {
  expect(planRetry({ method: 'GET', status: 503, attempt }).retry).toBe(false);
});

test.each([200, 400, 401, 403, 404, 409, 422, 501])('non-transient HTTP %s does not retry', (status) => {
  expect(planRetry({ method: 'GET', status, attempt: 1 }).retry).toBe(false);
});

test.each([408, 429, 500, 502, 503, 504, 'timeout'] as const)('transient %s can retry safely', (status) => {
  expect(planRetry({ method: 'GET', status, attempt: 1 }).retry).toBe(true);
});

test('Retry-After is a lower bound, while invalid values use finite backoff', () => {
  expect(planRetry({ method: 'GET', status: 429, attempt: 1, retryAfterMs: 800 }).delayMs).toBe(800);
  for (const retryAfterMs of [-1, NaN, Infinity]) {
    expect(planRetry({ method: 'GET', status: 429, attempt: 2, retryAfterMs }).delayMs).toBe(500);
  }
  expect(planRetry({ method: 'GET', status: 429, attempt: 1, retryAfterMs: 2 ** 31 }).retry).toBe(false);
});

test('parses Retry-After seconds and HTTP date without accepting malformed negative values', () => {
  expect(parseRetryAfter('2')).toBe(2000);
  expect(parseRetryAfter(new Date(Date.now() + 3000).toUTCString())).toBe(3000);
  expect(parseRetryAfter(new Date(Date.now() - 1000).toUTCString())).toBe(0);
  for (const value of [null, '', 'nonsense', '-1', '1.5', 'Infinity']) expect(parseRetryAfter(value)).toBeUndefined();
});

test('configurable limits cannot exceed the published four attempts or overflow timers', () => {
  expect(planBackendRetry({ method: 'GET', status: 500, attempt: 2 }, { maxAttempts: 2 }).retry).toBe(false);
  expect(planBackendRetry({ method: 'GET', status: 500, attempt: 3 }, { baseDelayMs: 100, maxBackoffMs: 300 }).delayMs).toBe(300);
  for (const settings of [{ maxAttempts: 5 }, { maxAttempts: 0 }, { baseDelayMs: -1 }, { maxBackoffMs: Infinity }]) {
    expect(() => planBackendRetry({ method: 'GET', status: 500, attempt: 1 }, settings)).toThrow(RangeError);
  }
});

test('real client waits progressively and makes at most four sends for repeated 503', async () => {
  const times: number[] = [];
  const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => {
    times.push(Date.now());
    return new Response('{}', { status: 503 });
  });
  const result = requestBackend('/v1/incidents');
  await jest.runAllTimersAsync();
  expect((await result).status).toBe(503);
  expect(fetchMock).toHaveBeenCalledTimes(4);
  expect(times.map((t) => t - times[0]!)).toEqual([0, 250, 750, 1750]);
  console.info('WEEK09_BACKOFF_MS', JSON.stringify(times.map((t) => t - times[0]!)));
  expect(jest.getTimerCount()).toBe(0);
});

test.each(['2', 'Fri, 30 Oct 2026 12:00:03 GMT'])('real client respects Retry-After %s', async (header) => {
  const fetchMock = jest.spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(new Response('{}', { status: 429, headers: { 'Retry-After': header } }))
    .mockResolvedValueOnce(new Response('{}', { status: 200 }));
  const result = requestBackend('/v1/geocoding?q=synthetic');
  const delay = header === '2' ? 2000 : 3000;
  await jest.advanceTimersByTimeAsync(delay - 1);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  await jest.advanceTimersByTimeAsync(1);
  expect((await result).status).toBe(200);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

test('hanging fetch is aborted four times and ends with a typed timeout', async () => {
  const signals: AbortSignal[] = [];
  const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => {
    signals.push(init!.signal!);
    return new Promise<Response>(() => undefined);
  });
  const result = requestBackend('/v1/incidents', { timeoutMs: 100 });
  const checked = expect(result).rejects.toMatchObject({ kind: 'timeout' });
  await jest.runAllTimersAsync();
  await checked;
  expect(fetchMock).toHaveBeenCalledTimes(4);
  expect(signals.every((signal) => signal.aborted)).toBe(true);
  expect(jest.getTimerCount()).toBe(0);
});

test('network failure stops at a configurable smaller budget and reports a typed error', async () => {
  const fetchMock = jest.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('synthetic disconnect'));
  const result = requestBackend('/v1/incidents', { retry: { maxAttempts: 2 } });
  const checked = expect(result).rejects.toMatchObject({ kind: 'network' });
  await jest.runAllTimersAsync();
  await checked;
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

test('a refreshed session shares the same resource attempt budget, not two sets of four', async () => {
  jest.spyOn(secureStorageService, 'getSensitiveData').mockImplementation(async (key) => key === 'refreshToken' ? 'synthetic-refresh' : 'synthetic-expired');
  jest.spyOn(secureStorageService, 'saveSensitiveData').mockResolvedValue();
  let calls = 0;
  let refreshes = 0;
  jest.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    if (String(url).endsWith('/v1/session/refresh')) {
      refreshes++;
      return new Response(JSON.stringify({ accessToken: 'synthetic-new' }));
    }
    calls++;
    return new Response('{}', { status: calls === 2 ? 401 : 503 });
  });
  const result = getAuthenticated('/v1/incidents');
  await jest.runAllTimersAsync();
  expect((await result).status).toBe(503);
  expect(calls).toBe(4);
  expect(refreshes).toBe(1);
});
