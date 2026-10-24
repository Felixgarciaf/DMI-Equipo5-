import { deduplicateOperations } from '../../src/course-evaluation';
import type { PendingIncidentOperation } from '../../src/campusops/contracts';

describe('Week 08 - deduplicateOperations (idempotencia, identidad estable y reintentos)', () => {
  test('conserva la primera operación por operationId y elimina duplicados posteriores', () => {
    const firstOp: PendingIncidentOperation = {
      operationId: 'op-start-001',
      incidentId: 'campus-inc-001',
      baseVersion: 1,
      actorId: 'technician-1',
      action: 'start',
      payload: { status: 'in_progress' },
    };
    const duplicateStartOp: PendingIncidentOperation = {
      operationId: 'op-start-001',
      incidentId: 'campus-inc-001',
      baseVersion: 1,
      actorId: 'technician-1',
      action: 'start',
      payload: { status: 'in_progress', retryAttempt: 2 },
    };
    const secondOp: PendingIncidentOperation = {
      operationId: 'op-comment-002',
      incidentId: 'campus-inc-001',
      baseVersion: 2,
      actorId: 'technician-1',
      action: 'comment',
      payload: { text: 'Revisión de cableado en proceso' },
    };
    const duplicateCommentOp: PendingIncidentOperation = {
      operationId: 'op-comment-002',
      incidentId: 'campus-inc-001',
      baseVersion: 2,
      actorId: 'technician-1',
      action: 'comment',
      payload: { text: 'Revisión de cableado en proceso' },
    };

    const queue = [firstOp, duplicateStartOp, secondOp, duplicateCommentOp];
    const result = deduplicateOperations(queue);

    expect(result).toHaveLength(2);
    expect(result).toEqual([firstOp, secondOp]);
    expect(result[0]).toBe(firstOp);
    expect(result[1]).toBe(secondOp);
  });

  test('no muta el arreglo de entrada ni los objetos de operación al deduplicar', () => {
    const input = [
      { operationId: 'op-100', action: 'start', attempt: 1 },
      { operationId: 'op-200', action: 'resolve', attempt: 1 },
      { operationId: 'op-100', action: 'start', attempt: 2 },
    ] as const;

    const snapshotBefore = JSON.stringify(input);
    const output = deduplicateOperations(input);

    expect(JSON.stringify(input)).toBe(snapshotBefore);
    expect(input).toHaveLength(3);
    expect(output).not.toBe(input);
    expect(output).toEqual([input[0], input[1]]);
  });

  test('el reintento conserva la misma identidad de operación y evita efectos duplicados en el servidor', () => {
    const retryOperation: PendingIncidentOperation = {
      operationId: 'idem-resolve-campus-inc-001',
      incidentId: 'campus-inc-001',
      baseVersion: 2,
      actorId: 'technician-1',
      action: 'resolve',
      payload: { diagnosis: 'Sustitución de conector dañado' },
    };

    // Simulación de cola con reintento encolado tras timeout_after_commit (respuesta perdida)
    const retryQueue: readonly PendingIncidentOperation[] = [
      retryOperation,
      { ...retryOperation }, // Reintento con exactamente el mismo operationId e intención
    ];

    const deduplicatedQueue = deduplicateOperations(retryQueue);
    expect(deduplicatedQueue).toHaveLength(1);
    const replayedOp = deduplicatedQueue[0];
    expect(replayedOp).toBeDefined();
    if (!replayedOp) {
      throw new Error('Expected replayed operation to be present after deduplication');
    }
    expect(replayedOp.operationId).toBe('idem-resolve-campus-inc-001');

    // Simulación del registro idempotente del servidor ante reenvío por red tras respuesta perdida
    const appliedOperations = new Map<string, { version: number; historyCount: number }>();
    let serverVersion = 2;
    const serverHistory: string[] = [];

    const sendWithIdempotencyKey = (op: PendingIncidentOperation) => {
      const existing = appliedOperations.get(op.operationId);
      if (existing) {
        return { ...existing, duplicate: true };
      }
      serverVersion += 1;
      serverHistory.push(`${op.operationId}:${op.action}`);
      const recorded = { version: serverVersion, historyCount: serverHistory.length };
      appliedOperations.set(op.operationId, recorded);
      return { ...recorded, duplicate: false };
    };

    // Primer envío (el servidor confirma pero la respuesta se pierde en el cliente)
    const firstAttemptResult = sendWithIdempotencyKey(retryOperation);
    // Reintento del cliente reutilizando la misma clave de idempotencia
    const secondAttemptResult = sendWithIdempotencyKey(replayedOp);

    expect(firstAttemptResult).toEqual({ version: 3, historyCount: 1, duplicate: false });
    expect(secondAttemptResult).toEqual({ version: 3, historyCount: 1, duplicate: true });
    expect(serverVersion).toBe(3);
    expect(serverHistory).toEqual(['idem-resolve-campus-inc-001:resolve']);
  });
});
