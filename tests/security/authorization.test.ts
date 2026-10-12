import {
  authorizeIncidentAction,
  canCloseIncident,
  canReadIncident,
  canReopenIncident,
  canResolveIncident,
  type ProtectedIncident,
} from "../../src/security/incidentAccessPolicy";

const assignedIncident: ProtectedIncident = {
  id: "campus-inc-201",
  reporterId: "reporter-1",
  assignedTechnicianId: "technician-1",
  status: "in_progress",
};

const closedIncident: ProtectedIncident = {
  ...assignedIncident,
  status: "closed",
};

test("enforces read permissions for reporter, assigned technician and coordinator", () => {
  expect(
    canReadIncident({ id: "reporter-1", role: "reporter" }, assignedIncident),
  ).toBe(true);
  expect(
    canReadIncident({ id: "reporter-2", role: "reporter" }, assignedIncident),
  ).toBe(false);
  expect(
    canReadIncident(
      { id: "technician-1", role: "technician" },
      assignedIncident,
    ),
  ).toBe(true);
  expect(
    canReadIncident(
      { id: "technician-2", role: "technician" },
      assignedIncident,
    ),
  ).toBe(false);
  expect(
    canReadIncident(
      { id: "coordinator-1", role: "coordinator" },
      assignedIncident,
    ),
  ).toBe(true);
});

test("allows only the assigned technician to resolve an active incident", () => {
  expect(
    canResolveIncident(
      { id: "technician-1", role: "technician" },
      assignedIncident,
    ),
  ).toBe(true);
  expect(
    canResolveIncident(
      { id: "technician-2", role: "technician" },
      assignedIncident,
    ),
  ).toBe(false);
  expect(
    canResolveIncident(
      { id: "coordinator-1", role: "coordinator" },
      assignedIncident,
    ),
  ).toBe(false);
});

test("allows coordinators to close and reopen incidents", () => {
  expect(
    canCloseIncident(
      { id: "coordinator-1", role: "coordinator" },
      assignedIncident,
    ),
  ).toBe(true);
  expect(
    canCloseIncident(
      { id: "technician-1", role: "technician" },
      assignedIncident,
    ),
  ).toBe(false);
  expect(
    canReopenIncident(
      { id: "coordinator-1", role: "coordinator" },
      closedIncident,
    ),
  ).toBe(true);
  expect(
    canReopenIncident({ id: "reporter-1", role: "reporter" }, closedIncident),
  ).toBe(false);
});

test("returns a denial decision for unauthorized actions", () => {
  expect(
    authorizeIncidentAction(
      { id: "reporter-1", role: "reporter" },
      assignedIncident,
      "close",
    ),
  ).toEqual({ allowed: false, reason: "not_coordinator" });
  expect(
    authorizeIncidentAction(
      { id: "technician-2", role: "technician" },
      assignedIncident,
      "resolve",
    ),
  ).toEqual({ allowed: false, reason: "not_assigned_technician" });
});
