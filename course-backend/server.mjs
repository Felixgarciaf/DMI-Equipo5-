import { createServer } from 'node:http';
import { Buffer } from 'node:buffer';
import { handleCampusOps } from './campusops.mjs';

const host = process.env.COURSE_BACKEND_HOST ?? '127.0.0.1';
const port = Number(process.env.COURSE_BACKEND_PORT ?? 4310);
const completedOperations = new Map();
const canonical = (value) => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map((key) => [key, item[key]])) : item);

function send(response, status, body, headers = {}) {
  const value = typeof body === 'string' ? body : JSON.stringify(body);
  response.writeHead(status, {
    'access-control-allow-origin': '*',
    'content-type': typeof body === 'string' ? 'application/json' : 'application/json; charset=utf-8',
    ...headers,
  });
  response.end(value);
}

async function readJson(request) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > 131072) throw new Error('request too large for teaching fixture');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? `${host}:${port}`}`);
  const scenario = request.headers['x-course-scenario'] ?? 'success';

  if (request.method === 'OPTIONS') return send(response, 204, '');
  if (request.method === 'GET' && url.pathname === '/health') {
    return send(response, 200, { ok: true, service: 'dmi-controlled-backend', contractVersion: 1 });
  }
  if (url.pathname.startsWith('/v1/incidents') || url.pathname === '/v1/geocoding' || url.pathname === '/v1/session/login') {
    try {
      return await handleCampusOps(request, response, url, { send, readJson, scenario });
    } catch {
      return send(response, 400, { code: 'invalid_request' });
    }
  }
  if (request.method === 'GET' && url.pathname === '/v1/resources') {
    if (request.headers.authorization !== 'Bearer course-valid-token') {
      return send(response, 401, { code: 'unauthorized' });
    }
    if (scenario === 'server_error') return send(response, 500, { code: 'controlled_failure' });
    if (scenario === 'rate_limited') return send(response, 429, { code: 'rate_limited' }, { 'retry-after': '1' });
    if (scenario === 'malformed') return send(response, 200, '{"items": [}');
    if (scenario === 'slow') await new Promise((resolve) => setTimeout(resolve, 1200));
    const payload = scenario === 'nullable' ? null : { label: 'CampusOps: incidencia sintética', category: 'connectivity' };
    return send(response, 200, { items: [{ id: 'resource-1', version: 1, status: 'open', payload }] });
  }
  if (request.method === 'POST' && url.pathname === '/v1/session/refresh') {
    const input = await readJson(request).catch(() => null);
    if (!input || input.refreshToken !== 'course-refresh-0' || scenario === 'invalid_refresh') {
      return send(response, 401, { code: 'invalid_grant' });
    }
    return send(response, 200, { accessToken: 'course-valid-token', refreshToken: 'course-refresh-1', expiresIn: 60 });
  }
  if (request.method === 'POST' && url.pathname === '/v1/resources/action') {
    const key = request.headers['idempotency-key'];
    if (typeof key !== 'string' || key.trim().length < 8) return send(response, 400, { code: 'idempotency_key_required' });
    const input = await readJson(request).catch(() => null);
    if (!input || Array.isArray(input) || typeof input.resourceId !== 'string' || !input.resourceId.trim()) return send(response, 422, { code: 'invalid_contract' });
    const fingerprint = canonical(input);
    // Check after reading the body: concurrent requests cannot race across an await.
    const previous = completedOperations.get(key);
    if (previous) {
      if (previous.fingerprint !== fingerprint) return send(response, 409, { code: 'idempotency_key_reused' });
      return send(response, 200, { ...previous.result, duplicate: true });
    }
    const result = { operationId: key, resourceId: input.resourceId, version: 2, duplicate: false };
    completedOperations.set(key, { fingerprint, result });
    if (scenario === 'timeout_after_commit') return setTimeout(() => { if (!response.destroyed) send(response, 200, result); }, 1500);
    return send(response, 201, result);
  }
  return send(response, 404, { code: 'not_found' });
});

server.listen(port, host, () => {
  const address = server.address();
  const boundPort = typeof address === 'object' && address ? address.port : port;
  process.stdout.write(`DMI controlled backend listening at http://${host}:${boundPort}\n`);
});
