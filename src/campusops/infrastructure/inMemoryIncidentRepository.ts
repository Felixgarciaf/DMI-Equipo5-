import type { IncidentDetail, IncidentListItem } from '../domain/incident';
import type { IncidentRepository } from '../domain/ports';

const INCIDENTS: readonly IncidentDetail[] = [
  {
    id: 'campus-inc-001',
    title: 'Fuga de agua en laboratorio B',
    category: 'water',
    status: 'assigned',
    priority: 'high',
    locationLabel: 'Edificio B, laboratorio 204',
    description: 'El reportante observa agua cerca de contactos electricos y solicita atencion preventiva.',
    reporterRole: 'reporter',
    assignedRole: 'technician',
    location: { source: 'manual', label: 'Edificio B, laboratorio 204' },
    version: 1,
  },
  {
    id: 'campus-inc-002',
    title: 'Proyector sin imagen',
    category: 'equipment',
    status: 'open',
    priority: 'medium',
    locationLabel: 'Aula C-12',
    description: 'El equipo enciende, pero no muestra senal desde la entrada HDMI del salon.',
    reporterRole: 'reporter',
    assignedRole: null,
    location: { source: 'manual', label: 'Aula C-12' },
    version: 1,
  },
  {
    id: 'campus-inc-003',
    title: 'Zona sin conectividad',
    category: 'connectivity',
    status: 'in_progress',
    priority: 'medium',
    locationLabel: 'Biblioteca, planta alta',
    description: 'Varios estudiantes reportan que la red academica se desconecta de forma intermitente.',
    reporterRole: 'reporter',
    assignedRole: 'technician',
    location: { source: 'manual', label: 'Biblioteca, planta alta' },
    version: 2,
  },
];

function toListItem(incident: IncidentDetail): IncidentListItem {
  return {
    id: incident.id,
    title: incident.title,
    category: incident.category,
    status: incident.status,
    priority: incident.priority,
    locationLabel: incident.locationLabel,
  };
}

export class InMemoryIncidentRepository implements IncidentRepository {
  private readonly incidents: readonly IncidentDetail[];

  constructor(seed: readonly IncidentDetail[] = INCIDENTS) {
    this.incidents = seed;
  }

  async list(): Promise<readonly IncidentListItem[]> {
    return this.incidents.map(toListItem);
  }

  async findById(id: string): Promise<IncidentDetail | null> {
    return this.incidents.find((incident) => incident.id === id) ?? null;
  }
}

