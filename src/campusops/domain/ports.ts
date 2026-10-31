import type { CampusRole, IncidentLocation } from '../contracts';
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

export type GeocodingLookupResult = Readonly<{
  label: string;
  latitude: number;
  longitude: number;
}>;

export type LocationLookupRequest = Readonly<{
  query: string;
  manualLabel: string;
  scenario?: string;
}>;

export interface LocationProviderPort {
  describeCurrentLocation(): Promise<string>;
  lookupLocation(query: string, scenario?: string): Promise<GeocodingLookupResult | null>;
  resolveIncidentLocation(request: LocationLookupRequest): Promise<IncidentLocation>;
}

