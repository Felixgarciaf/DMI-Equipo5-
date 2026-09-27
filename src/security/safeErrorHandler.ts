import { redactForTelemetry } from '../course-evaluation';

export interface SafeErrorResult {
  message: string;
  code: string;
  technicalContext: Record<string, unknown>;
  timestamp: string;
}

/**
 * Sanitiza cualquier error o excepción capturada para evitar filtración de tokens,
 * datos personales, stack traces, rutas internas o payloads completos.
 */
export function formatSafeError(error: unknown, context?: Record<string, unknown>): SafeErrorResult {
  const timestamp = new Date().toISOString();
  let rawMessage = 'Error interno del sistema';
  let code = 'INTERNAL_ERROR';

  if (error instanceof Error) {
    rawMessage = error.message;
    if (error.name) {
      code = error.name.toUpperCase().replace(/\s+/g, '_');
    }
  } else if (typeof error === 'string') {
    rawMessage = error;
  } else if (typeof error === 'object' && error !== null && 'message' in error) {
    rawMessage = String((error as { message: unknown }).message);
  }

  // Sanitizar el mensaje para eliminar posibles tokens o correos presentes en el texto del error
  const sanitizedMessage = rawMessage
    .replace(/Bearer\s+[A-Za-z0-9\-._~+/=]+/gi, 'Bearer [REDACTED]')
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[REDACTED_EMAIL]')
    .replace(/(?:token|password|secret)[=:]\s*\S+/gi, '[REDACTED_SECRET]');

  // Sanitizar el contexto técnico proporcionado usando redactForTelemetry
  const sanitizedContext = context ? (redactForTelemetry(context) as Record<string, unknown>) : {};

  return {
    message: sanitizedMessage,
    code,
    technicalContext: sanitizedContext,
    timestamp,
  };
}
