/**
 * Módulo de Almacenamiento Seguro — Semana 04 (Felix)
 *
 * Proporciona un mecanismo diferenciado para guardar datos sensibles (tokens de sesión,
 * credenciales, datos personales) utilizando almacenamiento cifrado / seguro,
 * mientras que las preferencias no sensibles utilizan almacenamiento estándar.
 */

export interface StorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

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

// Simulador de almacenamiento seguro con cifrado básico para entornos de desarrollo/test
class EncryptedSecureStorage implements StorageAdapter {
  private store = new Map<string, string>();

  private obfuscate(value: string): string {
    return Buffer.from(value, 'utf-8').toString('base64');
  }

  private deobfuscate(value: string): string {
    return Buffer.from(value, 'base64').toString('utf-8');
  }

  async getItem(key: string): Promise<string | null> {
    const raw = this.store.get(key);
    if (!raw) return null;
    try {
      return this.deobfuscate(raw);
    } catch {
      return null;
    }
  }

  async setItem(key: string, value: string): Promise<void> {
    this.store.set(key, this.obfuscate(value));
  }

  async removeItem(key: string): Promise<void> {
    this.store.delete(key);
  }
}

export class SecurityStorageService {
  private secureStorage: StorageAdapter;
  private standardStorage: StorageAdapter;

  constructor(
    secureAdapter?: StorageAdapter,
    standardAdapter?: StorageAdapter,
  ) {
    this.secureStorage = secureAdapter ?? new EncryptedSecureStorage();
    this.standardStorage = standardAdapter ?? new InMemoryStorage();
  }

  /**
   * Guarda información sensible (tokens, credenciales) en almacenamiento seguro cifrado.
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
   * Recupera preferencias no sensibles del almacenamiento normal.
   */
  async getPublicPreference(key: string): Promise<string | null> {
    return this.standardStorage.getItem(key);
  }
}

export const secureStorageService = new SecurityStorageService();
