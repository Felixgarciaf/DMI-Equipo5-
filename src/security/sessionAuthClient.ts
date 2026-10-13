/**
 * Cliente de Sesión y Control de Renovación de Tokens — Semana 06
 *
 * Implementa la estrategia "3 peticiones, 1 solo refresh" utilizando
 * una promesa compartida (refreshPromise) para coalescer múltiples
 * respuestas 401 concurrentes.
 */

export interface SessionState {
  accessToken: string | null;
  refreshToken: string | null;
  refreshCount: number;
  isAuthenticated: boolean;
  logs: string[];
}

export class SessionAuthClient {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private refreshPromise: Promise<string> | null = null;
  private sessionRevision = 0;
  public refreshCount = 0;
  public logs: string[] = [];
  public shouldRefreshFail = false;

  constructor(initialAccessToken?: string, initialRefreshToken?: string) {
    this.accessToken = initialAccessToken ?? 'expired-token-123';
    this.refreshToken = initialRefreshToken ?? 'valid-refresh-token-456';
  }

  public setTokens(access: string, refresh: string): void {
    this.sessionRevision += 1;
    this.refreshPromise = null;
    this.accessToken = access;
    this.refreshToken = refresh;
  }

  public getAccessToken(): string | null {
    return this.accessToken;
  }

  public getRefreshToken(): string | null {
    return this.refreshToken;
  }

  public clearSession(): void {
    this.sessionRevision += 1;
    this.accessToken = null;
    this.refreshToken = null;
    this.refreshPromise = null;
    this.log('SESSION CLEARED - TOKENS REMOVED - NAVIGATING TO LOGIN');
  }

  private log(message: string): void {
    this.logs.push(message);
    console.log(`[SessionAuthClient]: ${message}`);
  }

  /**
   * Ejecuta la renovación del token garantizando UN SOLO refresco compartido.
   */
  public async performSingleRefresh(): Promise<string> {
    if (this.refreshPromise) {
      this.log('REFRESH IN PROGRESS — WAITING FOR EXISTING PROMISE');
      return this.refreshPromise;
    }

    const revision = this.sessionRevision;
    const activeRefresh = (async () => {
      this.refreshCount++;
      this.log(`REFRESH START (refreshCount: ${this.refreshCount})`);

      await new Promise((resolve) => setTimeout(resolve, 100));
      if (revision !== this.sessionRevision) {
        throw new Error('Session ended during token refresh');
      }

      if (this.shouldRefreshFail || !this.refreshToken) {
        this.log('REFRESH FAILED — INVALID OR EXPIRED REFRESH TOKEN');
        throw new Error('Refresh token expired or invalid');
      }

      const newAccessToken = `new-token-gen-${Date.now()}`;
      if (revision !== this.sessionRevision) {
        throw new Error('Session ended during token refresh');
      }
      this.accessToken = newAccessToken;
      this.log('REFRESH SUCCESS — NEW ACCESS TOKEN SAVED');
      return newAccessToken;
    })().catch((error: unknown) => {
      if (revision === this.sessionRevision) {
        this.clearSession();
      }
      throw error;
    });
    this.refreshPromise = activeRefresh;

    try {
      return await activeRefresh;
    } finally {
      if (this.refreshPromise === activeRefresh) {
        this.refreshPromise = null;
      }
    }
  }

  /**
   * Realiza una petición HTTP con interceptor para manejo de 401 y reintentos.
   */
  public async request(
    endpoint: string,
    options: { _retry?: boolean; mockFailFirstTime?: boolean } = {},
  ): Promise<{ status: number; data: string; endpoint: string }> {
    this.log('REQUEST START');

    const isTokenExpired =
      options.mockFailFirstTime !== false &&
      (this.accessToken === 'expired-token-123' || !this.accessToken);

    if (isTokenExpired && !options._retry) {
      this.log('401 RESPONSE');

      options._retry = true;

      await this.performSingleRefresh();
      if (!this.accessToken) {
        throw new Error('Session ended during token refresh');
      }

      this.log('RETRY REQUEST WITH UPDATED TOKEN');
      return this.request(endpoint, { ...options, mockFailFirstTime: false });
    }

    if (!this.accessToken) {
      this.log('401 RESPONSE WITHOUT ACCESS TOKEN');
      throw new Error('Unauthorized request');
    }

    this.log('200 RESPONSE');
    return { status: 200, data: `Response for ${endpoint}`, endpoint };
  }

  /**
   * Simula N peticiones concurrentes simultáneas.
   */
  public async executeConcurrentRequests(
    endpoints: string[],
  ): Promise<{ status: number; data: string; endpoint: string }[]> {
    return Promise.all(endpoints.map((ep) => this.request(ep)));
  }
}
