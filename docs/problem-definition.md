# Definición del problema — CampusOps

## Problema

Estudiantes y personal de un campus ficticio necesitan reportar desperfectos (fallas eléctricas, fugas y problemas de conectividad) de manera ágil. El personal de mantenimiento necesita una herramienta unificada y móvil para gestionar, atender y documentar estas incidencias, incluso en zonas del campus sin conexión a internet, evitando retrasos y desorganización en los reportes.

## Alcance

### Incluye

- Creación, seguimiento y consulta de incidencias con fotografías, categorías y ubicación.
- Asignación de tareas, cambios de estado (`open`, `assigned`, `in_progress`, `resolved`, `closed`) e historial.
- Funcionamiento sin conexión a internet para el personal técnico, con sincronización de operaciones pendientes y detección de conflictos.

### No incluye

- Un sistema de notificaciones push obligatorias, chat en tiempo real o funciones de IA.
- Una plataforma web administrativa completa, pasarela de pagos ni despliegue de emergencia real.

## Actores y responsabilidades

- **Reportante:** Crea incidencias con categoría, foto y ubicación; consulta sus propios reportes y agrega información extra de ser necesario.
- **Técnico:** Consulta sus asignaciones, inicia la atención, trabaja sin conexión, registra su diagnóstico y marca el caso como resuelto.
- **Coordinador:** Monitorea todos los casos, prioriza, asigna/reasigna técnicos, revisa la evidencia, aprueba el cierre definitivo o reabre casos.

## Flujo principal

1. Reportar: El reportante levanta una nueva incidencia desde la app (estado inicial `open`).
2. Asignar: El coordinador revisa, prioriza y designa a un técnico responsable (estado `assigned`).
3. Atender: El técnico comienza a trabajar (`in_progress`), registra sus hallazgos o evidencias y marca el trabajo finalizado (`resolved`).
4. Cerrar: El coordinador verifica la resolución y finaliza el proceso (`closed`).

## Criterios de aceptación verificables

1. Dado que un técnico está sin conexión, cuando registra notas y cambia el estado de una incidencia, entonces el cambio sobrevive si se reinicia la app y se sincroniza al recuperar la red.
2. Dado un técnico que atiende un caso offline, cuando el coordinador reasigna ese mismo caso desde el servidor, entonces al sincronizar, la app informa el conflicto conservando la nueva asignación sin perder el registro del técnico.
3. Cuando un coordinador cambia el estado de un reporte de `resolved` a `closed`, entonces el cambio queda registrado en el historial de la incidencia.
