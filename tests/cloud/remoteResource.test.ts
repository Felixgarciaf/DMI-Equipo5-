import {
  evaluateStubbedIncidentResponse,
  parseRemoteResource,
  resourceResultFromUnknown,
} from '../../src/campusops/cloud/remoteResource';
import { parseRemoteResource as parseRemoteResourceForCourse } from '../../src/course-evaluation';

test.each([
  [
    'valid payload object',
    { id: 'campus-inc-001', version: 2, status: 'assigned', payload: { category: 'connectivity' } },
    true,
  ],
  ['valid null payload', { id: 'r-2', version: 3, status: 'closed', payload: null, ignored: 'future' }, true],
  ['empty id', { id: '', version: 1, status: 'open', payload: null }, false],
  ['version string', { id: 'r-3', version: '3', status: 'open', payload: null }, false],
  ['null response', null, false],
  ['malformed missing status', { id: 'r-4', version: 1, payload: null }, false],
])('validates remote resource envelope: %s', (_label, input, expected) => {
  expect(parseRemoteResource(input).ok).toBe(expected);
  expect(parseRemoteResourceForCourse(input).ok).toBe(expected);
});

test('valid null payload is accepted without inventing application data', () => {
  const result = resourceResultFromUnknown({
    id: 'campus-inc-null',
    version: 1,
    status: 'closed',
    payload: null,
  });

  expect(result).toEqual({
    ok: true,
    resource: {
      id: 'campus-inc-null',
      version: 1,
      status: 'closed',
      payload: null,
    },
  });
});

test('fully null response is rejected as a contract error', () => {
  expect(resourceResultFromUnknown(null)).toEqual({
    ok: false,
    error: { kind: 'contract', detail: 'Remote resource envelope is invalid' },
  });
});

test.each([
  ['timeout', 'timeout'],
  ['server_error', 'http'],
  ['rate_limited', 'rate_limited'],
  ['malformed', 'contract'],
  ['slow', 'slow_response'],
] as const)('classifies deterministic backend failure scenario %s', (scenario, expectedKind) => {
  const result = evaluateStubbedIncidentResponse(scenario);

  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error.kind).toBe(expectedKind);
  }
});

test('classifies success and valid-null deterministic scenarios as controlled successes', () => {
  expect(evaluateStubbedIncidentResponse('success')).toMatchObject({ ok: true });
  expect(evaluateStubbedIncidentResponse('valid_null')).toEqual({
    ok: true,
    resource: {
      id: 'campus-inc-002',
      version: 1,
      status: 'closed',
      payload: null,
    },
  });
});

