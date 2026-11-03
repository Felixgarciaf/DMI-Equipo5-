# Política de resiliencia y ubicación manual

## 1. Arquitectura de integración

La geocodificación se implementa en `GeocodingLocationAdapter`, que implementa `LocationProviderPort`; la caché se encapsula en `LocationCache`. La pantalla `IncidentExplorerScreen` recibe el puerto desde `bootstrap.ts` y ofrece una captura interactiva. El flujo es:

1. La persona usuaria ingresa una consulta opcional y una referencia manual obligatoria en `IncidentExplorerScreen`.
2. La acción de resolver invoca `LocationProviderPort.resolveIncidentLocation`; la acción manual envía una consulta vacía y no requiere conexión.
3. El adaptador valida la respuesta del proveedor. Si es válida, devuelve `source: 'provider'` junto con `label`, `latitude` y `longitude`.
4. Ante respuesta no disponible o inválida, devuelve `source: 'manual'` y la referencia ingresada, sin coordenadas.
5. La pantalla muestra el resultado asociado a la incidencia seleccionada. El resultado es un borrador de interfaz: el repositorio actual no ofrece una operación para crear o actualizar incidencias, por lo que la selección no se guarda ni se envía al backend.
6. `selectIncidentLocation(provider, manualLabel)` reutiliza la misma validación para el contrato de evaluación. Rechaza una etiqueta manual vacía.

El diseño separa la validación del proveedor de la presentación y hace explícita la limitación actual de persistencia del flujo de pantalla.

## 2. Proveedor de geocodificación y límites

El proveedor del curso no consulta servicios reales de mapas ni una red pública. Se simula con el backend didáctico `course-backend/server.mjs` y responde en `/v1/geocoding?q=...`.

La validación exige que el resultado:

- sea un objeto no nulo;
- tenga `label` textual no vacío;
- tenga `latitude` numérica finita y entre `-90` y `90`;
- tenga `longitude` numérica finita y entre `-180` y `180`.

Cualquier dato que no cumpla estas condiciones se considera no usable.

## 3. Diferencia entre proveedor simulado y proveedor real

El escenario del curso es un doble controlado de un proveedor real. El servidor simulado puede devolver escenarios como `success`, `nullable`, `malformed`, `rate_limited`, `server_error`, `invalid_coordinates`, `incomplete` y `timeout_after_commit`.

Esto permite verificar el comportamiento de resiliencia sin depender de un servicio externo. No constituye evidencia de integración con un proveedor real. Una integración real debe vigilar:

- timeouts por red;
- errores de servidor y saturación;
- JSON malformado;
- coordenadas no válidas;
- pérdida de respuesta y reintento seguro.

La simulación no reemplaza la validación de un proveedor de producción, pero sí proporciona una prueba reproducible para la semana.

## 4. Caché, expiración y criterios de reutilización

La caché de ubicación usa una clave normalizada por texto (`trim + lowercase + espacios normalizados`) y guarda el resultado válido con TTL. La política es:

- `LocationCache` almacena solo ubicaciones con coordenadas válidas;
- cada entrada expira según `defaultTtlMs`;
- una consulta repetida dentro de TTL evita una segunda solicitud HTTP;
- si la entrada expira, se vuelve a consultar el proveedor;
- entradas inválidas o fallidas no se cachean.

Esto reduce solicitudes redundantes y mantiene la respuesta del proveedor estable durante el periodo de validez.

## 5. Manejo de errores y timeouts

El adaptador de geocodificación usa `AbortController` con timeout configurable. Si el proveedor tarda demasiado, responde con `429` o `500`, devuelve JSON malformado o hay una desconexión, el adaptador entrega un resultado no disponible; la normalización selecciona la referencia manual. La pantalla también expone mediante un mensaje accesible cualquier excepción inesperada del puerto.

El criterio central es no inventar coordenadas cuando el proveedor no puede ofrecer una respuesta confiable. La reserva manual es el valor de seguridad.

## 6. Alternativa manual

La alternativa manual se representa con `{ source: 'manual', label: manualLabel }` y no tiene coordenadas. La pantalla rechaza etiquetas vacías antes de invocar el puerto; `selectIncidentLocation` también lanza `RangeError` si la etiqueta está vacía. No se sustituye la referencia por una etiqueta ficticia.

La alternativa manual no sustituye la validación del proveedor; cubre el caso en que la resolución automática no es fiable o no está disponible.

## 7. Política de reintentos

La política de reintentos del cliente HTTP se centra en dos reglas:

- limitar el total a cuatro envíos y detener los reintentos desde el intento 4;
- permitir reintentos de `POST` únicamente con una clave de idempotencia estable.

`planRetry` delega en la misma política usada por el cliente HTTP. El backoff exponencial predeterminado es de 250, 500 y 1000 ms entre los cuatro envíos como máximo. `Retry-After` válido es un límite inferior para la espera; los valores no válidos no sustituyen el backoff.

## 8. Backoff y límites de intentos

La lógica de reintentos es segura cuando:

- `attempt` es entero y está dentro del presupuesto configurado;
- `GET` puede reintentarse ante timeout y estados transitorios; `429` respeta `Retry-After` válido;
- timeout transitorio se reintenta solo si no se excede el límite de cuatro envíos;
- `POST` sin `idempotencyKey` estable se bloquea antes de realizar la solicitud.

Cada reintento de `POST` conserva la misma clave y el mismo cuerpo serializado. La operación que quizá se completó pese a perderse la respuesta se repite con esa identidad para que el servidor reconozca el duplicado.

## 9. Tratamiento de HTTP 429 y `Retry-After`

Cuando la respuesta HTTP es `429`, el cliente interpreta `Retry-After` como segundos o fecha HTTP y aplica al menos esa espera cuando el valor es válido. Si el valor no es válido, aplica el backoff definido por la política.

Esto previene rachas de reintento sin control y convierte los errores de tasa en una señal de recuperación gestionada.

## 10. Idempotencia

La operación de escritura usa una clave estable de idempotencia. Reutilizar la misma clave con contenido distinto produce un conflicto. La regla protege la consistencia del historial de incidentes y evita duplicar una operación que se repita tras perderse la respuesta.

El backend didáctico conserva las claves y huellas de contenido en memoria mediante un `Map`; esos registros no sobreviven al reinicio del proceso. No existe persistencia duradera de idempotencia.

## 11. Recuperación ante pérdida de respuesta

Si una operación se pierde en la red después de que el servidor ya aplicó el cambio, el cliente puede repetir la operación con la misma clave idempotente. El servidor reconoce la operación previa y no duplica el historial.

La recuperación exige conservar la misma clave y el mismo contenido. Reutilizar una clave con otro contenido se rechaza; generar una clave distinta no permite reconocer que se trata de la operación ya procesada.

## 12. Prevención de duplicados

La prevención de duplicados se realiza en varios niveles:

- cada operación de escritura conserva una clave estable;
- no se reintenta `POST` sin esa clave;
- respuestas repetidas con la misma clave y contenido se reconocen como la misma operación;
- la caché de geocodificación reutiliza valores válidos dentro del TTL para evitar solicitudes redundantes.

## 13. Límites y riesgos residuales

Los riesgos residuales principales son:

- el backend de demostración usa memoria en proceso, no almacenamiento persistente;
- no hay integración real con un proveedor externo de geocodificación;
- las respuestas de error y timeout se simulan para las pruebas automatizadas;
- la captura de ubicación se muestra como borrador en la pantalla; la aplicación actual no incluye una operación de creación/actualización que la persista.

Estos límites deben considerarse al evaluar el alcance: la simulación permite pruebas reproducibles, pero no demuestra una integración de producción ni persistencia del borrador de interfaz.

## 14. Pruebas que verifican cada comportamiento

| Escenario | Comportamiento esperado | Prueba asociada | Resultado observado |
|---|---|---|---|
| Proveedor válido o respuesta inválida | Se conserva la ubicación del proveedor solo si etiqueta y coordenadas cumplen el contrato; de lo contrario, se usa la referencia manual sin coordenadas | `tests/week-09/location-adapter.test.ts` | PASS; suite incluida en la ejecución de 6 suites y 57 pruebas |
| Respuesta incompleta, JSON malformado, HTTP 429/500, timeout o desconexión | Se selecciona la referencia manual y no se almacena una respuesta inválida | `tests/week-09/location-adapter.test.ts` | PASS; suite incluida en la ejecución de 6 suites y 57 pruebas |
| Captura manual en la interfaz | Se valida la etiqueta, se invoca el puerto con consulta vacía y se muestra el resultado en el detalle seleccionado sin coordenadas inventadas | `tests/week-09/location-capture.test.tsx` | PASS: 4 pruebas de interfaz |
| Ubicación válida desde la interfaz | Se presenta la etiqueta y las coordenadas del proveedor didáctico | `tests/week-09/location-capture.test.tsx` | PASS; verificada dentro de las 4 pruebas de interfaz |
| Fallo HTTP del proveedor en la interfaz | La pantalla muestra la referencia manual devuelta por el adaptador y no presenta coordenadas | `tests/week-09/location-capture.test.tsx` | PASS; respuesta 503 controlada |
| Reutilización y expiración de caché | La consulta equivalente se reutiliza dentro del TTL y vuelve a solicitarse tras su expiración | `tests/week-09/location-adapter.test.ts`, `tests/week-09/location-cache.test.ts` | PASS; suites incluidas en la ejecución de 6 suites y 57 pruebas |
| Backoff finito y `Retry-After` | Se limita a cuatro envíos; los desplazamientos temporales observados son 0, 250, 750 y 1750 ms | `tests/week-09/retry-policy.test.ts` | PASS; suite incluida en la ejecución de 6 suites y 57 pruebas |
| Respuesta perdida e idempotencia | Se repite con la misma clave y contenido, sin duplicar el historial; la clave con contenido distinto produce 409 | `tests/week-09/idempotency.test.ts`, `npm run backend:self-test` | PASS; pruebas y self-test del backend |
| `selectIncidentLocation` | Acepta coordenadas válidas, usa la etiqueta manual ante valores inválidos y rechaza etiquetas manuales vacías | `course-tests/public/week-09.test.ts` | PASS; suite incluida en la ejecución de 6 suites y 57 pruebas |

Ejecución agregada observada: `npx jest --no-watchman --cacheDirectory .jest-cache --runInBand tests/week-09 course-tests/public/week-09.test.ts` finalizó con 6 suites y 57 pruebas aprobadas. El self-test independiente del backend también terminó correctamente. La salida completa del evaluador oficial se registra en `reports/week-09/public-tests.json` y `reports/week-09/verify.json`.
