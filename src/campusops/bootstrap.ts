import { createIncidentQueries } from './application/incidentQueries';
import { InMemoryIncidentRepository } from './infrastructure/inMemoryIncidentRepository';

export const campusOpsApplication = createIncidentQueries({
  incidentRepository: new InMemoryIncidentRepository(),
});

