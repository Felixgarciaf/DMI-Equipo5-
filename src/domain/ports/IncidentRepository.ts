import { Incident } from '../entities/Incident';

export interface IncidentRepository {
  findAll(): Promise<Incident[]>;
  findById(id: string): Promise<Incident | null>;
  create(incident: Incident): Promise<Incident>;
  update(incident: Incident): Promise<Incident>;
  delete(id: string): Promise<void>;
}
