import { createIncidentQueries } from './application/incidentQueries';
import { GeocodingLocationAdapter } from './infrastructure/geocoding-adapter';
import { InMemoryIncidentRepository } from './infrastructure/inMemoryIncidentRepository';
import { secureStorageService } from '../security/secureStorage';

export const campusOpsPersistence = secureStorageService.incidents;
export const campusOpsLocationProvider = new GeocodingLocationAdapter();

export const campusOpsApplication = createIncidentQueries({
  incidentRepository: new InMemoryIncidentRepository(undefined, campusOpsPersistence),
});
