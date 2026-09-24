# Auditoria de seguridad - Semana 4

Estudiante: Cesar Gaspar Pacheco

| # | Hallazgo | Riesgo | Solucion aplicada | Evidencia |
|---|---|---|---|---|
| 1 | `src/course-evaluation/index.ts` no implementaba `redactForTelemetry`; lanzaba una excepcion antes de ocultar tokens, correos, nombres, ubicacion o evidencia. | Si telemetria o logs invocan esta funcion, los datos sensibles quedan sin sanitizar o se expone un error tecnico en lugar de datos redactados. | Se implemento redaccion recursiva para objetos y listas, normalizando claves con guion o guion bajo y sustituyendo campos sensibles por `[REDACTED]`. | [redact-telemetry-test.txt](evidence/redact-telemetry-test.txt), [redact-telemetry-diff.txt](evidence/redact-telemetry-diff.txt) |
| 2 | `course-backend/server.mjs` enviaba `access-control-allow-origin: *` en todas las respuestas. | Cualquier origen web podia leer respuestas del backend didactico si el servicio local estaba abierto, aumentando exposicion de incidencias sinteticas y tokens fixture. | Se agrego `COURSE_ALLOWED_ORIGIN` con valor por defecto `http://localhost:8081`, header `Vary: Origin` y `.env.example` con nombres de variables sin valores reales. | [backend-self-test.txt](evidence/backend-self-test.txt), [backend-auth-cors-diff.txt](evidence/backend-auth-cors-diff.txt), [env-example-diff.txt](evidence/env-example-diff.txt) |
| 3 | `POST /v1/resources/action` modificaba estado con solo `Idempotency-Key`, sin validar `Authorization`. | Un cliente no autenticado podia crear/repetir operaciones sobre el recurso de prueba si conocia la ruta local. | Se exige `Authorization: Bearer course-valid-token` antes de validar idempotencia o escribir en `completedOperations`, y el self-test comprueba rechazo 401 sin token. | [backend-self-test.txt](evidence/backend-self-test.txt), [backend-auth-cors-diff.txt](evidence/backend-auth-cors-diff.txt) |

## Hallazgo 1 - Telemetria sin redaccion efectiva

### Problema encontrado

En `src/course-evaluation/index.ts`, la funcion publica `redactForTelemetry` estaba definida pero solo delegaba en `pending('redactForTelemetry')`. El contrato en `docs/CAMPUSOPS_API.md` exige ocultar `authorization`, `password`, `token`, `accessToken`, `email`, `displayName`, `location`, `photos`, `internalComments` y otros campos sensibles.

### Riesgo

La aplicacion no tenia una barrera real antes de enviar o registrar telemetria. Cualquier objeto con token, correo, nombre, ubicacion o evidencia podia quedar completo si otra capa registraba el dato crudo, o podia terminar mostrando una excepcion tecnica.

### Solucion

Se agrego una lista central de claves sensibles, normalizacion de claves (`access_token`, `access-token` y `accessToken` caen en la misma regla) y recorrido recursivo de objetos/listas sin mutar la entrada.

### Antes

```ts
export function redactForTelemetry(_input: unknown): unknown {
  return pending('redactForTelemetry');
}
```

### Despues

```ts
export function redactForTelemetry(input: unknown): unknown {
  if (Array.isArray(input)) {
    return input.map((item) => redactForTelemetry(item));
  }
  if (input && typeof input === 'object') {
    return Object.fromEntries(
      Object.entries(input).map(([key, value]) => [
        key,
        TELEMETRY_SENSITIVE_KEYS.has(normalizeTelemetryKey(key))
          ? TELEMETRY_REDACTED_VALUE
          : redactForTelemetry(value),
      ]),
    );
  }
  return input;
}
```

### Evidencia

Ver [redact-telemetry-test.txt](evidence/redact-telemetry-test.txt) y [redact-telemetry-diff.txt](evidence/redact-telemetry-diff.txt).

## Hallazgo 2 - CORS abierto para cualquier origen

### Problema encontrado

En `course-backend/server.mjs`, `send()` respondia siempre con `access-control-allow-origin: *`.

### Riesgo

Aunque el backend es didactico, si se ejecuta durante desarrollo cualquier sitio abierto en el navegador podria leer respuestas permitidas por CORS. Eso aumenta la exposicion de datos de incidencias sinteticas, cabeceras y flujos de autenticacion fixture.

### Solucion

Se reemplazo el comodin por `COURSE_ALLOWED_ORIGIN`, con default local para Expo, y se agrego `Vary: Origin`. Tambien se documento en `course-backend/README.md` y se agrego `COURSE_ALLOWED_ORIGIN=` en `.env.example` sin valor real.

### Antes

```js
response.writeHead(status, {
  'access-control-allow-origin': '*',
  'content-type': typeof body === 'string' ? 'application/json' : 'application/json; charset=utf-8',
  ...headers,
});
```

### Despues

```js
const allowedOrigin = process.env.COURSE_ALLOWED_ORIGIN ?? 'http://localhost:8081';

response.writeHead(status, {
  'access-control-allow-origin': allowedOrigin,
  'vary': 'Origin',
  'content-type': typeof body === 'string' ? 'application/json' : 'application/json; charset=utf-8',
  ...headers,
});
```

### Evidencia

Ver [backend-self-test.txt](evidence/backend-self-test.txt), [backend-auth-cors-diff.txt](evidence/backend-auth-cors-diff.txt) y [env-example-diff.txt](evidence/env-example-diff.txt).

## Hallazgo 3 - Accion de recurso sin autorizacion

### Problema encontrado

En `course-backend/server.mjs`, `POST /v1/resources/action` validaba `Idempotency-Key` y escribia en `completedOperations`, pero no comprobaba `request.headers.authorization` antes de modificar estado.

### Riesgo

Una solicitud sin autenticacion podia ejecutar una accion sobre `resource-1`. Aunque el dato es sintetico, el patron es peligroso: una ruta de escritura no debe depender solo de idempotencia para controlar acceso.

### Solucion

Se agrego validacion del bearer fixture antes de procesar la operacion, y el self-test ahora primero llama sin token y espera 401 antes de confirmar el flujo autorizado.

### Antes

```js
if (request.method === 'POST' && url.pathname === '/v1/resources/action') {
  const key = request.headers['idempotency-key'];
  if (typeof key !== 'string' || key.length < 8) return send(response, 400, { code: 'idempotency_key_required' });
```

### Despues

```js
if (request.method === 'POST' && url.pathname === '/v1/resources/action') {
  if (request.headers.authorization !== 'Bearer course-valid-token') {
    return send(response, 401, { code: 'unauthorized' });
  }
  const key = request.headers['idempotency-key'];
  if (typeof key !== 'string' || key.length < 8) return send(response, 400, { code: 'idempotency_key_required' });
```

### Evidencia

Ver [backend-self-test.txt](evidence/backend-self-test.txt) y [backend-auth-cors-diff.txt](evidence/backend-auth-cors-diff.txt).

## Verificacion final

- `npm test -- --ci --runInBand course-tests/public/week-04.test.ts`: pasa.
- `npm run backend:self-test`: pasa.
- `npm run typecheck`: pasa.
- `git status --short` se guardo en [git-status-no-env.txt](evidence/git-status-no-env.txt); no aparece `.env`.
