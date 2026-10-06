# Actividad Semana 6 — Sesión Segura

## 1. Datos de la actividad

**Materia:** Desarrollo Móvil Integral  
**Actividad:** Semana 6 — Sesión Segura  
**Integrantes:** Félix, César y Claudia

## 2. Objetivo

Controlar las solicitudes concurrentes cuando vence el access token. Una sola solicitud inicia el refresh, las demás esperan su resultado y todas reintentan como máximo una vez. Si el refresh falla, se eliminan las credenciales y la aplicación pasa al estado que requiere volver a iniciar sesión.

## 3. Flujo general

**Escenario exitoso**

```text
3 solicitudes
      ↓
    3 × 401
      ↓
1 refresh compartido
      ↓
 nuevo token guardado
      ↓
 3 reintentos
      ↓
3 respuestas exitosas
```

**Escenario de error**

```text
3 solicitudes
      ↓
    3 × 401
      ↓
1 refresh compartido
      ↓
  refresh falla
      ↓
eliminar los dos tokens
      ↓
estado anónimo
      ↓
Login requerido
```

## 4. Trabajo realizado por Félix

La responsabilidad de Félix en esta integración es el refresh compartido. Al revisar el estado inicial ya existían `refreshPromise`, la lectura y persistencia segura del access token renovado, y el reintento de la solicitud original. Esa parte se conservó y se validó sin rehacerla.

La promesa compartida hace que las solicitudes concurrentes esperen el mismo refresh. El `finally` libera la promesa al terminar. Cada llamada ejecuta el reintento en un único punto y no se vuelve a llamar recursivamente si ese reintento devuelve otro 401.

## 5. Trabajo realizado por César

Se completó el camino de fallo del refresh:

- Un refresh rechazado o con respuesta inválida propaga el error a las solicitudes que esperan la misma promesa.
- Se eliminan `accessToken` y `refreshToken` del almacenamiento seguro.
- La sesión cambia al estado `anonymous`; el estado queda publicado para los componentes suscritos.
- La promesa compartida se libera con `finally`; una llamada posterior sin access token no puede iniciar otro refresh.
- Si el único reintento también responde 401, se cierra la sesión sin iniciar otro refresh.
- La aplicación muestra “Login requerido” al recibir el estado anónimo.

La aplicación existente no tenía una pantalla ni un formulario de Login. Esta entrega implementa la transición visible al estado que requiere volver a iniciar sesión; no presenta un formulario de autenticación nuevo.

## 6. Trabajo realizado por Claudia

La responsabilidad de Claudia es integrar y comprobar las solicitudes concurrentes. La prueba de Semana 6 inicia tres solicitudes con `Promise.all`, controla el momento en que concluye el refresh y verifica los tres 401, el único refresh, el token nuevo guardado y los tres reintentos exitosos.

Se extendieron esas pruebas para cubrir el refresh fallido, la eliminación de ambas credenciales, el estado anónimo y la protección contra un segundo refresh tras un 401 del reintento. También se comprobó que la aplicación muestra el estado “Login requerido”. Las solicitudes HTTP se simulan en pruebas locales; no dependen de Internet ni de un backend remoto.

## 7. Implementación

El cliente autenticado obtiene el token del almacenamiento seguro y agrega `Authorization` a cada GET. Ante el primer 401 crea `refreshPromise`; mientras exista, las demás solicitudes esperan esa promesa. Tras validar y guardar el nuevo token, cada solicitud original realiza un solo reintento. Si el refresh falla, se limpian las credenciales, el estado se vuelve anónimo y los callers reciben el rechazo compartido.

**Flujo exitoso**

```text
             A ─┐
             B ─┼──→ 401
             C ─┘
                  ↓
            refreshPromise
                  ↓
             1 refresh
                  ↓
             nuevo token
              /   |   \
             A    B    C
             ↓    ↓    ↓
           retry retry retry
             ↓    ↓    ↓
            OK   OK   OK
```

**Flujo de error**

```text
             401
              ↓
        refresh compartido
              ↓
            FALLA
              ↓
       borrar credenciales
              ↓
        estado anónimo
              ↓
        Login requerido
```

## 8. Resultado del escenario exitoso

Resultado de la prueba con transporte simulado:

- Solicitudes concurrentes: **3**.
- Respuestas 401 iniciales: **3**.
- Refresh realizados: **1**.
- Reintentos: **3**.
- Access token nuevo guardado: **sí**.
- Respuestas de los reintentos: **3 × 200**.
- Resultado final: **exitoso**.

## 9. Resultado del escenario fallido

Resultado de la prueba con transporte simulado:

- Respuestas 401 iniciales: **3**.
- Refresh realizados: **1**.
- Refresh fallido: **sí**; los tres callers reciben el rechazo del refresh compartido.
- Access token eliminado: **sí**.
- Refresh token eliminado: **sí**.
- Estado de sesión: **anonymous**.
- Estado de aplicación: **Login requerido**, comprobado en la prueba de interfaz.
- Reintentos después del refresh fallido: **0**.
- Ciclo infinito: **no**. Otra prueba comprueba que un 401 en el único reintento no causa un segundo refresh.

## 10. Pruebas realizadas

- `npm test -- --runInBand course-tests/public/week-06.test.ts course-tests/smoke.test.tsx`: **2 suites y 7 pruebas exitosas**.
- `npm run typecheck`: **exitoso**.
- `npm run lint`: **sin errores**; quedan dos advertencias preexistentes `import/first` en `tests/security/secureStorage.test.ts`.
- `npm run backend:self-test`: **exitoso**.
- `git diff --check`: **exitoso**.
- `npm test -- --runInBand`: **no pasó completo**. Resultado: 6 suites fallidas y 14 exitosas; 12 pruebas fallidas y 52 exitosas. Los fallos corresponden a contratos pendientes fuera de esta actividad (entre ellos `resolveSync`, `deduplicateOperations`, `planRetry` y `reduceRemoteResponses`). No se modificaron para mantener el alcance de Semana 6.

## 11. Evidencias

**`refresh-exitoso.png` 
La prueba automatizada comprueba tres solicitudes, tres 401, un refresh, tres reintentos y éxito; no se ejecutó la aplicación en un emulador/dispositivo ni se tomó una captura visual real.

**`refresh-fallido.png`
Las pruebas automatizadas comprueban el refresh fallido, la eliminación de tokens, el estado anónimo y “Login requerido”. No se generó una captura visual y no se presenta una imagen simulada como evidencia.

## 12. Reflexión

Hacer un refresh por cada 401 crea operaciones concurrentes innecesarias y aumenta la carga del servicio.  
Las renovaciones pueden terminar en distinto orden y dejar guardados tokens diferentes por una condición de carrera.  
Además, cada refresh puede provocar reintentos duplicados y un estado de sesión inconsistente.  
Compartir una sola promesa coordina a los callers y limita el flujo a una renovación.

## 13. Conclusión

La solución conserva el refresh compartido para el caso exitoso y completa el camino de fallo con limpieza de credenciales, estado anónimo y transición visible a “Login requerido”. Las pruebas focalizadas verifican los dos escenarios y que no se repita indefinidamente el refresh.
