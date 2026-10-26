import { createIncidentQueries } from './application/incidentQueries';
import { InMemoryIncidentRepository } from './infrastructure/inMemoryIncidentRepository';
import { secureStorageService } from '../security/secureStorage';

export const campusOpsPersistence = secureStorageService.incidents;

export const campusOpsApplication = createIncidentQueries({
  incidentRepository: new InMemoryIncidentRepository(undefined, campusOpsPersistence),
});

