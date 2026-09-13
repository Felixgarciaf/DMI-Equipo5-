# ADR-001 — Arquitectura interna de CampusOps

## Estado

Aceptada para Semana 02.

## Contexto

CampusOps debe crecer hacia incidencias, sesión, almacenamiento local y proveedores de ubicación sin que la interfaz móvil dependa de detalles de HTTP, persistencia o SDK externos. Esta semana el alcance ejecutable se limita a una lista y detalle de incidencias con datos ficticios en memoria, pero el diseño debe dejar claros los límites que permitirán sustituir proveedores en semanas posteriores.

## Alternativas consideradas

### Alternativa A: pantallas con acceso directo a datos y proveedores

Las pantallas importarían el origen de datos concreto, por ejemplo un arreglo en memoria hoy y un cliente HTTP o almacenamiento local después. Esta opción es rápida para una pantalla pequeña y reduce archivos iniciales, pero acopla UI con infraestructura. Probar reglas de incidencias exige renderizar componentes o simular detalles externos, y cambiar el proveedor obliga a tocar pantallas.

### Alternativa B: capas UI, application, domain e infrastructure

La UI sólo presenta estado y llama casos de uso de aplicación. Application coordina consultas y depende de contratos del dominio. Domain define modelos y puertos como `IncidentRepository`, además de límites previstos para sesión, persistencia y ubicación. Infrastructure implementa esos puertos con un fake determinista en memoria. Esta opción agrega más archivos, pero permite probar límites con imports reales y reemplazar el fake sin rehacer las pantallas.

## Decisión

Elegimos la alternativa B: una arquitectura por límites con dependencias dirigidas `UI -> application -> domain <- infrastructure` y una composición raíz que conecta el fake de infraestructura con los casos de uso. La app ejecutable muestra lista y detalle de incidencias sintéticas; sesión, persistencia y ubicación quedan representadas como puertos previstos, sin implementación real esta semana.

## Consecuencias y trade-off

El beneficio principal es testabilidad: `tools/check-architecture-boundaries.mjs` puede revisar que UI y application no importen infraestructura, y los casos de uso pueden recibir cualquier implementación de `IncidentRepository`. También baja el costo de cambiar proveedor porque el fake en memoria puede sustituirse por HTTP, SQLite o un SDK detrás del mismo contrato.

El costo es mayor complejidad inicial: hay más carpetas y una composición raíz aunque el flujo actual sea pequeño. Aceptamos ese costo porque Semana 02 pide que el dibujo y el código soporten cambios futuros sin reescribir pantallas, y porque evita esconder decisiones de arquitectura dentro de componentes visuales.

## Comprobación

- `npm run typecheck`
- `npm run lint`
- `npm run test:smoke`
- `npm test -- --ci --runInBand course-tests/public/week-02.test.ts`
- `node tools/check-architecture-boundaries.mjs`

