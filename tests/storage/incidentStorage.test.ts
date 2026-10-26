import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PendingIncidentOperation } from '../../src/campusops/contracts';
import type { IncidentDetail } from '../../src/campusops/domain/incident';
import { InMemoryIncidentRepository } from '../../src/campusops/infrastructure/inMemoryIncidentRepository';
import { INCIDENT_ROLLBACK_KEY, INCIDENT_STATE_KEY, IncidentStorage } from '../../src/security/incidentStorage';
import { SecurityStorageService, type StorageAdapter } from '../../src/security/secureStorage';

const item: IncidentDetail = {
  id: 'campus-inc-001', title: 'Fuga ficticia', category: 'water', status: 'assigned',
  priority: 'high', locationLabel: 'Laboratorio B', description: 'Caso sintetico',
  reporterRole: 'reporter', assignedRole: 'technician',
  location: { source: 'manual', label: 'Laboratorio B' }, version: 3,
};
const pending: PendingIncidentOperation = {
  operationId: 'op-offline-001', incidentId: item.id, baseVersion: 3,
  actorId: 'technician-1', action: 'start_attention',
  payload: { notes: 'Atencion iniciada sin red', photos: [{ uri: 'file:///pending/photo-001.jpg', status: 'pending_upload' }] },
};
const legacy = JSON.stringify({ schemaVersion: 1, incidents: [item], pendingOperations: [pending] });

class FaultAdapter implements StorageAdapter {
  readonly values = new Map<string, string>([[INCIDENT_STATE_KEY, legacy]]);
  readonly stateWrites: string[] = [];
  failWrite = false;
  failCommit = false;
  failRecovery = false;
  async getItem(key: string) { return this.values.get(key) ?? null; }
  async setItem(key: string, value: string) {
    if (key === INCIDENT_STATE_KEY && (this.failWrite || this.failRecovery)) {
      throw new Error('Injected storage write failure');
    }
    this.values.set(key, value);
    if (key === INCIDENT_STATE_KEY) this.stateWrites.push(value);
  }
  async removeItem(key: string) {
    if (key === INCIDENT_ROLLBACK_KEY && this.failCommit) throw new Error('Injected interruption before commit');
    this.values.delete(key);
  }
}

test('nominal: migrates schema 1 to 2 preserving every incident and pending operation', async () => {
  const adapter = new FaultAdapter();
  const before = JSON.parse(legacy);
  const result = await new SecurityStorageService(adapter).incidents.read();
  expect(result).toEqual({ schemaVersion: 2, incidents: before.incidents, operations: before.pendingOperations });
  expect(JSON.parse(adapter.values.get(INCIDENT_STATE_KEY)!)).toEqual(result);
  expect(adapter.values.has(INCIDENT_ROLLBACK_KEY)).toBe(false);
  console.log('MIGRATION_NOMINAL', JSON.stringify({ before, after: result }));
});

test('failure/recovery: interrupted migration rolls back on next open then migrates intact', async () => {
  const adapter = new FaultAdapter();
  adapter.failWrite = true;
  await expect(new IncidentStorage(adapter).read()).rejects.toThrow('Injected storage write failure');
  const atFailure = adapter.values.get(INCIDENT_STATE_KEY);
  expect(atFailure).toBe(legacy);
  expect(JSON.parse(adapter.values.get(INCIDENT_ROLLBACK_KEY)!).before).toBe(legacy);
  adapter.failWrite = false;
  const recovered = await new IncidentStorage(adapter).read();
  expect(recovered.incidents).toEqual([item]);
  expect(recovered.operations).toEqual([pending]);
  expect(adapter.values.has(INCIDENT_ROLLBACK_KEY)).toBe(false);
  console.log('MIGRATION_RECOVERY', JSON.stringify({ before: JSON.parse(legacy), atFailure: JSON.parse(atFailure!), afterRecovery: recovered }));
});

test('failure: a written candidate remains uncommitted and cannot leak through recovery', async () => {
  const adapter = new FaultAdapter();
  adapter.failCommit = true;
  await expect(new IncidentStorage(adapter).read()).rejects.toThrow('Injected interruption');
  const candidate = JSON.parse(adapter.values.get(INCIDENT_STATE_KEY)!);
  expect(candidate.schemaVersion).toBe(2);
  expect(JSON.parse(adapter.values.get(INCIDENT_ROLLBACK_KEY)!).before).toBe(legacy);
  // Even a valid-looking newer snapshot cannot be exposed while rollback is blocked.
  adapter.failRecovery = true;
  await expect(new IncidentStorage(adapter).read()).rejects.toThrow('Injected storage write failure');
  expect(adapter.values.has(INCIDENT_ROLLBACK_KEY)).toBe(true);
  adapter.failRecovery = false;
  adapter.failCommit = false;
  const recovered = await new IncidentStorage(adapter).read();
  expect(recovered).toEqual(candidate);
  expect(adapter.stateWrites).toEqual([
    JSON.stringify(candidate), legacy, JSON.stringify(candidate),
  ]);
  console.log('CANDIDATE_RECOVERY', JSON.stringify({ before: JSON.parse(legacy), atFailure: { candidate, journalPresent: true }, recoveryWrites: adapter.stateWrites.map((raw) => JSON.parse(raw).schemaVersion), afterRecovery: recovered }));
});

test('restart: two separate processes recover the same durable operation, notes and photo reference', () => {
  const directory = mkdtempSync(join(tmpdir(), 'campusops-week08-'));
  try {
    const fixture = join(directory, 'fixture.json');
    writeFileSync(fixture, JSON.stringify({ incidents: [item], operation: pending }));
    const worker = join(__dirname, 'restart-worker.cjs');
    const first = spawnSync(process.execPath, [worker, 'write', directory, fixture], { encoding: 'utf8' });
    expect(first.stderr).toBe('');
    expect(first.status).toBe(0);
    const second = spawnSync(process.execPath, [worker, 'read', directory], { encoding: 'utf8' });
    expect(second.stderr).toBe('');
    expect(second.status).toBe(0);
    const reopened = JSON.parse(second.stdout);
    expect(reopened).toEqual(JSON.parse(first.stdout));
    expect(reopened.operations).toEqual([pending]);
    console.log('PROCESS_RESTART', JSON.stringify(reopened));
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('existing service: a new facade reuses SecureStore data and leaves session keys alone', async () => {
  const adapter = new FaultAdapter();
  adapter.values.set('session_token', 'synthetic-session');
  await new SecurityStorageService(adapter).incidents.read();
  const reopened = new SecurityStorageService(adapter);
  expect((await reopened.incidents.read()).operations).toEqual([pending]);
  expect(await reopened.getSensitiveData('session_token')).toBe('synthetic-session');
});

test('integration: existing repository reads migrated incidents instead of replacing them with seed data', async () => {
  const storage = new IncidentStorage(new FaultAdapter());
  const repository = new InMemoryIncidentRepository([], storage);
  expect(await repository.findById(item.id)).toEqual(item);
  expect(await repository.list()).toHaveLength(1);
});

test('concurrent queue writes across facades preserve both entries', async () => {
  const adapter = new FaultAdapter();
  const a = new IncidentStorage(adapter);
  const b = new IncidentStorage(adapter);
  await Promise.all([
    a.savePendingChange({ ...pending, operationId: 'op-2' }),
    b.savePendingChange({ ...pending, operationId: 'op-3' }),
  ]);
  expect((await a.read()).operations.map((op) => op.operationId)).toEqual(['op-offline-001', 'op-2', 'op-3']);
});

test('boundary: duplicate identity or unknown incident cannot overwrite a queued intention', async () => {
  const adapter = new FaultAdapter();
  const storage = new IncidentStorage(adapter);
  const before = await storage.read();
  await expect(storage.savePendingChange({ ...pending, payload: { notes: 'overwrite' } })).rejects.toThrow('identity already exists');
  await expect(storage.savePendingChange({ ...pending, operationId: 'orphan', incidentId: 'missing' })).rejects.toThrow('relationships');
  expect(await storage.read()).toEqual(before);
});

test.each([
  '{broken-json',
  JSON.stringify({ schemaVersion: 99, incidents: [], operations: [] }),
  JSON.stringify({ schemaVersion: 1, incidents: [item], pendingOperations: [{ ...pending, baseVersion: -1 }] }),
])('boundary: invalid or future schema is preserved and rejected: %s', async (raw) => {
  const adapter = new FaultAdapter();
  adapter.values.set(INCIDENT_STATE_KEY, raw);
  await expect(new IncidentStorage(adapter).read()).rejects.toThrow();
  expect(adapter.values.get(INCIDENT_STATE_KEY)).toBe(raw);
  expect(adapter.values.has(INCIDENT_ROLLBACK_KEY)).toBe(false);
});

test('failure: unconfirmed queue write is rolled back without touching previously saved operations', async () => {
  const adapter = new FaultAdapter();
  const storage = new IncidentStorage(adapter);
  const before = await storage.read();
  adapter.failCommit = true;
  await expect(storage.savePendingChange({ ...pending, operationId: 'not-confirmed' })).rejects.toThrow('Injected interruption');
  adapter.failCommit = false;
  expect(await new IncidentStorage(adapter).read()).toEqual(before);
});
