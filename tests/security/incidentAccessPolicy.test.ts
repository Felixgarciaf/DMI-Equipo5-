import { canReadIncident } from '../../src/security/incidentAccessPolicy';

const incident = {
  id: 'campus-inc-101',
  reporterId: 'reporter-1',
  assignedTechnicianId: 'technician-1',
};

test('blocks a reporter from reading another reporter incident', () => {
  expect(canReadIncident({ id: 'reporter-2', role: 'reporter' }, incident)).toBe(false);
});

test('allows the owner, assigned technician and coordinator to read the incident', () => {
  expect(canReadIncident({ id: 'reporter-1', role: 'reporter' }, incident)).toBe(true);
  expect(canReadIncident({ id: 'technician-1', role: 'technician' }, incident)).toBe(true);
  expect(canReadIncident({ id: 'coordinator-1', role: 'coordinator' }, incident)).toBe(true);
});

