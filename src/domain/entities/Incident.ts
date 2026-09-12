export enum IncidentStatus {
  OPEN = 'OPEN',
  IN_PROGRESS = 'IN_PROGRESS',
  RESOLVED = 'RESOLVED',
  CLOSED = 'CLOSED',
}

export enum IncidentPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
}

export class Incident {
  id: string;
  title: string;
  description: string;
  status: IncidentStatus;
  priority: IncidentPriority;
  category: string;
  createdAt: Date;
  updatedAt: Date;
  assignedTo?: string;
  closedAt?: Date;

  constructor(
    id: string,
    title: string,
    description: string,
    category: string,
    priority: IncidentPriority,
    status: IncidentStatus = IncidentStatus.OPEN,
    createdAt: Date = new Date(),
    updatedAt: Date = new Date(),
    assignedTo?: string,
    closedAt?: Date
  ) {
    if (!title || title.trim() === '') {
      throw new Error('El título es obligatorio y no puede estar vacío.');
    }
    if (!description || description.length < 10) {
      throw new Error('La descripción debe tener al menos 10 caracteres.');
    }
    if (!category || category.trim() === '') {
      throw new Error('Una incidencia debe tener una categoría válida.');
    }

    this.id = id;
    this.title = title;
    this.description = description;
    this.category = category;
    this.priority = priority;
    this.status = status;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    if (assignedTo !== undefined) {
      this.assignedTo = assignedTo;
    }
    if (closedAt !== undefined) {
      this.closedAt = closedAt;
    }
  }

  close() {
    if (this.status !== IncidentStatus.RESOLVED) {
      throw new Error('Solo se puede cerrar una incidencia si está en estado RESOLVED.');
    }
    this.status = IncidentStatus.CLOSED;
    this.closedAt = new Date();
    this.updatedAt = new Date();
  }
}
