import type { CampusRole } from '../campusops/contracts';

export type SecurityActor = Readonly<{
  id: string;
  role: CampusRole;
}>;

export type ProtectedIncident = Readonly<{
  id: string;
  reporterId: string;
  assignedTechnicianId: string | null;
}>;

export function canReadIncident(actor: SecurityActor, incident: ProtectedIncident): boolean {
  if (actor.role === 'coordinator') return true;
  if (actor.role === 'reporter') return incident.reporterId === actor.id;
  if (actor.role === 'technician') return incident.assignedTechnicianId === actor.id;
  return false;
}

