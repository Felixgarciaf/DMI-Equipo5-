import { spawnSync } from 'node:child_process';
import { planRetry } from '../../src/course-evaluation';
import { postAuthenticated, requestBackend } from '../../src/api/courseBackend';
import { secureStorageService } from '../../src/security/secureStorage';

afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

test.each([undefined, '', '   ', 'short'])('POST without a usable stable key %s is blocked before any HTTP send', async (idempotencyKey) => {
  expect(planRetry({ method: 'POST', status: 503, attempt: 1,
    ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
  })).toEqual({ retry: false, delayMs: 0, requiresStableIdempotencyKey: true });
  const fetchMock = jest.spyOn(globalThis, 'fetch');
  await expect(requestBackend('/v1/incidents', { method: 'POST',
    ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
  })).rejects.toMatchObject({ kind: 'idempotency' });
  expect(fetchMock).not.toHaveBeenCalled();
});

test('all retries keep the original key and serialized content even if the caller mutates its object', async () => {
  jest.useFakeTimers();
  const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  const body = { action: 'resolve', baseVersion: 3, diagnosis: 'synthetic-private-note' };
  const received: { key: string | null; body: BodyInit | null | undefined }[] = [];
  const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
    received.push({ key: new Headers(init?.headers).get('Idempotency-Key'), body: init?.body });
    body.diagnosis = 'changed-by-caller';
    return new Response('{}', { status: received.length < 3 ? 503 : 201 });
  });
  const result = requestBackend('/v1/incidents/campus-inc-001/actions', {
    method: 'POST', idempotencyKey: 'stable-operation-001', body,
    headers: { Authorization: 'Bearer synthetic-private-token', 'X-Course-Actor': 'technician-1' },
  });
  await jest.runAllTimersAsync();
  expect((await result).status).toBe(201);
  expect(fetchMock).toHaveBeenCalledTimes(3);
  expect(received.every((item) => item.key === 'stable-operation-001')).toBe(true);
  expect(new Set(received.map((item) => item.body)).size).toBe(1);
  expect(String(received[0]!.body)).toContain('synthetic-private-note');
  const logged = JSON.stringify(log.mock.calls);
  for (const value of ['synthetic-private-note', 'synthetic-private-token', 'technician-1', 'stable-operation-001']) {
    expect(logged).not.toContain(value);
  }
});

test('POST keeps content and identity across shared refresh, then a transient retry', async () => {
  jest.useFakeTimers();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(secureStorageService, 'getSensitiveData').mockImplementation(async (key) => key === 'refreshToken' ? 'synthetic-refresh' : 'synthetic-old');
  jest.spyOn(secureStorageService, 'saveSensitiveData').mockResolvedValue();
  const received: { key: string | null; body: BodyInit | null | undefined }[] = [];
  const body = { action: 'close', baseVersion: 4 };
  jest.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    if (String(url).endsWith('/v1/session/refresh')) {
      body.baseVersion = 100;
      return new Response(JSON.stringify({ accessToken: 'synthetic-new' }));
    }
    received.push({ key: new Headers(init?.headers).get('Idempotency-Key'), body: init?.body });
    return new Response('{}', { status: [401, 503, 200][received.length - 1]! });
  });
  const result = postAuthenticated('/v1/incidents/campus-inc-001/actions', body, 'stable-close-001');
  await jest.runAllTimersAsync();
  expect((await result).status).toBe(200);
  expect(received).toHaveLength(3);
  expect(received.every((item) => item.key === 'stable-close-001' && item.body === JSON.stringify({ action: 'close', baseVersion: 4 }))).toBe(true);
});

// Compile the actual client in a separate Node process to use native HTTP against
// the teaching server; only device SecureStore is replaced with a synthetic adapter.
const liveClient = String.raw`
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const Module = require('node:module');
const { spawn } = require('node:child_process');
const values = new Map();
const originalLoad = Module._load;
Module._load = function(name, ...args) {
  if (name === 'expo-secure-store') return {
    getItemAsync: async (key) => values.get(key) ?? null,
    setItemAsync: async (key, value) => { values.set(key, value); },
    deleteItemAsync: async (key) => { values.delete(key); },
  };
  return originalLoad.call(this, name, ...args);
};
require.extensions['.ts'] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
};
const { requestBackend, postAuthenticated } = require('./src/api/courseBackend.ts');
const metrics = [];
console.log = (_message, data) => metrics.push({ ...data, observedAtMs: Date.now() });
const server = spawn(process.execPath, ['course-backend/server.mjs'], {
  env: { ...process.env, COURSE_BACKEND_PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'],
});
async function run() {
  try {
    const baseUrl = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Backend startup timeout')), 5000);
      server.stdout.on('data', (chunk) => {
        const found = String(chunk).match(/http:[/][/][0-9.:]+/);
        if (found) { clearTimeout(timeout); resolve(found[0]); }
      });
      server.once('error', reject);
      server.once('exit', () => reject(new Error('Backend exited before startup')));
    });
    const { accessTokenFor } = await import('./course-backend/auth-fixture.mjs');
    const path = '/v1/incidents/campus-inc-001/actions';
    async function direct(actor, body, key) {
      const response = await fetch(baseUrl + path, {
        method: 'POST', headers: { Authorization: 'Bearer ' + accessTokenFor(actor),
          'X-Course-Actor': actor, 'Content-Type': 'application/json', 'Idempotency-Key': key },
        body: JSON.stringify(body),
      });
      assert.equal(response.status, 201);
    }
    await direct('technician-1', { action: 'start', baseVersion: 1 }, 'live-start-001');
    await direct('technician-1', { action: 'resolve', baseVersion: 2, diagnosis: 'Synthetic repair' }, 'live-resolve-001');
    values.set('accessToken', accessTokenFor('coordinator-1'));
    const options = { timeoutMs: 100, headers: { 'X-Course-Actor': 'coordinator-1', 'X-Course-Scenario': 'timeout_after_commit' } };
    const closeResponse = await postAuthenticated(path, { action: 'close', baseVersion: 3 }, 'live-close-lost-001', baseUrl, options);
    assert.equal(closeResponse.status, 200);
    const close = await closeResponse.json();
    assert.equal(close.duplicate, true);
    assert.equal(close.incident.version, 4);
    assert.equal(close.incident.status, 'closed');
    const closeEvents = close.incident.payload.history.filter((item) => item.action === 'close').length;
    assert.equal(closeEvents, 1);
    const conflict = await postAuthenticated(path, { action: 'reopen', baseVersion: 4 }, 'live-close-lost-001', baseUrl, options);
    assert.equal(conflict.status, 409);
    const conflictBody = await conflict.json();
    assert.equal(conflictBody.code, 'idempotency_key_reused');
    values.set('accessToken', accessTokenFor('reporter-1'));
    const evidenceResponse = await postAuthenticated(path,
      { action: 'add_evidence', baseVersion: 4, evidenceId: 'synthetic-photo-09' }, 'live-evidence-lost-001', baseUrl,
      { ...options, headers: { ...options.headers, 'X-Course-Actor': 'reporter-1' } });
    const evidence = await evidenceResponse.json();
    assert.equal(evidenceResponse.status, 200);
    assert.equal(evidence.incident.version, 5);
    assert.equal(evidence.incident.payload.evidence.length, 1);
    assert.equal(evidence.incident.payload.history.filter((item) => item.action === 'add_evidence').length, 1);
    const legacyOptions = { method: 'POST', idempotencyKey: 'live-legacy-lost-001', timeoutMs: 100,
      body: { resourceId: 'resource-1', nested: { a: 1, b: 2 } }, headers: { 'X-Course-Scenario': 'timeout_after_commit' } };
    const legacy = await requestBackend('/v1/resources/action', legacyOptions, baseUrl);
    assert.equal(legacy.status, 200);
    assert.equal((await legacy.json()).duplicate, true);
    const changed = await requestBackend('/v1/resources/action', { ...legacyOptions, body: { resourceId: 'resource-2' } }, baseUrl);
    assert.equal(changed.status, 409);
    const reordered = await requestBackend('/v1/resources/action', {
      ...legacyOptions, body: { nested: { b: 2, a: 1 }, resourceId: 'resource-1' },
    }, baseUrl);
    assert.equal(reordered.status, 200);
    const concurrent = await Promise.all([1, 2, 3].map(() => requestBackend('/v1/resources/action', {
      method: 'POST', idempotencyKey: 'live-concurrent-001', body: { resourceId: 'resource-concurrent' },
    }, baseUrl)));
    assert.deepEqual(concurrent.map((r) => r.status).sort(), [200, 200, 201]);
    assert.equal(metrics.filter((m) => m.status === 'timeout').length, 3);
    const observedWaitsMs = metrics.flatMap((item, index) => item.attempt === 2 && metrics[index - 1].status === 'timeout'
      ? [item.observedAtMs - metrics[index - 1].observedAtMs - item.durationMs] : []);
    assert.equal(observedWaitsMs.length, 3);
    assert.ok(observedWaitsMs.every((wait) => wait >= 240));
    process.stdout.write(JSON.stringify({ closeEvents, evidenceCount: evidence.incident.payload.evidence.length,
      finalVersion: evidence.incident.version, changedKeyStatus: changed.status,
      concurrentStatuses: concurrent.map((r) => r.status).sort(), observedWaitsMs, metrics }));
  } finally { server.kill(); }
}
run().catch((error) => { process.stderr.write(error.stack); process.exitCode = 1; });
`;

test('real HTTP: lost closure/evidence responses and concurrent replay never duplicate the effect', () => {
  const child = spawnSync(process.execPath, ['-e', liveClient], {
    cwd: process.cwd(), encoding: 'utf8', timeout: 25_000,
  });
  expect(child.stderr).toBe('');
  expect(child.status).toBe(0);
  const observed = JSON.parse(child.stdout);
  expect(observed).toMatchObject({ closeEvents: 1, evidenceCount: 1, finalVersion: 5, changedKeyStatus: 409, concurrentStatuses: [200, 200, 201] });
  expect(observed.metrics.filter((item: { status: unknown }) => item.status === 'timeout')).toHaveLength(3);
  console.log('WEEK09_REAL_HTTP', JSON.stringify(observed));
}, 30_000);
