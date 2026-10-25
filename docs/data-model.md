# Modelo de datos local - Semana 08

## Propuesta de Cesar: almacenamiento, migracion y recuperacion

Esta seccion describe la aportacion de Cesar. El equipo debe completar las relaciones
de sincronizacion y su politica en `docs/sync-policy.md` al integrar las ramas.

### Almacenamiento existente y conexiones

Se amplia `src/security/secureStorage.ts`, sin otro servicio ni dependencia nativa.
`SecurityStorageService.incidents` usa el mismo `StorageAdapter` seguro de la sesion;
la implementacion de versionado esta en `src/security/incidentStorage.ts`.
Las preferencias publicas siguen en su adaptador anterior y no se usan para la cola.
Los tokens conservan sus claves y reglas de cierre de sesion de Semana 06.

`src/campusops/bootstrap.ts` inyecta esta persistencia en el repositorio de incidencias
existente. Lista y detalle leen el snapshot recuperado; las incidencias ficticias solo
inicializan un almacenamiento vacio. Se conserva el nombre de clase
`InMemoryIncidentRepository` para no romper consumidores: sin adaptador mantiene su
modo de pruebas anterior; con adaptador consulta el almacenamiento persistente.
`campusOpsPersistence` expone `read()` y `savePendingChange(operation)` al flujo de
aplicacion que integre el equipo, sin HTTP en la UI.

### Entidades y versiones

El snapshot confirmado contiene `schemaVersion: 2`, `incidents: IncidentDetail[]` y
`operations: PendingIncidentOperation[]`. Se reutilizan los tipos de
`src/campusops/domain/incident.ts` y `src/campusops/contracts.ts`.
Una incidencia conserva id, titulo, categoria, estado, prioridad, ubicacion,
descripcion, roles y version. Cada operacion referencia una incidencia existente y
conserva `operationId`, `incidentId`, `actorId`, `action`, `payload` y `baseVersion`.
La version base es la del servidor al crear la intencion, no se incrementa al migrar.
Las identidades deben ser unicas. Una identidad repetida se rechaza sin sustituir su
contenido; el algoritmo de deduplicacion de sincronizacion corresponde al companero.

El formato anterior soportado por esta migracion es un fixture explicito:
`{ schemaVersion: 1, incidents: [...], pendingOperations: [...] }`.
No se afirma que Semana 06 guardara esas incidencias: antes vivian en memoria.
La migracion renombra `pendingOperations` a `operations` y cambia solo la version de
esquema. No inventa ids ni cambia notas, autor, referencias de fotos o version base.
Formatos invalidos, referencias huerfanas y versiones futuras se rechazan conservando
el contenido original; no se reemplazan silenciosamente por datos de ejemplo.

### Escritura y recuperacion

Se elige rollback mediante journal frente a reemplazar varios registros por separado:
conserva juntos datos y cola a costa de dos copias completas y escrituras adicionales.

1. Antes de leer, recuperar cualquier journal pendiente.
2. Validar el snapshot completo y sus relaciones.
3. Guardar `{ before: <snapshot anterior o null> }` en
   `campusops_incident_rollback`.
4. Escribir el candidato completo en `campusops_incident_state`.
5. Eliminar el journal: este es el punto de confirmacion.

Si se interrumpe el paso 4 o 5, el siguiente acceso restaura `before` y elimina el
journal antes de permitir una lectura o nueva escritura. Si `before` es null,
elimina el candidato inicial no confirmado. Si la restauracion falla, propaga el
error y retiene el journal; no expone el candidato. Tras recuperar, una migracion
pendiente puede volver a ejecutarse. Cada llamada espera las anteriores sobre el
mismo adaptador; el singleton de produccion comparte dicho adaptador.
La atomicidad es logica a traves de este modulo: no deben leerse sus claves con
`getSensitiveData` para saltarse recuperacion ni escribirlas desde otro servicio.

### Comprobacion y limites

`npm test -- --ci --runInBand tests/storage/incidentStorage.test.ts` comprueba
migracion nominal; interrupcion antes de escribir; candidato escrito sin confirmar;
restauracion bloqueada; recuperacion; escritura concurrente; entradas invalidas;
integracion con servicio y repositorio; y persistencia entre dos procesos separados.
La prueba de procesos usa archivos temporales como adaptador de prueba y compara
exactamente incidencia, operationId, notas y referencia de foto antes/despues.
Los resultados y tres estados observados quedan en
`reports/week-08/migration-tests.json`.

Limitaciones que el equipo debe considerar al integrar:

- SecureStore ya era el backend disponible. Un snapshot completo con journal sirve
  para el conjunto pequeno de datos ficticios; sus limites de capacidad y escrituras
  nativas deben comprobarse en Android. No es una base para volumen ilimitado.
  Un error de capacidad se propaga y la siguiente apertura intenta rollback.
- Se asume que cada escritura/eliminacion individual del adaptador nativo es integra.
  El journal cubre interrupciones entre operaciones, no corrupcion fisica del medio.
- El bloqueo cubre un runtime y adaptador compartido, no multiples procesos nativos
  escribiendo simultaneamente. Los procesos de la prueba de reinicio son sucesivos.
- El reinicio automatizado demuestra persistencia sin memoria compartida. No se ha
  ejecutado cierre/reapertura en un dispositivo Android en esta sesion.
- La referencia `file:///pending/photo-001.jpg` es sintetica y su estado es
  `pending_upload`: no acredita captura, copia durable del archivo ni carga remota.
  El flujo de fotos del equipo debe conservar el recurso real antes de encolarlo.
- El almacenamiento no concede permisos: quien invoque `savePendingChange` debe
  comprobar la sesion y politica de roles existente. No elimina operaciones por
  timeout ni implementa confirmacion, conflicto o envio remoto.
- La UI actual consume la persistencia para lista/detalle. La pantalla para iniciar
  atencion sin conexion y el flujo completo de sincronizacion requieren integracion
  del equipo; no se presentan como terminados por esta aportacion.

Asistencia de IA: Codex ayudo en implementacion, pruebas y redaccion de esta
aportacion; la verificacion se realiza con los comandos y observaciones del reporte.
