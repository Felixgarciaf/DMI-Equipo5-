# Política de Sincronización, Resolución de Conflictos, Reintentos e Idempotencia — CampusOps (Semana 08)

## 1. Objetivo y alcance

Este documento define la política técnica de sincronización de cambios realizados sin conexión en **CampusOps**, abarcando:
1. Las reglas para combinar cambios independientes o declarar conflictos deterministas mediante `resolveSync(base, local, remote)`.
2. El respeto a las reglas de autorización por perfil (`reporter`, `technician`, `coordinator`) durante la reconexión.
3. La preservación de identidad estable (`operationId` / `Idempotency-Key`) y deduplicación en cola mediante `deduplicateOperations(operations)`.
4. La política de reintentos idempotentes y el criterio estricto para retirar operaciones de la cola persistente.

---

## 2. Reglas de combinación y detección de conflictos (`resolveSync`)

La función `resolveSync(base, local, remote)` en `src/course-evaluation/index.ts` evalúa tres instantáneas inmutables (`SyncRecord`: `{ id, version, fields }`) a partir de una versión `base` común:

### 2.1 Comparación por contenido JSON canónico e inmutabilidad
- **Comparación estructural por contenido JSON:** Los valores de cada campo en `fields` se comparan mediante serialización JSON canónica (`canonicalizeJson`), ordenando recursivamente las claves de los objetos anidados. Dos objetos con distinto orden de propiedades o distinta referencia en memoria pero idéntico contenido JSON se tratan como equivalentes.
- **Inmutabilidad garantizada:** `resolveSync` no muta `base`, `local` ni `remote`, y clona profundamente los valores incluidos en el resultado combinado para evitar efectos colaterales por referencia compartida.

### 2.2 Qué se combina automáticamente (`kind: 'merged'`)
Cuando ningún campo presenta modificaciones incompatibles entre `local` y `remote`, la función devuelve `{ kind: 'merged', fields }`:
- **Campo sin cambios:** Si ni `local` ni `remote` modificaron el campo respecto a `base`, se conserva el valor de `base`.
- **Cambio exclusivamente local:** Si `local` modificó o agregó un campo y `remote` mantuvo el valor de `base`, se conserva el valor de `local`.
- **Cambio exclusivamente remoto:** Si `remote` modificó o agregó un campo y `local` mantuvo el valor de `base`, se conserva el valor de `remote`.
- **Cambio convergente:** Si tanto `local` como `remote` modificaron el mismo campo hacia un valor con contenido JSON idéntico, se conserva dicho valor sin reportar falso conflicto.

### 2.3 Qué requiere resolución (`kind: 'conflict'`)
- **Modificación simultánea incompatible:** Si un mismo campo cambió en `local` respecto a `base` y también cambió en `remote` respecto a `base`, pero los valores JSON de `local` y `remote` son distintos entre sí, el campo se marca en conflicto.
- **Ordenamiento determinista:** Cuando existe uno o más campos en conflicto, `resolveSync` devuelve `{ kind: 'conflict', fields }` con los nombres de todos los campos conflictivos **ordenados alfabéticamente por nombre** (por ejemplo, `['category', 'priority', 'work']`).

---

## 3. Caso obligatorio CampusOps (`work`) y autorización por perfil

En el contrato de evaluación de CampusOps, el campo compuesto `work` agrupa `{ assignedTechnicianId, status }`:
- **Escenario de reasignación concurrente:**
  1. `base` (`version: 1`): `{ work: { assignedTechnicianId: 'technician-1', status: 'assigned' } }`.
  2. Sin conexión, `technician-1` inicia atención localmente (`local`): `{ work: { assignedTechnicianId: 'technician-1', status: 'in_progress' } }`.
  3. Mientras tanto, `coordinator-1` reasigna la incidencia en el servidor a `technician-2` (`remote`, `version: 2`): `{ work: { assignedTechnicianId: 'technician-2', status: 'assigned' } }`.
- **Resultado y política de autorización:**
  - `resolveSync(base, local, remote)` detecta la incompatibilidad sobre el mismo campo compuesto y devuelve `{ kind: 'conflict', fields: ['work'] }`.
  - Conforme al modelo de permisos de la Semana 06, un técnico no puede modificar una incidencia que ya fue reasignada a otra persona (`403 Forbidden` / `409 Conflict` por `baseVersion` obsoleta en `POST /v1/incidents/:id/actions`).
  - **Sin pérdida silenciosa:** No se impone la asignación antigua de `technician-1` sobre el servidor ni se borra silenciosamente la intención local pendiente; el conflicto queda registrado para su inspección y resolución explícita.

---

## 4. Identidad estable, deduplicación (`deduplicateOperations`) e idempotencia

### 4.1 Identidad estable de operación (`operationId` / `Idempotency-Key`)
Cada operación pendiente (`PendingIncidentOperation`) posee un identificador único e inmutable `operationId` generado al crearse la intención local, junto con `incidentId`, `baseVersion`, `actorId`, `action` y `payload`. Al transmitirse hacia el backend (`POST /v1/incidents` o `POST /v1/incidents/:id/actions`), ese `operationId` se envía en la cabecera HTTP `Idempotency-Key`.

### 4.2 Regla de deduplicación en cola
La función `deduplicateOperations(operations)` en `src/course-evaluation/index.ts` depura secuencias de operaciones antes de procesarlas o sincronizarlas:
- Conserva únicamente la **primera operación** encontrada para cada `operationId`, manteniendo el orden original de aparición.
- Descarta cualquier aparición duplicada posterior con el mismo `operationId`.
- **Inmutabilidad:** Devuelve un nuevo arreglo sin alterar el arreglo de entrada ni mutar los objetos de operación.

### 4.3 Reintentos ante respuesta perdida (`timeout_after_commit`)
- Si el cliente envía una operación y ocurre un timeout local o corte de conexión después de que el servidor ya aplicó el cambio (`timeout_after_commit`), el cliente **no genera un nuevo `operationId`**.
- Al reintentar la operación con la misma `Idempotency-Key` y el mismo contenido JSON, el backend reconoce la clave previamente registrada para ese actor y ruta, y responde `200 OK` con `{ duplicate: true }` devolviendo el resultado original sin incrementar otra vez `version` ni duplicar eventos en `history`.
- Reutilizar una misma `Idempotency-Key` con un payload diferente es rechazado por el servidor con `409 Conflict (idempotency_key_reused)`.

---

## 5. Momento de retirar una operación de la cola

| Resultado de sincronización | Acción sobre la cola persistente |
|---|---|
| `201 Created` (aplicación inicial exitosa) | La operación queda confirmada y **se retira de la cola**. |
| `200 OK` con `duplicate: true` (reintento idempotente confirmado) | El servidor confirma que el efecto ya estaba aplicado; la operación **se retira de la cola**. |
| Timeout de red, desconexión o `500` / `429` | Un fallo o timeout no prueba que el servidor rechazó o aplicó la operación; la operación **permanece en la cola** conservando su `operationId` para reintento idempotente. |
| `409 Conflict` (`version_conflict`) o conflicto detectado por `resolveSync` | La operación **no se descarta silenciosamente**; se conserva el estado pendiente/conflictivo para resolución sin sobrescribir cambios remotos. |

---

## 6. Trazabilidad con pruebas ejecutables

| Requisito / Escenario | Archivo de prueba | Verificación |
|---|---|---|
| Conflicto CampusOps en `work` (inicio offline vs reasignación remota), cambios independientes y deduplicación básica | `course-tests/public/week-08.test.ts` | Verifica que `resolveSync` detecta `['work']` sin mutar entradas, combina campos independientes y `deduplicateOperations` conserva la primera operación por `operationId`. |
| Combinación de múltiples campos independientes, conflictos simultáneos ordenados alfabéticamente, comparación por contenido JSON canónico e inmutabilidad profunda | `course-tests/week-08/resolve-sync.test.ts` | Verifica mezcla sin falsos conflictos, orden alfabético `['category', 'priority', 'work']`, equivalencia de objetos con distinto orden de claves y ausencia de mutación en `base`, `local` y `remote`. |
| Deduplicación de cola, preservación de la primera operación, inmutabilidad de entrada y reintento idempotente sin duplicar efectos en el servidor | `course-tests/week-08/deduplicate-operations.test.ts` | Verifica que reintentar una operación tras respuesta perdida conserva el mismo `operationId`, devuelve `duplicate: true` en el segundo envío y produce un único incremento de versión e historial. |
