import type { CampusRole, IncidentStatus } from '../campusops/contracts';

export type SecurityActor = Readonly<{
  id: string;
  role: CampusRole;
}>;

export type ProtectedIncident = Readonly<{
  id: string;
  reporterId: string;
  assignedTechnicianId: string | null;
  status?: IncidentStatus;
}>;

export type IncidentAction = 'read' | 'resolve' | 'close' | 'reopen';

export type AuthorizationDecision = Readonly<
  | { allowed: true }
  | {
      allowed: false;
      reason:
        | 'not_owner'
        | 'not_assigned_technician'
        | 'not_coordinator'
        | 'invalid_state';
    }
>;

export function canReadIncident(
  actor: SecurityActor,
  incident: ProtectedIncident,
): boolean {
  if (actor.role === 'coordinator') return true;
  if (actor.role === 'reporter') return incident.reporterId === actor.id;
  if (actor.role === 'technician')
    return incident.assignedTechnicianId === actor.id;
  return false;
}

export function canResolveIncident(
  actor: SecurityActor,
  incident: ProtectedIncident,
): boolean {
  if (actor.role !== 'technician') return false;
  if (incident.assignedTechnicianId !== actor.id) return false;
  return incident.status !== 'closed' && incident.status !== 'resolved';
}

export function canCloseIncident(
  actor: SecurityActor,
  incident: ProtectedIncident,
): boolean {
  if (actor.role !== 'coordinator') return false;
  return incident.status !== 'closed';
}

export function canReopenIncident(
  actor: SecurityActor,
  incident: ProtectedIncident,
): boolean {
  if (actor.role !== 'coordinator') return false;
  return incident.status === 'closed';
}

export function authorizeIncidentAction(
  actor: SecurityActor,
  incident: ProtectedIncident,
  action: IncidentAction,
): AuthorizationDecision {
  if (action === 'read') {
    if (canReadIncident(actor, incident)) return { allowed: true };
    return {
      allowed: false,
      reason:
        actor.role === 'reporter' ? 'not_owner' : 'not_assigned_technician',
    };
  }

  if (action === 'resolve') {
    if (canResolveIncident(actor, incident)) return { allowed: true };
    return { allowed: false, reason: 'not_assigned_technician' };
  }

  if (action === 'close') {
    if (canCloseIncident(actor, incident)) return { allowed: true };
    return {
      allowed: false,
      reason:
        actor.role === 'coordinator' ? 'invalid_state' : 'not_coordinator',
    };
  }

  if (canReopenIncident(actor, incident)) return { allowed: true };
  return {
    allowed: false,
    reason: actor.role === 'coordinator' ? 'invalid_state' : 'not_coordinator',
  };
}
