import type { CampusRole, IncidentCategory, IncidentLocation, IncidentStatus } from '../contracts';

export type IncidentPriority = 'low' | 'medium' | 'high';

export type IncidentListItem = Readonly<{
  id: string;
  title: string;
  category: IncidentCategory;
  status: IncidentStatus;
  priority: IncidentPriority;
  locationLabel: string;
}>;

export type IncidentDetail = IncidentListItem &
  Readonly<{
    description: string;
    reporterRole: CampusRole;
    assignedRole: CampusRole | null;
    location: IncidentLocation;
    version: number;
  }>;

