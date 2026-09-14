import type { CampusRole } from '../contracts';
import type { IncidentDetail, IncidentListItem } from './incident';

export interface IncidentRepository {
  list(): Promise<readonly IncidentListItem[]>;
  findById(id: string): Promise<IncidentDetail | null>;
}

export interface SessionBoundary {
  currentRole(): Promise<CampusRole | null>;
}

export interface IncidentPersistencePort {
  savePendingChange(incidentId: string, change: Readonly<Record<string, unknown>>): Promise<void>;
}

export interface LocationProviderPort {
  describeCurrentLocation(): Promise<string>;
}

