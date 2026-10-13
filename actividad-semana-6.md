# Actividad Semana 6 â€” SesiÃ³n Segura

## 1. Datos de la actividad

**Materia:** Desarrollo MÃ³vil Integral
**Actividad:** Semana 6 â€” SesiÃ³n Segura
**Integrantes:** FÃ©lix, CÃ©sar y Claudia

## 2. Objetivo

Controlar las solicitudes concurrentes cuando vence el access token. Una sola solicitud inicia el refresh, las demÃ¡s esperan su resultado y todas reintentan como mÃ¡ximo una vez. Si el refresh falla, se eliminan las credenciales y la aplicaciÃ³n pasa al estado que requiere volver a iniciar sesiÃ³n.

## 3. Flujo general

**Escenario exitoso**

```text
3 solicitudes
      â†“
    3 Ã— 401
      â†“
1 refresh compartido
      â†“
 nuevo token guardado
      â†“
 3 reintentos
      â†“
3 respuestas exitosas
```

**Escenario de error**

```text
3 solicitudes
      â†“
    3 Ã— 401
      â†“
1 refresh compartido
      â†“
  refresh falla
      â†“
eliminar los dos tokens
      â†“
estado anÃ³nimo
      â†“
Login requerido
```

## 4. Trabajo realizado por FÃ©lix

La responsabilidad de FÃ©lix en esta integraciÃ³n es el refresh compartido. Al revisar el estado inicial ya existÃ­an `refreshPromise`, la lectura y persistencia segura del access token renovado, y el reintento de la solicitud original. Esa parte se conservÃ³ y se validÃ³ sin rehacerla.

La promesa compartida hace que las solicitudes concurrentes esperen el mismo refresh. El `finally` libera la promesa al terminar. Cada llamada ejecuta el reintento en un Ãºnico punto y no se vuelve a llamar recursivamente si ese reintento devuelve otro 401.

## 5. Trabajo realizado por CÃ©sar

Se completÃ³ el camino de fallo del refresh:

- Un refresh rechazado o con respuesta invÃ¡lida propaga el error a las solicitudes que esperan la misma promesa.
- Se eliminan `accessToken` y `refreshToken` del almacenamiento seguro.
- La sesiÃ³n cambia al estado `anonymous`; el estado queda publicado para los componentes suscritos.
- La promesa compartida se libera con `finally`; una llamada posterior sin access token no puede iniciar otro refresh.
- Si el Ãºnico reintento tambiÃ©n responde 401, se cierra la sesiÃ³n sin iniciar otro refresh.
- La aplicaciÃ³n muestra â€œLogin requeridoâ€ al recibir el estado anÃ³nimo.

La aplicaciÃ³n existente no tenÃ­a una pantalla ni un formulario de Login. Esta entrega implementa la transiciÃ³n visible al estado que requiere volver a iniciar sesiÃ³n; no presenta un formulario de autenticaciÃ³n nuevo.

## 6. Trabajo realizado por Claudia

La responsabilidad de Claudia es integrar y comprobar las solicitudes concurrentes. La prueba de Semana 6 inicia tres solicitudes con `Promise.all`, controla el momento en que concluye el refresh y verifica los tres 401, el Ãºnico refresh, el token nuevo guardado y los tres reintentos exitosos.

Se extendieron esas pruebas para cubrir el refresh fallido, la eliminaciÃ³n de ambas credenciales, el estado anÃ³nimo y la protecciÃ³n contra un segundo refresh tras un 401 del reintento. TambiÃ©n se comprobÃ³ que la aplicaciÃ³n muestra el estado â€œLogin requeridoâ€. Las solicitudes HTTP se simulan en pruebas locales; no dependen de Internet ni de un backend remoto.

## 7. ImplementaciÃ³n

El cliente autenticado obtiene el token del almacenamiento seguro y agrega `Authorization` a cada GET. Ante el primer 401 crea `refreshPromise`; mientras exista, las demÃ¡s solicitudes esperan esa promesa. Tras validar y guardar el nuevo token, cada solicitud original realiza un solo reintento. Si el refresh falla, se limpian las credenciales, el estado se vuelve anÃ³nimo y los callers reciben el rechazo compartido.

**Flujo exitoso**

```text
             A â”€â”
             B â”€â”¼â”€â”€â†’ 401
             C â”€â”˜
                  â†“
            refreshPromise
                  â†“
             1 refresh
                  â†“
             nuevo token
              /   |   \
             A    B    C
             â†“    â†“    â†“
           retry retry retry
             â†“    â†“    â†“
            OK   OK   OK
```

**Flujo de error**

```text
             401
              â†“
        refresh compartido
              â†“
            FALLA
              â†“
       borrar credenciales
              â†“
        estado anÃ³nimo
              â†“
        Login requerido
```

## 8. Resultado del escenario exitoso

Resultado de la prueba con transporte simulado:

- Solicitudes concurrentes: **3**.
- Respuestas 401 iniciales: **3**.
- Refresh realizados: **1**.
- Reintentos: **3**.
- Access token nuevo guardado: **sÃ­**.
- Respuestas de los reintentos: **3 Ã— 200**.
- Resultado final: **exitoso**.

## 9. Resultado del escenario fallido

Resultado de la prueba con transporte simulado:

- Respuestas 401 iniciales: **3**.
- Refresh realizados: **1**.
- Refresh fallido: **sÃ­**; los tres callers reciben el rechazo del refresh compartido.
- Access token eliminado: **sÃ­**.
- Refresh token eliminado: **sÃ­**.
- Estado de sesiÃ³n: **anonymous**.
- Estado de aplicaciÃ³n: **Login requerido**, comprobado en la prueba de interfaz.
- Reintentos despuÃ©s del refresh fallido: **0**.
- Ciclo infinito: **no**. Otra prueba comprueba que un 401 en el Ãºnico reintento no causa un segundo refresh.

## 10. Pruebas realizadas

- `npm test -- --runInBand course-tests/public/week-06.test.ts course-tests/smoke.test.tsx`: **2 suites y 7 pruebas exitosas**.
- `npm run typecheck`: **exitoso**.
- `npm run lint`: **sin errores**; quedan dos advertencias preexistentes `import/first` en `tests/security/secureStorage.test.ts`.
- `npm run backend:self-test`: **exitoso**.
- `git diff --check`: **exitoso**.
- `npm test -- --runInBand`: **no pasÃ³ completo**. Resultado: 6 suites fallidas y 14 exitosas; 12 pruebas fallidas y 52 exitosas. Los fallos corresponden a contratos pendientes fuera de esta actividad (entre ellos `resolveSync`, `deduplicateOperations`, `planRetry` y `reduceRemoteResponses`). No se modificaron para mantener el alcance de Semana 6.

## 11. Evidencias

**`refresh-exitoso.png`
La prueba automatizada comprueba tres solicitudes, tres 401, un refresh, tres reintentos y Ã©xito; no se ejecutÃ³ la aplicaciÃ³n en un emulador/dispositivo ni se tomÃ³ una captura visual real.

**`refresh-fallido.png`
Las pruebas automatizadas comprueban el refresh fallido, la eliminaciÃ³n de tokens, el estado anÃ³nimo y â€œLogin requeridoâ€. No se generÃ³ una captura visual y no se presenta una imagen simulada como evidencia.

## 12. ReflexiÃ³n

Hacer un refresh por cada 401 crea operaciones concurrentes innecesarias y aumenta la carga del servicio.
Las renovaciones pueden terminar en distinto orden y dejar guardados tokens diferentes por una condiciÃ³n de carrera.
AdemÃ¡s, cada refresh puede provocar reintentos duplicados y un estado de sesiÃ³n inconsistente.
Compartir una sola promesa coordina a los callers y limita el flujo a una renovaciÃ³n.

## 13. ConclusiÃ³n

La soluciÃ³n conserva el refresh compartido para el caso exitoso y completa el camino de fallo con limpieza de credenciales, estado anÃ³nimo y transiciÃ³n visible a â€œLogin requeridoâ€. Las pruebas focalizadas verifican los dos escenarios y que no se repita indefinidamente el refresh.
