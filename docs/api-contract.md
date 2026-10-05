CampusOps — API Contract
1. Propósito
Este documento describe el contrato de integración utilizado por el cliente CampusOps durante la Semana 5.
El objetivo es establecer una frontera explícita entre:
- los datos recibidos desde el backend;
- la validación del contrato remoto;
- los objetos que puede utilizar la aplicación;
- las respuestas válidas con payload: null;
- las respuestas malformadas;
- los errores controlados del cliente;
- y los escenarios reproducibles mediante el backend didáctico.
El cliente no debe asumir que una respuesta remota es válida solamente porque contiene JSON. La respuesta debe pasar primero por la validación del contrato.
2. Backend didáctico
El backend de pruebas se ejecuta mediante:
make run-backend
La comprobación del backend se realiza mediante:
npm run backend:self-test
La dirección predeterminada es:
http://127.0.0.1:4310
Para Android Emulator:
http://10.0.2.2:4310
En un dispositivo físico se utiliza la IP de desarrollo autorizada mediante COURSE_BACKEND_HOST, únicamente dentro de la red de laboratorio.
El simulador no debe exponerse a Internet.
Los actores públicos disponibles para las pruebas son:
- reporter-1
- reporter-2
- technician-1
- technician-2
- coordinator-1
Estos identificadores son fixtures públicos de prueba y no representan matrículas ni credenciales reales.
3. Contrato de sesión utilizado en pruebas
La sesión sintética se obtiene mediante:
POST /v1/session/login
Ejemplo:
{
  "actorId": "technician-1"
}
Las rutas de CampusOps utilizan:
Authorization: Bearer course-valid-token
X-Course-Actor: technician-1
Los valores anteriores son fixtures públicos del backend didáctico. No representan secretos ni autenticación de producción.
La aplicación no debe confiar en un rol enviado por el cliente como mecanismo de autorización.
4. Recursos principales
4.1 Listado de incidencias
GET /v1/incidents
La respuesta utiliza el siguiente envoltorio:
{
  "items": [
    {}
  ]
}
La visibilidad depende del actor:
- el reportante consulta sus reportes;
- el técnico consulta sus asignaciones;
- el coordinador consulta todas las incidencias.
4.2 Detalle de una incidencia
GET /v1/incidents/:id
Devuelve el DTO de una incidencia que sea visible para el actor autenticado.
El cliente debe tratar esta respuesta como información remota y validarla antes de utilizarla en una operación de dominio.
4.3 Crear una incidencia
POST /v1/incidents
El reportante puede crear una incidencia cuando proporciona:
- una categoría válida;
- una descripción no vacía;
- una ubicación textual.
La operación requiere una clave de idempotencia estable:
Idempotency-Key: <stable-key>
La clave permite distinguir una repetición de la misma operación de una operación nueva.
4.4 Acciones sobre una incidencia
POST /v1/incidents/:id/actions
La solicitud utiliza información como:
{
  "action": "start",
  "baseVersion": 1
}
La solicitud requiere también:
Idempotency-Key: <stable-key>
El backend puede responder:
409
cuando existe una versión obsoleta o una reutilización de la clave de idempotencia con contenido diferente.
Puede responder:
403
cuando el rol o la asignación del actor no permite realizar la acción.
4.5 Geocodificación
GET /v1/geocoding?q=...
El backend didáctico utiliza un doble determinista del proveedor.
La respuesta tiene la forma:
{
  "label": "Campus UTT",
  "latitude": 18.46,
  "longitude": -97.39
}
No se consulta un proveedor externo real durante estas pruebas.
5. DTO remoto de Semana 5
La frontera evaluada durante la Semana 5 es:
{id, version, status, payload}
Una respuesta válida debe cumplir todas las siguientes condiciones:
id
Debe ser un string no vacío.
version
Debe ser un número entero no negativo.
status
Debe ser un string no vacío.
payload
Debe ser:
- un objeto; o
- null.
Los campos adicionales del sobre se ignoran para permitir compatibilidad hacia adelante.
Ejemplo válido:
{
  "id": "campus-inc-001",
  "version": 2,
  "status": "assigned",
  "payload": {
    "category": "connectivity",
    "description": "Falla ficticia"
  }
}
6. Diferencia entre datos remotos y objetos de la aplicación
Los datos recibidos desde el backend se consideran información externa hasta que pasan por la frontera de validación.
El flujo esperado es:
Backend
   |
   v
Respuesta desconocida
   |
   v
parseRemoteResource()
   |
   +---- inválida ----> error de contrato
   |
   v
DTO validado
   |
   v
Validación de dominio
   |
   v
Operación de la aplicación
La interfaz de usuario no debe realizar directamente solicitudes HTTP ni asumir que una respuesta remota tiene la estructura esperada.
La lógica de cliente debe actuar como frontera entre el transporte remoto y el dominio de la aplicación.
7. payload: null es válido
Una respuesta puede tener:
{
  "id": "r-2",
  "version": 3,
  "status": "closed",
  "payload": null
}
Esta respuesta es válida porque payload puede ser un objeto o null.
Sin embargo, payload: null no autoriza al cliente a inventar información.
Por ejemplo, el cliente no debe generar automáticamente:
{
  "category": "unknown",
  "description": "Sin información"
}
para sustituir el contenido que no fue enviado.
El valor null debe conservarse como parte del resultado validado.
8. Respuesta completa null
Una respuesta completa:
null
no representa un DTO válido.
Debe producir un resultado de error de contrato:
ok: false
error.kind: contract
Por lo tanto, existen dos casos diferentes:
Caso	Resultado
payload: null dentro de un sobre válido	Respuesta válida
respuesta completa null	Error de contrato


Esta diferencia es parte de la frontera DTO de Semana 5.
9. Respuestas malformadas
El cliente debe rechazar respuestas que no cumplan el contrato.
ID vacío
{
  "id": "",
  "version": 1,
  "status": "open",
  "payload": null
}
Resultado:
ok: false
error: contract
Versión con tipo incorrecto
{
  "id": "r-3",
  "version": "3",
  "status": "open",
  "payload": null
}
Resultado:
ok: false
error: contract
Respuesta completamente nula
null
Resultado:
ok: false
error: contract
Estas condiciones deben rechazarse sin provocar excepciones no controladas.
10. Tipos de error del cliente
Las respuestas de error se distinguen mediante tipos explícitos.
Error de contrato
kind: contract
Representa una respuesta remota que no cumple el DTO publicado.
Timeout
kind: timeout
Representa que la operación superó el tiempo máximo establecido.
Respuesta lenta
kind: slow_response
Representa una respuesta que supera el umbral esperado de tiempo.
Puede conservar información como:
timeoutMs
observedMs
Error HTTP 500
kind: http
status: 500
Representa un error del servidor.
Rate limit
kind: rate_limited
status: 429
Puede conservar:
retryAfterMs
para permitir que la aplicación determine el comportamiento posterior.
11. Escenarios controlados de prueba
El backend didáctico proporciona escenarios deterministas mediante:
X-Course-Scenario
Los escenarios relevantes para Semana 5 son:
Escenario	Comportamiento esperado
success	DTO válido
nullable	DTO válido con payload: null
malformed	Error de contrato
timeout	Error timeout
server_error	Error HTTP 500
rate_limited	Error 429
slow	Error slow_response


Estos escenarios permiten repetir las pruebas sin depender de Internet público ni de cuentas de proveedores externos.
12. Casos de prueba de Semana 5
La frontera parseRemoteResource debe aceptar:
{
  "id": "campus-inc-001",
  "version": 2,
  "status": "assigned",
  "payload": {
    "category": "connectivity",
    "description": "Falla ficticia"
  }
}
También debe aceptar:
{
  "id": "r-2",
  "version": 3,
  "status": "closed",
  "payload": null,
  "ignored": "forward-compatible"
}
Debe rechazar:
{
  "id": "",
  "version": 1,
  "status": "open",
  "payload": null
}
Debe rechazar:
{
  "id": "r-3",
  "version": "3",
  "status": "open",
  "payload": null
}
Y debe rechazar:
null
La prueba pública de Semana 5 verifica estos casos mediante:
course-tests/public/week-05.test.ts
Las pruebas adicionales de manejo de respuestas se ejecutan mediante:
tests/cloud/remoteResource.test.ts
Comando de reproducción:
npm test -- --ci --runInBand tests/cloud/remoteResource.test.ts course-tests/public/week-05.test.ts
Resultado observado en la integración de Semana 5:
Test Suites: 2 passed, 2 total
Tests:       19 passed, 19 total
13. Reglas de seguridad y pruebas
Los escenarios de prueba utilizan datos sintéticos.
No se requieren:
- cuentas de proveedores reales;
- credenciales reales;
- secretos;
- Internet público.
Los logs y evidencias deben evitar información sensible.
Los fixtures del backend son datos públicos de prueba y no deben confundirse con credenciales reales.
14. Regla de integración
La validación del contrato se concentra en la capa de cliente.
La implementación de Semana 5 utiliza:
src/campusops/cloud/remoteResource.ts
como ubicación de la lógica de validación del recurso remoto.
La API evaluable mantiene la función:
src/course-evaluation/index.ts
y delega la validación a la lógica de CampusOps.
De esta manera se evita mantener dos implementaciones diferentes de parseRemoteResource.
15. Criterio de aceptación
La integración se considera correcta cuando:
1. las respuestas válidas son aceptadas;
2. payload: null se conserva como valor válido;
3. una respuesta completa null se rechaza;
4. las respuestas malformadas se rechazan como errores de contrato;
5. timeout, respuesta lenta, HTTP 500 y 429 se distinguen;
6. las pruebas pueden ejecutarse con datos controlados;
7. las pruebas no dependen de Internet público;
8. no se producen excepciones no controladas ante respuestas inválidas.
La evidencia de estos escenarios se registra en los reportes de Semana 5.