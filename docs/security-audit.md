\# Auditoría de Seguridad — Semana 4



\## 1. Objetivo



El objetivo de esta auditoría es identificar problemas reales de seguridad, configuración y control de acceso dentro del proyecto CampusOps, utilizando como evidencia el código existente en el repositorio y datos sintéticos.



La auditoría se realiza como una actividad individual y se trabaja en una rama independiente para mantener separado el trabajo de `main`.



Los objetivos específicos son:



\- revisar los mecanismos de autenticación y autorización;

\- identificar configuraciones potencialmente inseguras;

\- revisar la aplicación de las políticas de acceso;

\- documentar evidencia técnica de los problemas encontrados;

\- corregir los problemas que puedan ser solucionados sin alterar innecesariamente la arquitectura;

\- verificar que las correcciones no rompan los contratos existentes del proyecto.



\---



\## 2. Alcance



La revisión se realizó sobre el proyecto CampusOps y se consideraron principalmente los siguientes componentes:



\- `course-backend/campusops.mjs`

\- `course-backend/server.mjs`

\- `course-backend/campusops-self-test.mjs`

\- `src/security/incidentAccessPolicy.ts`

\- `src/campusops/application/incidentQueries.ts`

\- `package.json`

\- configuración relacionada con el backend y sus dependencias.



La auditoría se limita al código y configuración disponibles en el repositorio.



Los actores, tokens, incidentes y demás información utilizados por el backend corresponden a datos sintéticos del entorno educativo.



\---



\## 3. Rama y estado inicial



Para realizar la actividad se utiliza una rama independiente:



`claudia/week-04-security-audit`



El estado inicial utilizado como referencia corresponde al commit:



`9e43ede1dda53c73a8f6da8ca17fc00bcbcaaafd`



La finalidad de utilizar una rama independiente es conservar el estado de `main` y permitir identificar claramente los cambios correspondientes a la auditoría individual.



\---



\# 4. Hallazgo 1: identidad del actor no vinculada al token



\## 4.1 Descripción



Durante la revisión de `course-backend/campusops.mjs` se identificó que el backend educativo utilizaba inicialmente un token de acceso común:



`Bearer course-valid-token`



La identidad del actor se recibía por separado mediante el header:



`X-Course-Actor`



Esto significa que la credencial utilizada para autenticar la solicitud no contenía una asociación directa con el actor que realizaba la operación.



La validación dependía de dos elementos independientes:



1\. un token de acceso;

2\. un identificador de actor proporcionado por el cliente.



\## 4.2 Evidencia del comportamiento original



El diseño original permitía utilizar el mismo token de acceso con diferentes valores del header `X-Course-Actor`.



Por ejemplo:



`Authorization: Bearer course-valid-token`



junto con:



`X-Course-Actor: reporter-1`



utilizaba el mismo token que una solicitud con:



`X-Course-Actor: coordinator-1`



Por lo tanto, el token por sí mismo no permitía determinar qué actor estaba realizando la solicitud.



\## 4.3 Impacto



En un sistema real, permitir que la identidad efectiva dependa de un identificador enviado por el cliente puede provocar una suplantación de identidad dentro de la capa de autorización.



Un cliente que pudiera modificar el identificador del actor podría intentar obtener los permisos asociados con otro actor.



Por ejemplo, un actor con permisos limitados podría intentar presentarse como un actor con permisos superiores.



\## 4.4 Contexto del proyecto



El backend analizado corresponde a un fixture educativo y utiliza actores y tokens sintéticos.



Por lo tanto, este hallazgo no se presenta como una vulnerabilidad de un sistema institucional de producción.



El problema identificado corresponde al diseño de confianza del fixture y representa un patrón que no debería trasladarse a un sistema real de autenticación.



\## 4.5 Corrección propuesta



Para solucionar el problema se creó:



`course-backend/auth-fixture.mjs`



Este módulo establece una relación explícita entre cada token sintético y el actor al que pertenece.



La relación conceptual es:



`access token -> actor`



y:



`refresh token -> actor`



De esta forma, el servidor puede determinar qué actor corresponde realmente a la credencial presentada.



La validación esperada es:



\- obtener el token del header `Authorization`;

\- resolver el actor asociado al token;

\- comparar ese actor con `X-Course-Actor`;

\- rechazar la solicitud cuando ambos valores no coincidan.



\## 4.6 Resultado esperado de la corrección



Una combinación válida debe utilizar las credenciales correspondientes al mismo actor.



Por ejemplo:



`token de reporter-1 + X-Course-Actor: reporter-1`



debe ser aceptada.



Mientras que:



`token de reporter-1 + X-Course-Actor: coordinator-1`



debe ser rechazada.



La respuesta esperada para una combinación no válida es HTTP `401 Unauthorized`.



\---



\# 5. Hallazgo 2: configuración CORS permisiva



\## 5.1 Descripción



Durante la revisión de `course-backend/server.mjs` se identificó la configuración de CORS del backend.



La configuración permite revisar el origen desde el cual pueden realizarse solicitudes al servidor.



Una configuración excesivamente permisiva puede convertirse en un problema cuando un backend deja de ejecutarse exclusivamente dentro de un entorno local y pasa a estar disponible desde otros orígenes.



\## 5.2 Riesgo



El riesgo de una política CORS demasiado amplia depende del entorno en el que se ejecute el servidor.



Mientras el backend permanezca limitado al entorno local del ejercicio, el riesgo es menor.



Sin embargo, si el servidor se expusiera a una red accesible por terceros, una política que permita cualquier origen podría ampliar innecesariamente los orígenes autorizados para realizar solicitudes.



\## 5.3 Contexto



El proyecto utiliza un backend educativo y su configuración está diseñada para el desarrollo y las pruebas del ejercicio.



Además, el backend está destinado a utilizarse dentro del entorno controlado del proyecto y no como un servicio institucional expuesto directamente a Internet.



Por este motivo, el hallazgo se documenta principalmente como un riesgo de configuración que debe controlarse si el servicio fuera desplegado en otro entorno.



\## 5.4 Tratamiento



La configuración CORS debe restringirse a los orígenes realmente necesarios cuando el backend se utilice fuera del entorno local.



No se debe interpretar esta configuración como evidencia de una vulnerabilidad de producción, debido al carácter educativo del backend.



\---



\# 6. Hallazgo 3: separación entre política de autorización y consultas de incidentes



\## 6.1 Política de autorización existente



El proyecto contiene una política de acceso en:



`src/security/incidentAccessPolicy.ts`



La función `canReadIncident` establece reglas diferentes dependiendo del rol del actor.



Las reglas contemplan:



\- `coordinator`: puede consultar los incidentes;

\- `reporter`: puede consultar los incidentes que le pertenecen;

\- `technician`: puede consultar los incidentes que tiene asignados.



La existencia de esta política demuestra que el proyecto contempla restricciones de acceso por actor.



\## 6.2 Capa de consultas



También se revisó:



`src/campusops/application/incidentQueries.ts`



En este archivo se encuentran las operaciones utilizadas para consultar incidentes.



La revisión busca determinar que las consultas no solamente obtengan información del repositorio, sino que también respeten las reglas definidas por la política de autorización.



\## 6.3 Riesgo



Existe un riesgo cuando la política de seguridad está definida en un módulo, pero las operaciones que obtienen información no la aplican antes de devolver los datos.



Esto puede producir una diferencia entre:



\- los permisos definidos por la política;

\- el comportamiento real de la consulta.



En un sistema real, esta separación podría provocar que un usuario recibiera información que no debería estar disponible para su rol.



\## 6.4 Consideración



Este hallazgo debe evaluarse mediante pruebas sobre los diferentes actores y las rutas de consulta.



La existencia de una política de autorización por sí sola no demuestra que exista una vulnerabilidad explotable; es necesario comprobar el comportamiento real de las rutas que consultan los incidentes.



\---



\# 7. Correcciones realizadas



La principal corrección implementada durante la auditoría corresponde a la asociación de credenciales sintéticas con actores.



Se creó:



`course-backend/auth-fixture.mjs`



El módulo mantiene relaciones entre tokens y actores para evitar que una misma credencial represente indistintamente a diferentes identidades.



La corrección está diseñada para mantener el comportamiento educativo del backend utilizando exclusivamente información sintética.



No se modificaron funcionalidades que no estuvieran relacionadas con el problema de autenticación.



\---



\# 8. Verificación inicial



Antes de realizar las modificaciones se verificó el estado funcional del proyecto.



Se ejecutó:



`npm run typecheck`



Resultado:



`PASS`



También se ejecutó:



`npm run lint`



Resultado:



`PASS`



Finalmente se ejecutó:



`npm run backend:self-test`



Resultado:



`CampusOps backend contracts: roles, reassignment conflict, lost response, idempotency, evidence and geocoding PASS.`



`Controlled backend self-test passed.`



Estas pruebas establecen el estado funcional de referencia antes de las modificaciones.



\---



\# 9. Verificación de seguridad



La corrección del problema de identidad debe comprobar que el actor asociado al token corresponda con el actor indicado por la solicitud.



La prueba de seguridad debe contemplar al menos los siguientes escenarios:



\### Escenario válido



Token perteneciente a `reporter-1`:



`Authorization: Bearer <token-de-reporter-1>`



Actor:



`X-Course-Actor: reporter-1`



Resultado esperado:



`200 OK`



\### Escenario inválido



Token perteneciente a `reporter-1`:



`Authorization: Bearer <token-de-reporter-1>`



Actor:



`X-Course-Actor: coordinator-1`



Resultado esperado:



`401 Unauthorized`



Esta prueba permite comprobar que cambiar únicamente el actor ya no permite utilizar las credenciales de otro usuario.



\---



\# 10. Datos sintéticos



La auditoría utiliza exclusivamente datos sintéticos.



Entre los actores utilizados por el fixture se encuentran:



\- `reporter-1`

\- `reporter-2`

\- `technician-1`

\- `technician-2`

\- `coordinator-1`



Los tokens utilizados para las pruebas son tokens sintéticos generados exclusivamente para el entorno educativo.



No se utilizaron:



\- contraseñas reales;

\- API keys reales;

\- credenciales personales;

\- información personal real;

\- información institucional confidencial.



\---



\# 11. Integridad del proyecto



Los cambios de la auditoría se mantienen aislados en:



`claudia/week-04-security-audit`



El objetivo es evitar modificaciones directas sobre `main` y conservar un historial identificable de los cambios realizados durante la actividad.



Los cambios deben limitarse a los archivos necesarios para solucionar o documentar los problemas encontrados.



No se deben realizar refactorizaciones generales ni modificaciones no relacionadas con la auditoría.



\---



\# 12. Limitaciones



El backend revisado es un fixture educativo.



Los mecanismos de autenticación, actores y tokens están diseñados para realizar pruebas controladas y no constituyen un sistema institucional de autenticación.



Por esta razón, los hallazgos deben interpretarse dentro del alcance del ejercicio.



En particular, el problema de vinculación entre token y actor se considera un problema de diseño del fixture y un patrón inseguro para sistemas reales, pero no constituye por sí mismo evidencia de una vulnerabilidad en una plataforma institucional.



\---



\# 13. Conclusión



La auditoría permitió identificar tres áreas que requieren atención:



1\. la vinculación entre las credenciales y la identidad del actor;

2\. la configuración CORS del backend;

3\. la aplicación efectiva de las políticas de autorización en las consultas de incidentes.



El cambio principal realizado consiste en introducir una relación explícita entre los tokens sintéticos y los actores mediante `course-backend/auth-fixture.mjs`.



La verificación final debe confirmar que las credenciales válidas continúan funcionando y que una credencial asociada a un actor no puede utilizarse para representar a otro.



La auditoría se mantiene dentro de la rama:



`claudia/week-04-security-audit`



y utiliza exclusivamente datos sintéticos.

