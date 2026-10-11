import { SessionAuthClient } from '../../src/security/sessionAuthClient';

describe('SessionAuthClient — Semana 06: 3 peticiones, 1 solo refresh', () => {
  test('coalesces 3 concurrent 401 requests into 1 single refresh and retries all requests', async () => {
    const client = new SessionAuthClient('expired-token-123', 'valid-refresh-token-456');

    const results = await client.executeConcurrentRequests([
      '/profile',
      '/incidents',
      '/assignments',
    ]);

    expect(results).toHaveLength(3);
    expect(results.every((res) => res.status === 200)).toBe(true);
    expect(client.refreshCount).toBe(1);

    const refreshLogs = client.logs.filter((log) => log.includes('REFRESH START'));
    expect(refreshLogs).toHaveLength(1);

    expect(client.getAccessToken()).not.toBeNull();
    expect(client.getAccessToken()).not.toBe('expired-token-123');
  });

  test('clears session and returns to login when refresh fails', async () => {
    const client = new SessionAuthClient('expired-token-123', 'invalid-refresh-token');
    client.shouldRefreshFail = true;

    await expect(
      client.executeConcurrentRequests(['/profile', '/incidents', '/assignments']),
    ).rejects.toThrow();

    expect(client.getAccessToken()).toBeNull();
    expect(client.getRefreshToken()).toBeNull();
    expect(client.logs).toContain('SESSION CLEARED - TOKENS REMOVED - NAVIGATING TO LOGIN');
  });
});
