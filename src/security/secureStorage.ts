/**
 * Módulo de Almacenamiento Seguro — Semana 04
 *
 * Los datos sensibles utilizan expo-secure-store.
 * Las preferencias no sensibles utilizan un almacenamiento separado.
 */

import * as SecureStore from 'expo-secure-store';

export interface StorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/**
 * Almacenamiento en memoria utilizado para datos no sensibles
 * y para escenarios de prueba.
 */
class InMemoryStorage implements StorageAdapter {
  private store = new Map<string, string>();

  async getItem(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }

  async removeItem(key: string): Promise<void> {
    this.store.delete(key);
  }
}

/**
 * Adaptador para almacenamiento seguro del dispositivo.
 *
 * expo-secure-store utiliza los mecanismos seguros proporcionados
 * por el sistema operativo para proteger los valores almacenados.
 */
class ExpoSecureStorageAdapter implements StorageAdapter {
  async getItem(key: string): Promise<string | null> {
    return SecureStore.getItemAsync(key);
  }

  async setItem(key: string, value: string): Promise<void> {
    await SecureStore.setItemAsync(key, value);
  }

  async removeItem(key: string): Promise<void> {
    await SecureStore.deleteItemAsync(key);
  }
}

export class SecurityStorageService {
  private secureStorage: StorageAdapter;
  private standardStorage: StorageAdapter;

  constructor(
    secureAdapter?: StorageAdapter,
    standardAdapter?: StorageAdapter,
  ) {
    this.secureStorage = secureAdapter ?? new ExpoSecureStorageAdapter();
    this.standardStorage = standardAdapter ?? new InMemoryStorage();
  }

  /**
   * Guarda información sensible mediante almacenamiento seguro.
   */
  async saveSensitiveData(key: string, value: string): Promise<void> {
    if (!key || value === undefined) {
      throw new Error('Clave o valor inválidos para almacenamiento seguro');
    }

    await this.secureStorage.setItem(key, value);
  }

  /**
   * Recupera información sensible desde almacenamiento seguro.
   */
  async getSensitiveData(key: string): Promise<string | null> {
    return this.secureStorage.getItem(key);
  }

  /**
   * Elimina información sensible del almacenamiento seguro.
   */
  async removeSensitiveData(key: string): Promise<void> {
    await this.secureStorage.removeItem(key);
  }

  /**
   * Guarda preferencias no sensibles en almacenamiento normal.
   */
  async savePublicPreference(key: string, value: string): Promise<void> {
    await this.standardStorage.setItem(key, value);
  }

  /**
   * Recupera preferencias no sensibles desde almacenamiento normal.
   */
  async getPublicPreference(key: string): Promise<string | null> {
    return this.standardStorage.getItem(key);
  }
}

export const secureStorageService = new SecurityStorageService();
