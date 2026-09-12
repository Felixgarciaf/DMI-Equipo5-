import { IncidentRepository } from '../../domain/ports/IncidentRepository';
import { Incident } from '../../domain/entities/Incident';

export class ListIncidents {
  constructor(private repo: IncidentRepository) {}

  async execute(): Promise<Incident[]> {
    return this.repo.findAll();
  }
}
