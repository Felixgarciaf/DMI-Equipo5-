import type { JsonObject, ParseResult } from '../../course-evaluation/contracts';

export type CloudClientError =
  | Readonly<{ kind: 'contract'; detail: string }>
  | Readonly<{ kind: 'timeout'; timeoutMs: number }>
  | Readonly<{ kind: 'slow_response'; timeoutMs: number; observedMs: number }>
  | Readonly<{ kind: 'http'; status: 500; detail: string }>
  | Readonly<{ kind: 'rate_limited'; status: 429; retryAfterMs: number }>;

export type RemoteResource = Readonly<{
  id: string;
  version: number;
  status: string;
  payload: JsonObject | null;
}>;

export type CloudClientResult =
  | Readonly<{ ok: true; resource: RemoteResource }>
  | Readonly<{ ok: false; error: CloudClientError }>;

export type StubbedBackendScenario =
  | 'success'
  | 'valid_null'
  | 'malformed'
  | 'timeout'
  | 'server_error'
  | 'rate_limited'
  | 'slow';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPayload(value: unknown): value is JsonObject | null {
  return value === null || isRecord(value);
}

export function parseRemoteResource(input: unknown): ParseResult {
  if (!isRecord(input)) {
    return { ok: false, error: 'contract' };
  }

  const { id, version, status, payload } = input;
  if (typeof id !== 'string' || id.trim().length === 0) {
    return { ok: false, error: 'contract' };
  }
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 0) {
    return { ok: false, error: 'contract' };
  }
  if (typeof status !== 'string' || status.trim().length === 0) {
    return { ok: false, error: 'contract' };
  }
  if (!('payload' in input) || !isPayload(payload)) {
    return { ok: false, error: 'contract' };
  }

  return {
    ok: true,
    value: {
      id,
      version,
      status,
      payload,
    },
  };
}

export function resourceResultFromUnknown(input: unknown): CloudClientResult {
  const parsed = parseRemoteResource(input);
  if (!parsed.ok) {
    return { ok: false, error: { kind: 'contract', detail: 'Remote resource envelope is invalid' } };
  }
  return { ok: true, resource: parsed.value };
}

export function evaluateStubbedIncidentResponse(scenario: StubbedBackendScenario): CloudClientResult {
  switch (scenario) {
    case 'success':
      return resourceResultFromUnknown({
        id: 'campus-inc-001',
        version: 2,
        status: 'assigned',
        payload: { category: 'connectivity', description: 'Falla ficticia' },
      });
    case 'valid_null':
      return resourceResultFromUnknown({
        id: 'campus-inc-002',
        version: 1,
        status: 'closed',
        payload: null,
        ignored: 'forward-compatible',
      });
    case 'malformed':
      return resourceResultFromUnknown({
        id: '',
        version: '3',
        status: 'open',
        payload: null,
      });
    case 'timeout':
      return { ok: false, error: { kind: 'timeout', timeoutMs: 1000 } };
    case 'server_error':
      return { ok: false, error: { kind: 'http', status: 500, detail: 'server_error' } };
    case 'rate_limited':
      return { ok: false, error: { kind: 'rate_limited', status: 429, retryAfterMs: 30000 } };
    case 'slow':
      return { ok: false, error: { kind: 'slow_response', timeoutMs: 1000, observedMs: 2500 } };
  }
}
