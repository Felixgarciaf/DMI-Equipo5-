import { IncidentRepository } from '../../domain/ports/IncidentRepository';
import { Incident } from '../../domain/entities/Incident';

export class GetIncidentDetail {
  constructor(private repo: IncidentRepository) {}

  async execute(id: string): Promise<Incident> {
    const incident = await this.repo.findById(id);
    if (!incident) {
      throw new Error('Incidencia no encontrada');
    }
    return incident;
  }
}
