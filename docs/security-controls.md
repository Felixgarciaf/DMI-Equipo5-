# Controles de Seguridad y Privacidad — CampusOps (Semana 04)

## 1. Mapeo de Información y Almacenamiento Seguro

| Tipo de Dato | Sensible | Ubicación / Almacenamiento | Mecanismo Elegido | Justificación del Mecanismo |
|---|---|---|---|---|
| **Tokens de sesión (`authorization`, `token`)** | Sí | Almacenamiento local | `EncryptedSecureStorage` / `SecureStore` | Los tokens permiten suplantar la identidad del usuario. Deben cifrarse en reposo para prevenir acceso en dispositivos liberados (root/jailbreak) o mediante inspección de archivos locales. |
| **Nombres y Correos (`displayName`, `email`)** | Sí | Memoria y Sesión | `EncryptedSecureStorage` / Redacción en logs | Previene la fuga de Datos de Identificación Personal (PII). |
| **Ubicación (`location`, `latitude`, `longitude`)** | Sí | Incidencias / Reportes | Redacción en telemetría (`[REDACTED]`) | Evita el rastreo físico no autorizado del personal o reportantes. |
| **Fotografías y Comentarios (`photos`, `evidence`, `internalComments`)** | Sí | Multimedia / Incidencias | Sanitización en registros técnicos | Los archivos de evidencia y comentarios contienen detalles operativos e imágenes sensibles. |
| **Preferencias UI (`theme`, `language`)** | No | Preferencias de usuario | Almacenamiento estándar (`AsyncStorage` / `InMemoryStorage`) | Datos de preferencia no sensibles sin riesgo de privacidad. |

### Alternativas Consideradas y Análisis de Costos
- **Alternativa Considerada:** Guardar todo en `AsyncStorage` en texto plano.
- **Costo/Impacto:** Menor complejidad de desarrollo, pero riesgo crítico de extracción de datos sensibles desde respaldos no cifrados o acceso al sistema de archivos del sistema operativo.
- **Decisión Final:** Adoptar un enfoque híbrido con `SecurityStorageService`, canalizando únicamente secretos y PII a través de un backend de almacenamiento cifrado y datos públicos a almacenamiento normal.

### Riesgo Residual
- **Riesgo:** Un atacante con acceso físico y root/privilegios de kernel en el dispositivo podría inspeccionar la memoria RAM del proceso en ejecución antes de que sea cifrado o después de ser descifrado en memoria.
- **Mitigación:** Expiración de tokens y limpieza automática de sesión tras inactividad.

---

## 2. Sanitización y Redacción Técnica (`redactForTelemetry`)

### Mecanismo Implementado
- Recorre de forma recursiva objetos y listas sin mutar el objeto original.
- Normaliza las claves a minúsculas y elimina caracteres como `_` y `-`.
- Sustituye cualquier clave sensible (`authorization`, `password`, `token`, `email`, `displayName`, `location`, `photos`, `evidence`, `internalComments`, `assignmentHistory`, etc.) por el valor estático `[REDACTED]`.
- Conserva el contexto técnico imprescindible para depuración (`incidentId`, `correlationId`, `status`, `attempt`, `durationMs`).

---

## 3. Manejo de Errores Seguro (`formatSafeError`)

### Mecanismo Implementado
- Filtra cadenas de error para eliminar patrones de tokens `Bearer` o direcciones de correo.
- Convierte excepciones no controladas en mensajes genéricos útiles sin exponer stack traces, nombres de tablas/DB, ni secretos.
- Sanitiza el contexto del error utilizando `redactForTelemetry`.
