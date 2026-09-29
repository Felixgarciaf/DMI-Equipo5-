import { redactForTelemetry } from '../../src/course-evaluation';
import { createTelemetryRecord } from '../../src/campusops/telemetry/redactForTelemetry';

test('redacts flat sensitive fields while preserving technical context', () => {
  expect(
    redactForTelemetry({
      authorization: 'Bearer synthetic-token',
      password: 'course-password',
      incidentId: 'campus-inc-001',
      correlationId: 'corr-001',
      status: 'failed',
      attempt: 2,
      durationMs: 120,
    }),
  ).toEqual({
    authorization: '[REDACTED]',
    password: '[REDACTED]',
    incidentId: 'campus-inc-001',
    correlationId: 'corr-001',
    status: 'failed',
    attempt: 2,
    durationMs: 120,
  });
});

test('redacts nested objects using normalized sensitive keys', () => {
  expect(
    redactForTelemetry({
      incident: {
        reporter: {
          email: 'reporter@example.test',
          display_name: 'Persona ficticia',
          user_id: 'reporter-1',
        },
        assignment: {
          assignedTechnicianId: 'technician-1',
          assignment_history: [{ technicianId: 'technician-2' }],
        },
      },
      request: {
        headers: {
          access_token: 'access-token',
          refreshToken: 'refresh-token',
        },
      },
    }),
  ).toEqual({
    incident: {
      reporter: {
        email: '[REDACTED]',
        display_name: '[REDACTED]',
        user_id: '[REDACTED]',
      },
      assignment: {
        assignedTechnicianId: '[REDACTED]',
        assignment_history: '[REDACTED]',
      },
    },
    request: {
      headers: {
        access_token: '[REDACTED]',
        refreshToken: '[REDACTED]',
      },
    },
  });
});

test('redacts arrays when the array belongs to a sensitive field and recurses inside safe lists', () => {
  expect(
    redactForTelemetry({
      photos: ['synthetic-photo-1', 'synthetic-photo-2'],
      events: [
        { status: 'queued', reporterId: 'reporter-1' },
        { status: 'sent', evidence: ['synthetic-evidence-1'] },
      ],
    }),
  ).toEqual({
    photos: '[REDACTED]',
    events: [
      { status: 'queued', reporterId: '[REDACTED]' },
      { status: 'sent', evidence: '[REDACTED]' },
    ],
  });
});

test('does not mutate the original telemetry input', () => {
  const original = {
    profile: { email: 'person@example.test', displayName: 'Persona ficticia' },
    incidentId: 'campus-inc-001',
    photos: ['synthetic-photo-1'],
  };
  const before = JSON.stringify(original);

  const redacted = redactForTelemetry(original);

  expect(redacted).toEqual({
    profile: { email: '[REDACTED]', displayName: '[REDACTED]' },
    incidentId: 'campus-inc-001',
    photos: '[REDACTED]',
  });
  expect(JSON.stringify(original)).toBe(before);
});

test('telemetry records use the same real redaction flow as the course adapter', () => {
  expect(
    createTelemetryRecord('incident.error', {
      incidentId: 'campus-inc-001',
      internalComments: 'Comentario interno ficticio',
    }),
  ).toEqual({
    event: 'incident.error',
    payload: {
      incidentId: 'campus-inc-001',
      internalComments: '[REDACTED]',
    },
  });
});

