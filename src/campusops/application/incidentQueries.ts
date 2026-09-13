import type { IncidentDetail, IncidentListItem } from '../domain/incident';
import type { IncidentRepository } from '../domain/ports';

export type CampusOpsApplication = Readonly<{
  listIncidents(): Promise<readonly IncidentListItem[]>;
  getIncidentDetail(id: string): Promise<IncidentDetail | null>;
}>;

export function createIncidentQueries(dependencies: Readonly<{ incidentRepository: IncidentRepository }>): CampusOpsApplication {
  return {
    listIncidents() {
      return dependencies.incidentRepository.list();
    },
    getIncidentDetail(id: string) {
      return dependencies.incidentRepository.findById(id);
    },
  };
}

