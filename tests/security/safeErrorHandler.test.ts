import { formatSafeError } from '../../src/security/safeErrorHandler';

describe('formatSafeError', () => {
  test('sanitiza mensajes de error que contienen tokens y correos', () => {
    const error = new Error('Falla de autenticación con Bearer secret-token-xyz para user@test.com');
    const result = formatSafeError(error);

    expect(result.message).not.toContain('secret-token-xyz');
    expect(result.message).not.toContain('user@test.com');
    expect(result.message).toContain('Bearer [REDACTED]');
    expect(result.message).toContain('[REDACTED_EMAIL]');
  });

  test('preserva el contexto técnico seguro y sanitiza campos sensibles en el contexto', () => {
    const context = {
      incidentId: 'campus-inc-001',
      correlationId: 'corr-999',
      status: 'error',
      authorization: 'Bearer token-secret',
      email: 'tech@campusops.test',
      location: 'Edificio A',
    };

    const result = formatSafeError(new Error('Backend error'), context);

    expect(result.technicalContext.incidentId).toBe('campus-inc-001');
    expect(result.technicalContext.correlationId).toBe('corr-999');
    expect(result.technicalContext.status).toBe('error');
    expect(result.technicalContext.authorization).toBe('[REDACTED]');
    expect(result.technicalContext.email).toBe('[REDACTED]');
    expect(result.technicalContext.location).toBe('[REDACTED]');
  });

  test('maneja objetos de error no estándar sin exponer detalles internos', () => {
    const result = formatSafeError({ message: 'Error de red token=12345' });
    expect(result.message).not.toContain('12345');
    expect(result.message).toContain('[REDACTED_SECRET]');
  });
});
