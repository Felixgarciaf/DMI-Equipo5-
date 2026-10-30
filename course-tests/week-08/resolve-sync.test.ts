import { resolveSync } from '../../src/course-evaluation';
import type { SyncRecord } from '../../src/course-evaluation/contracts';

describe('Week 08 - resolveSync (sincronización y detección de conflictos)', () => {
  test('combina cambios independientes en campos distintos sin generar falso conflicto', () => {
    const base: SyncRecord = {
      id: 'campus-inc-001',
      version: 1,
      fields: {
        description: 'Falla eléctrica en laboratorio',
        priority: 'medium',
        location: 'Edificio A',
        notes: ['Reporte inicial'],
      },
    };

    const local: SyncRecord = {
      id: 'campus-inc-001',
      version: 1,
      fields: {
        description: 'Falla eléctrica en laboratorio',
        priority: 'medium',
        location: 'Edificio A',
        notes: ['Reporte inicial', 'Diagnóstico preliminar sin conexión'],
        diagnosis: 'Interruptor térmico disparado',
      },
    };

    const remote: SyncRecord = {
      id: 'campus-inc-001',
      version: 2,
      fields: {
        description: 'Falla eléctrica en laboratorio',
        priority: 'high',
        location: 'Edificio A - Piso 2',
        notes: ['Reporte inicial'],
      },
    };

    const result = resolveSync(base, local, remote);

    expect(result).toEqual({
      kind: 'merged',
      fields: {
        description: 'Falla eléctrica en laboratorio',
        priority: 'high',
        location: 'Edificio A - Piso 2',
        notes: ['Reporte inicial', 'Diagnóstico preliminar sin conexión'],
        diagnosis: 'Interruptor térmico disparado',
      },
    });
  });

  test('detecta conflictos simultáneos y devuelve los campos ordenados alfabéticamente por nombre', () => {
    const base: SyncRecord = {
      id: 'campus-inc-002',
      version: 3,
      fields: {
        work: { assignedTechnicianId: 'technician-1', status: 'assigned' },
        priority: 'low',
        category: 'connectivity',
        location: 'Biblioteca',
      },
    };

    const local: SyncRecord = {
      id: 'campus-inc-002',
      version: 3,
      fields: {
        work: { assignedTechnicianId: 'technician-1', status: 'in_progress' },
        priority: 'medium',
        category: 'electrical',
        location: 'Biblioteca',
      },
    };

    const remote: SyncRecord = {
      id: 'campus-inc-002',
      version: 4,
      fields: {
        work: { assignedTechnicianId: 'technician-2', status: 'assigned' },
        priority: 'high',
        category: 'equipment',
        location: 'Biblioteca Central',
      },
    };

    const result = resolveSync(base, local, remote);

    expect(result).toEqual({
      kind: 'conflict',
      fields: ['category', 'priority', 'work'],
    });
  });

  test('compara valores objeto/JSON por contenido canónico y no por referencia de memoria', () => {
    const base: SyncRecord = {
      id: 'campus-inc-003',
      version: 1,
      fields: {
        work: { assignedTechnicianId: 'technician-1', status: 'assigned' },
        metadata: { building: 'B', floor: 2, tags: ['agua', 'urgente'] },
        priority: 'medium',
      },
    };

    // Nuevas instancias de objetos con distinto orden de claves pero idéntico contenido JSON respecto a base
    const local: SyncRecord = {
      id: 'campus-inc-003',
      version: 1,
      fields: {
        work: { status: 'assigned', assignedTechnicianId: 'technician-1' },
        metadata: { tags: ['agua', 'urgente'], floor: 2, building: 'B' },
        priority: 'high',
      },
    };

    const remote: SyncRecord = {
      id: 'campus-inc-003',
      version: 2,
      fields: {
        work: { assignedTechnicianId: 'technician-1', status: 'in_progress' },
        metadata: { floor: 2, building: 'B', tags: ['agua', 'urgente'] },
        priority: 'medium',
      },
    };

    const result = resolveSync(base, local, remote);

    expect(result).toEqual({
      kind: 'merged',
      fields: {
        work: { assignedTechnicianId: 'technician-1', status: 'in_progress' },
        metadata: { building: 'B', floor: 2, tags: ['agua', 'urgente'] },
        priority: 'high',
      },
    });
  });

  test('converge sin conflicto cuando local y remote aplican el mismo cambio por contenido JSON', () => {
    const base: SyncRecord = {
      id: 'campus-inc-004',
      version: 1,
      fields: {
        work: { assignedTechnicianId: 'technician-1', status: 'assigned' },
      },
    };

    const local: SyncRecord = {
      id: 'campus-inc-004',
      version: 1,
      fields: {
        work: { status: 'in_progress', assignedTechnicianId: 'technician-1' },
      },
    };

    const remote: SyncRecord = {
      id: 'campus-inc-004',
      version: 2,
      fields: {
        work: { assignedTechnicianId: 'technician-1', status: 'in_progress' },
      },
    };

    expect(resolveSync(base, local, remote)).toEqual({
      kind: 'merged',
      fields: {
        work: { status: 'in_progress', assignedTechnicianId: 'technician-1' },
      },
    });
  });

  test('no muta base, local ni remote ni expone referencias internas mutables', () => {
    const base: SyncRecord = {
      id: 'campus-inc-005',
      version: 1,
      fields: {
        work: { assignedTechnicianId: 'technician-1', status: 'assigned' },
        notes: ['nota-1'],
      },
    };
    const local: SyncRecord = {
      id: 'campus-inc-005',
      version: 1,
      fields: {
        work: { assignedTechnicianId: 'technician-1', status: 'assigned' },
        notes: ['nota-1', 'nota-local'],
      },
    };
    const remote: SyncRecord = {
      id: 'campus-inc-005',
      version: 2,
      fields: {
        work: { assignedTechnicianId: 'technician-1', status: 'in_progress' },
        notes: ['nota-1'],
      },
    };

    const snapshotBefore = JSON.stringify({ base, local, remote });
    const merged = resolveSync(base, local, remote);

    expect(JSON.stringify({ base, local, remote })).toBe(snapshotBefore);
    expect(merged.kind).toBe('merged');

    if (merged.kind === 'merged') {
      const mergedNotes = merged.fields.notes as string[];
      mergedNotes.push('mutacion-externa');
      expect(local.fields.notes).toEqual(['nota-1', 'nota-local']);
    }
  });
});
