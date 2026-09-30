const mockSecureStore = new Map<string, string>();

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockSecureStore.set(key, value);
  }),
  getItemAsync: jest.fn(async (key: string) => {
    return mockSecureStore.get(key) ?? null;
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    mockSecureStore.delete(key);
  }),
}));

import * as SecureStore from 'expo-secure-store';
import { SecurityStorageService } from '../../src/security/secureStorage';

describe('SecurityStorageService', () => {
  let service: SecurityStorageService;

  beforeEach(() => {
    mockSecureStore.clear();
    jest.clearAllMocks();
    service = new SecurityStorageService();
  });

  test('almacena y recupera información sensible mediante almacenamiento seguro', async () => {
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

    await service.saveSensitiveData(
      'user_email',
      'user@campusops.test',
    );

    expect(await service.getPublicPreference('theme')).toBe('dark');

    expect(await service.getSensitiveData('user_email')).toBe(
      'user@campusops.test',
    );

    expect(await service.getPublicPreference('user_email')).toBeNull();
  });

  test('utiliza expo-secure-store para los datos sensibles', async () => {
    await service.saveSensitiveData(
      'session_token',
      'test-token',
    );

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      'session_token',
      'test-token',
    );

    await service.getSensitiveData('session_token');

    expect(SecureStore.getItemAsync).toHaveBeenCalledWith(
      'session_token',
    );
  });

  test('lanza error si la clave o valor es inválido', async () => {
    await expect(
      service.saveSensitiveData('', 'val'),
    ).rejects.toThrow();
  });
});
