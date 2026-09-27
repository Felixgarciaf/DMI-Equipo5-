import { SecurityStorageService } from '../../src/security/secureStorage';

describe('SecurityStorageService', () => {
  let service: SecurityStorageService;

  beforeEach(() => {
    service = new SecurityStorageService();
  });

  test('almacena y recupera información sensible cifrada/protegida', async () => {
    const token = 'course-valid-token-secret-123';
    await service.saveSensitiveData('session_token', token);

    const retrieved = await service.getSensitiveData('session_token');
    expect(retrieved).toBe(token);
  });

  test('elimina información sensible correctamente', async () => {
    await service.saveSensitiveData('session_token', 'temp-token');
    await service.removeSensitiveData('session_token');

    const retrieved = await service.getSensitiveData('session_token');
    expect(retrieved).toBeNull();
  });

  test('diferencia entre preferencias públicas y almacenamiento sensible', async () => {
    await service.savePublicPreference('theme', 'dark');
    await service.saveSensitiveData('user_email', 'user@campusops.test');

    expect(await service.getPublicPreference('theme')).toBe('dark');
    expect(await service.getSensitiveData('user_email')).toBe('user@campusops.test');
    expect(await service.getPublicPreference('user_email')).toBeNull();
  });

  test('lanza error si la clave o valor es inválido', async () => {
    await expect(service.saveSensitiveData('', 'val')).rejects.toThrow();
  });
});
