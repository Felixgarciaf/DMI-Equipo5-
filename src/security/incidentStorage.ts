import type { PendingIncidentOperation } from '../campusops/contracts';
import type { IncidentDetail } from '../campusops/domain/incident';
import type { StorageAdapter } from './secureStorage';

export const INCIDENT_STATE_KEY = 'campusops_incident_state';
export const INCIDENT_ROLLBACK_KEY = 'campusops_incident_rollback';

export type IncidentSnapshot = Readonly<{
  schemaVersion: 2;
  incidents: readonly IncidentDetail[];
  operations: readonly PendingIncidentOperation[];
}>;

// The lock belongs to the underlying adapter, so two facades cannot interleave writes.
const locks = new WeakMap<StorageAdapter, Promise<unknown>>();

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function version(value: unknown): boolean {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function incident(value: unknown): boolean {
  if (!object(value)) return false;
  const location = value.location;
  return text(value.id) && text(value.title) && text(value.description) &&
    ['open', 'assigned', 'in_progress', 'resolved', 'closed'].includes(String(value.status)) &&
    ['electrical', 'laboratory', 'water', 'connectivity', 'equipment', 'safety', 'maintenance'].includes(String(value.category)) &&
    ['low', 'medium', 'high'].includes(String(value.priority)) && text(value.locationLabel) &&
    ['reporter', 'technician', 'coordinator'].includes(String(value.reporterRole)) &&
    (value.assignedRole === null || ['reporter', 'technician', 'coordinator'].includes(String(value.assignedRole))) &&
    version(value.version) && object(location) && text(location.label) &&
    ['manual', 'provider'].includes(String(location.source)) &&
    (location.latitude === undefined || (typeof location.latitude === 'number' && Number.isFinite(location.latitude) && Math.abs(location.latitude) <= 90)) &&
    (location.longitude === undefined || (typeof location.longitude === 'number' && Number.isFinite(location.longitude) && Math.abs(location.longitude) <= 180));
}

function operation(value: unknown): boolean {
  return object(value) && text(value.operationId) && text(value.incidentId) &&
    text(value.actorId) && text(value.action) && version(value.baseVersion) && object(value.payload);
}

function decode(raw: string): IncidentSnapshot {
  const value: unknown = JSON.parse(raw);
  if (!object(value) || (value.schemaVersion !== 1 && value.schemaVersion !== 2)) {
    throw new Error('Unsupported incident storage schema');
  }
  const operations = value.schemaVersion === 1 ? value.pendingOperations : value.operations;
  if (!Array.isArray(value.incidents) || !value.incidents.every(incident) ||
      !Array.isArray(operations) || !operations.every(operation)) {
    throw new Error('Invalid incident storage data');
  }
  const ids = new Set(value.incidents.map((item: IncidentDetail) => item.id));
  if (ids.size !== value.incidents.length ||
      new Set(operations.map((item: PendingIncidentOperation) => item.operationId)).size !== operations.length ||
      operations.some((item: PendingIncidentOperation) => !ids.has(item.incidentId))) {
    throw new Error('Invalid incident storage relationships');
  }
  return { schemaVersion: 2, incidents: value.incidents, operations };
}

/** Versioning over the existing adapter, not a second persistence backend. */
export class IncidentStorage {
  constructor(private readonly adapter: StorageAdapter) {}

  private exclusive<T>(task: () => Promise<T>): Promise<T> {
    const previous = locks.get(this.adapter) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(task);
    locks.set(this.adapter, next);
    return next;
  }

  private async recover(): Promise<void> {
    const journal = await this.adapter.getItem(INCIDENT_ROLLBACK_KEY);
    if (journal === null) return;
    const saved: unknown = JSON.parse(journal);
    if (!object(saved) || !(saved.before === null || typeof saved.before === 'string')) {
      throw new Error('Invalid incident recovery journal');
    }
    if (saved.before === null) await this.adapter.removeItem(INCIDENT_STATE_KEY);
    else {
      decode(saved.before);
      await this.adapter.setItem(INCIDENT_STATE_KEY, saved.before);
    }
    // If restoration fails, retain the journal and refuse to expose partial data.
    await this.adapter.removeItem(INCIDENT_ROLLBACK_KEY);
  }

  private async commit(before: string | null, next: IncidentSnapshot): Promise<void> {
    const serialized = JSON.stringify(next);
    decode(serialized);
    await this.adapter.setItem(INCIDENT_ROLLBACK_KEY, JSON.stringify({ before }));
    await this.adapter.setItem(INCIDENT_STATE_KEY, serialized);
    // Removing the journal is the commit point. A remaining journal means rollback.
    await this.adapter.removeItem(INCIDENT_ROLLBACK_KEY);
  }

  private async load(seed: readonly IncidentDetail[] = []): Promise<IncidentSnapshot> {
    await this.recover();
    const raw = await this.adapter.getItem(INCIDENT_STATE_KEY);
    if (raw === null) {
      const empty: IncidentSnapshot = { schemaVersion: 2, incidents: seed, operations: [] };
      await this.commit(null, empty);
      return empty;
    }
    const snapshot = decode(raw);
    if ((JSON.parse(raw) as { schemaVersion: number }).schemaVersion === 1) {
      await this.commit(raw, snapshot);
    }
    return snapshot;
  }

  read(seed: readonly IncidentDetail[] = []): Promise<IncidentSnapshot> {
    return this.exclusive(() => this.load(seed));
  }

  savePendingChange(change: PendingIncidentOperation): Promise<IncidentSnapshot> {
    // Copy at invocation: callers cannot mutate queued work while waiting for the lock.
    const copy = JSON.parse(JSON.stringify(change)) as PendingIncidentOperation;
    return this.exclusive(async () => {
      const current = await this.load();
      if (current.operations.some((item) => item.operationId === copy.operationId)) {
        throw new Error('Operation identity already exists; existing content preserved');
      }
      const next: IncidentSnapshot = { ...current, operations: [...current.operations, copy] };
      await this.commit(JSON.stringify(current), next);
      return next;
    });
  }
}
