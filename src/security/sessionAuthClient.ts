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
  public refreshCount = 0;
  public logs: string[] = [];
  public shouldRefreshFail = false;

  constructor(initialAccessToken?: string, initialRefreshToken?: string) {
    this.accessToken = initialAccessToken ?? 'expired-token-123';
    this.refreshToken = initialRefreshToken ?? 'valid-refresh-token-456';
  }

  public setTokens(access: string, refresh: string): void {
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

    this.refreshPromise = (async () => {
      this.refreshCount++;
      this.log(`REFRESH START (refreshCount: ${this.refreshCount})`);

      try {
        await new Promise((resolve) => setTimeout(resolve, 100));

        if (this.shouldRefreshFail || !this.refreshToken) {
          this.log('REFRESH FAILED — INVALID OR EXPIRED REFRESH TOKEN');
          this.clearSession();
          throw new Error('Refresh token expired or invalid');
        }

        const newAccessToken = `new-token-gen-${Date.now()}`;
        this.accessToken = newAccessToken;
        this.log(`REFRESH SUCCESS — NEW ACCESS TOKEN SAVED (${newAccessToken})`);
        return newAccessToken;
      } catch (err) {
        this.clearSession();
        throw err;
      }
    })();

    try {
      return await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  /**
   * Realiza una petición HTTP con interceptor para manejo de 401 y reintentos.
   */
  public async request(
    endpoint: string,
    options: { _retry?: boolean; mockFailFirstTime?: boolean } = {},
  ): Promise<{ status: number; data: string; endpoint: string }> {
    this.log(`REQUEST ${endpoint}`);

    const isTokenExpired =
      options.mockFailFirstTime !== false &&
      (this.accessToken === 'expired-token-123' || !this.accessToken);

    if (isTokenExpired && !options._retry) {
      this.log(`401 ${endpoint}`);

      options._retry = true;

      const newToken = await this.performSingleRefresh();

      this.log(`RETRY ${endpoint} WITH BEARER ${newToken}`);
      return this.request(endpoint, { ...options, mockFailFirstTime: false });
    }

    if (!this.accessToken) {
      this.log(`401 ${endpoint} - NO ACCESS TOKEN (UNAUTHORIZED)`);
      throw new Error(`Unauthorized ${endpoint}`);
    }

    this.log(`200 OK ${endpoint}`);
    return { status: 200, data: `Response for ${endpoint}`, endpoint };
  }

  /**
   * Simula N peticiones concurrentes simultáneas.
   */
  public async executeConcurrentRequests(
    endpoints: string[],
  ): Promise<Array<{ status: number; data: string; endpoint: string }>> {
    return Promise.all(endpoints.map((ep) => this.request(ep)));
  }
}
