export type BackendHealth = Readonly<{
  ok: true;
  service: 'dmi-controlled-backend';
  contractVersion: 1;
}>;

const getEnvBackendUrl = (): string => {
  return process.env.EXPO_PUBLIC_COURSE_BACKEND_URL ?? 'http://127.0.0.1:4310';
};

/**
 * Sanitiza la información enviada a consola para evitar filtración de tokens o datos sensibles.
 */
export function sanitizeLog(message: string, data?: Record<string, unknown>): void {
  if (!data) {
    console.log(`[CampusOps Audit Log]: ${message}`);
    return;
  }
  const safeData: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (['token', 'password', 'accessToken', 'refreshToken', 'secret', 'authorization'].includes(key.toLowerCase())) {
      safeData[key] = '[REDACTADO]';
    } else {
      safeData[key] = value;
    }
  }
  console.log(`[CampusOps Audit Log]: ${message}`, safeData);
}

export async function getBackendHealth(
  baseUrl = process.env.EXPO_PUBLIC_COURSE_BACKEND_URL ?? getEnvBackendUrl(),
): Promise<BackendHealth> {
  sanitizeLog('Verificando estado del backend', { endpoint: baseUrl });

  const response = await fetch(`${baseUrl}/health`);
  if (!response.ok) {
    throw new Error(`Backend health failed with ${response.status}`);
  }
  const payload: unknown = await response.json();
  if (
    typeof payload !== 'object' ||
    payload === null ||
    !('ok' in payload) ||
    payload.ok !== true ||
    !('contractVersion' in payload) ||
    payload.contractVersion !== 1
  ) {
    throw new Error('Backend health contract mismatch');
  }
  return payload as BackendHealth;
}
