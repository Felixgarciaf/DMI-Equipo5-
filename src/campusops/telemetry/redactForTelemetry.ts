const REDACTED_VALUE = '[REDACTED]';

const SENSITIVE_TELEMETRY_KEYS = new Set([
  'authorization',
  'password',
  'token',
  'accesstoken',
  'refreshtoken',
  'email',
  'displayname',
  'name',
  'userid',
  'reporterid',
  'technicianid',
  'assignedtechnicianid',
  'location',
  'latitude',
  'longitude',
  'photos',
  'evidence',
  'internalcomments',
  'assignmenthistory',
]);

function normalizeTelemetryKey(key: string): string {
  return key.replace(/[-_]/g, '').toLowerCase();
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function redactForTelemetry(input: unknown): unknown {
  if (Array.isArray(input)) {
    return input.map((item) => redactForTelemetry(item));
  }

  if (!isPlainRecord(input)) {
    return input;
  }

  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => [
      key,
      SENSITIVE_TELEMETRY_KEYS.has(normalizeTelemetryKey(key)) ? REDACTED_VALUE : redactForTelemetry(value),
    ]),
  );
}

export function createTelemetryRecord(
  event: string,
  payload: Readonly<Record<string, unknown>>,
): Readonly<{ event: string; payload: unknown }> {
  return {
    event,
    payload: redactForTelemetry(payload),
  };
}

