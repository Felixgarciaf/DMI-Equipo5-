import { SessionAuthClient } from '../../src/security/sessionAuthClient';

describe('SessionAuthClient — Semana 06: 3 peticiones, 1 solo refresh', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  test('coalesces 3 concurrent 401 requests into 1 single refresh and retries all requests', async () => {
    jest.useFakeTimers();
    const client = new SessionAuthClient('expired-token-123', 'valid-refresh-token-456');

    const requests = client.executeConcurrentRequests([
      '/profile',
      '/incidents',
      '/assignments',
    ]);
    await jest.advanceTimersByTimeAsync(100);
    const results = await requests;

    expect(results).toHaveLength(3);
    expect(results.every((res) => res.status === 200)).toBe(true);
    expect(client.refreshCount).toBe(1);

    const refreshLogs = client.logs.filter((log) => log.includes('REFRESH START'));
    expect(refreshLogs).toHaveLength(1);
    expect(client.logs.join('\n')).not.toContain('/profile');
    expect(client.logs.join('\n')).not.toContain('expired-token-123');
    expect(client.logs.join('\n')).not.toContain('valid-refresh-token-456');

    expect(client.getAccessToken()).not.toBeNull();
    expect(client.getAccessToken()).not.toBe('expired-token-123');
  });

  test('clears session and returns to login when refresh fails', async () => {
    jest.useFakeTimers();
    const client = new SessionAuthClient('expired-token-123', 'invalid-refresh-token');
    client.shouldRefreshFail = true;

    const requests = client.executeConcurrentRequests([
      '/profile',
      '/incidents',
      '/assignments',
    ]);
    const failedRequests = expect(requests).rejects.toThrow();
    await jest.advanceTimersByTimeAsync(100);
    await failedRequests;

    expect(client.getAccessToken()).toBeNull();
    expect(client.getRefreshToken()).toBeNull();
    expect(client.logs).toContain('SESSION CLEARED - TOKENS REMOVED - NAVIGATING TO LOGIN');
  });

  test('discards a pending refresh after logout', async () => {
    jest.useFakeTimers();
    const client = new SessionAuthClient(
      'expired-token-123',
      'valid-refresh-token-456',
    );

    const request = client.request('/profile');
    const endedRequest = expect(request).rejects.toThrow(
      'Session ended during token refresh',
    );
    await jest.advanceTimersByTimeAsync(0);
    client.clearSession();
    await jest.advanceTimersByTimeAsync(100);

    await endedRequest;
    expect(client.getAccessToken()).toBeNull();
    expect(client.getRefreshToken()).toBeNull();
    expect(client.logs.join('\n')).not.toContain('expired-token-123');
    expect(client.logs.join('\n')).not.toContain('valid-refresh-token-456');
  });
});
