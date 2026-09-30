import { sanitizeLog } from '../../src/api/courseBackend';

describe('sanitizeLog', () => {
  const originalConsoleLog = console.log;

  beforeEach(() => {
    console.log = jest.fn();
  });

  afterEach(() => {
    console.log = originalConsoleLog;
    jest.clearAllMocks();
  });

  test('redacta datos sensibles anidados antes de enviarlos al log', () => {
    const sensitiveData = {
      incident: {
        reporter: {
          email: 'reporter@campusops.test',
          name: 'Usuario de prueba',
        },
        location: {
          latitude: 18.462,
          longitude: -97.392,
        },
        authorization: 'Bearer course-secret-token',
      },
      safeContext: {
        status: 'created',
        requestId: 'req-test-001',
      },
    };

    sanitizeLog('Creando incidencia', sensitiveData);

    expect(console.log).toHaveBeenCalledTimes(1);

    const loggedData = (console.log as jest.Mock).mock.calls[0][1];

    expect(loggedData).toEqual({
      incident: {
        reporter: {
          email: '[REDACTED]',
          name: '[REDACTED]',
        },
        location: '[REDACTED]',
        authorization: '[REDACTED]',
      },
      safeContext: {
        status: 'created',
        requestId: 'req-test-001',
      },
    });

    expect(JSON.stringify(loggedData)).not.toContain(
      'reporter@campusops.test',
    );

    expect(JSON.stringify(loggedData)).not.toContain(
      'course-secret-token',
    );
  });

  test('preserva contexto técnico no sensible', () => {
    sanitizeLog('Solicitud procesada', {
      endpoint: '/incidents',
      status: 201,
      requestId: 'req-test-002',
    });

    const loggedData = (console.log as jest.Mock).mock.calls[0][1];

    expect(loggedData).toEqual({
      endpoint: '/incidents',
      status: 201,
      requestId: 'req-test-002',
    });
  });
});