# Modelo de amenazas — CampusOps

## Alcance

Este modelo usa datos sintéticos y cubre los riesgos de seguridad iniciales de CampusOps para incidencias, asignaciones, sesión, registros y configuración. La relación principal es: Activo -> Amenaza -> Control -> Verificación -> Riesgo residual.

## Activos y fronteras de confianza

| Activo | Por qué importa | Frontera de confianza |
|---|---|---|
| Incidencias de CampusOps | Contienen estado operativo, ubicación aproximada y evidencia del reporte. | App móvil -> casos de uso -> repositorio o API futura. |
| Asignaciones de trabajo | Determinan qué técnico atiende cada incidencia y quién puede modificarla. | Coordinación -> servicio de aplicación -> almacenamiento. |
| Información operativa y datos de sesión | Incluye identificadores de actores, tokens futuros y estados de sesión. | App móvil -> telemetría, logs locales y CI. |
| Credenciales y secretos de configuración | Permiten acceso a servicios de terceros o automatización del repositorio. | Repositorio -> GitHub Actions -> proveedores externos. |

## Amenazas priorizadas

| Prioridad | Activo | Amenaza | Control | Verificación | Riesgo residual |
|---:|---|---|---|---|---|
| 1 | Incidencias de CampusOps | Consultar incidencias ajenas mediante un ID conocido o manipulado. | Control de acceso por usuario y rol antes de entregar el detalle: reportante solo ve sus incidencias, técnico solo sus asignadas y coordinación puede auditar. | Prueba `tests/security/incidentAccessPolicy.test.ts` con `npm test -- --ci --runInBand tests/security/incidentAccessPolicy.test.ts`; comprueba que `reporter-2` no puede leer `campus-inc-101` de `reporter-1`. | Aún falta aplicar la política al backend real cuando exista la API autenticada; esta semana queda como regla verificable y reutilizable. |
| 2 | Asignaciones de trabajo | Alterar asignaciones sin autorización, por ejemplo reasignar una incidencia desde un rol no coordinador. | Autorizar operaciones de modificación por rol y validar que la transición venga de un caso de uso permitido. | Prueba futura de intento de modificación no autorizada contra el caso de uso de asignación; debe devolver rechazo sin cambiar el estado. | Persisten errores de configuración si un endpoint futuro omite llamar al caso de uso autorizado. |
| 3 | Información operativa y datos de sesión | Filtrar información mediante logs, incluyendo tokens, credenciales o datos sensibles de incidencias. | No registrar secretos ni payloads completos; registrar solo IDs sintéticos, estados y mensajes sanitizados. | Revisión de logs y prueba futura de sanitización que confirme que campos como `token`, `authorization` o `password` se redactan antes de telemetría. | Puede quedar texto sensible en errores de librerías externas si no se normalizan antes de registrarlos. |
| 4 | Credenciales y secretos de configuración | Exponer credenciales en el repositorio, workflow o variables `EXPO_PUBLIC_*`. | Secret scanning en CI, permisos mínimos del workflow y secretos fuera del código fuente. | Workflow `.github/workflows/week-03-ci-amenazas-feedback.yml` ejecuta gitleaks y usa `permissions: contents: read`; la verificación falla si se introduce un secreto conocido. | El escaneo reduce el riesgo en Git, pero no sustituye rotación de credenciales si una clave real se publica por accidente. |

## Amenaza atendida primero

Atendemos primero la consulta de incidencias ajenas porque es el abuso más directo contra la confidencialidad del sistema: basta conocer o adivinar un identificador para intentar abrir información que pertenece a otra persona. El control elegido es una política de autorización pequeña y probada que se puede invocar desde los casos de uso antes de devolver detalles de una incidencia.

La verificación ya es ejecutable: `tests/security/incidentAccessPolicy.test.ts` demuestra el caso negativo y los tres casos permitidos. Así el control no queda solo documentado; si alguien relaja la regla y permite que cualquier reportante lea cualquier incidencia, la prueba falla.
