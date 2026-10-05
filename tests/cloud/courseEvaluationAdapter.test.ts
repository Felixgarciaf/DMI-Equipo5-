import { parseRemoteResource } from '../../src/course-evaluation';

describe('Week 05 course-evaluation adapter', () => {
  it('delegates valid remote resources to the CampusOps parser', () => {
    const result = parseRemoteResource({
      id: 'campus-inc-001',
      version: 2,
      status: 'assigned',
      payload: {
        category: 'connectivity',
        description: 'Falla ficticia',
      },
    });

    expect(result.ok).toBe(true);
  });

  it('preserves a valid null payload without inventing data', () => {
    const result = parseRemoteResource({
      id: 'r-2',
      version: 3,
      status: 'closed',
      payload: null,
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.value.payload).toBeNull();
    }
  });

  it('rejects malformed remote resources through the public adapter', () => {
    const result = parseRemoteResource({
      id: '',
      version: 1,
      status: 'open',
      payload: null,
    });

    expect(result.ok).toBe(false);
  });
});