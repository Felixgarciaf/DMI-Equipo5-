import {
  GeocodingLocationAdapter,
  normalizeProviderLocation,
} from '../../src/campusops/infrastructure/geocoding-adapter';
import { LocationCache } from '../../src/campusops/infrastructure/location-cache';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('Week 09 — GeocodingLocationAdapter and normalizeProviderLocation', () => {
  test('normalizeProviderLocation accepts valid coordinates and falls back to manual label otherwise', () => {
    expect(
      normalizeProviderLocation(
        { label: 'Zona de prueba', latitude: 0, longitude: 0 },
        'Edificio manual',
      ),
    ).toEqual({
      source: 'provider',
      label: 'Zona de prueba',
      latitude: 0,
      longitude: 0,
    });

    const invalidPayloads: unknown[] = [
      null,
      undefined,
      { status: 429 },
      { label: 'Incompleta' },
      { label: '   ', latitude: 10, longitude: 10 },
      { label: 'Latitud fuera de rango', latitude: 91, longitude: 0 },
      { label: 'Latitud negativa fuera de rango', latitude: -90.5, longitude: 0 },
      { label: 'Longitud fuera de rango', latitude: 0, longitude: 181 },
      { label: 'Longitud negativa fuera de rango', latitude: 0, longitude: -180.5 },
      { label: 'Coordenada nula', latitude: 999, longitude: null },
      { label: 'Coordenada NaN', latitude: Number.NaN, longitude: 0 },
    ];

    for (const candidate of invalidPayloads) {
      expect(normalizeProviderLocation(candidate, 'Edificio manual')).toEqual({
        source: 'manual',
        label: 'Edificio manual',
      });
    }
  });

  test('resolves valid provider location, caches it, and avoids duplicate HTTP calls until TTL expires', async () => {
    let currentTime = 1_000;
    const cache = new LocationCache({ defaultTtlMs: 5_000, now: () => currentTime });
    const fetchMock = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit | undefined]>(
      async () =>
        jsonResponse({
          label: 'Edificio de prueba A',
          latitude: 19.332,
          longitude: -99.186,
        }),
    );

    const adapter = new GeocodingLocationAdapter({
      baseUrl: 'http://127.0.0.1:4310',
      cache,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const first = await adapter.resolveIncidentLocation({
      query: '  edificio de prueba a ',
      manualLabel: 'Referencia manual A',
    });

    expect(first).toEqual({
      source: 'provider',
      label: 'Edificio de prueba A',
      latitude: 19.332,
      longitude: -99.186,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    currentTime = 4_000;
    const second = await adapter.resolveIncidentLocation({
      query: 'EDIFICIO DE PRUEBA A',
      manualLabel: 'Referencia manual A',
    });
    expect(second).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    currentTime = 7_000;
    const third = await adapter.resolveIncidentLocation({
      query: 'edificio de prueba a',
      manualLabel: 'Referencia manual A',
    });
    expect(third).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('falls back to manual capture on incomplete or invalid coordinate responses without caching them', async () => {
    const cache = new LocationCache({ defaultTtlMs: 10_000 });
    const fetchMock = jest
      .fn<Promise<Response>, [RequestInfo | URL, RequestInit | undefined]>()
      .mockResolvedValueOnce(jsonResponse({ label: 'Zona ficticia' }))
      .mockResolvedValueOnce(
        jsonResponse({ label: 'Zona ficticia', latitude: 999, longitude: null }),
      );

    const adapter = new GeocodingLocationAdapter({
      cache,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const incompleteResult = await adapter.resolveIncidentLocation({
      query: 'laboratorio b',
      manualLabel: 'Edificio B, planta baja (manual)',
      scenario: 'incomplete',
    });
    expect(incompleteResult).toEqual({
      source: 'manual',
      label: 'Edificio B, planta baja (manual)',
    });

    const invalidCoordinatesResult = await adapter.resolveIncidentLocation({
      query: 'laboratorio b',
      manualLabel: 'Edificio B, planta baja (manual)',
      scenario: 'invalid_coordinates',
    });
    expect(invalidCoordinatesResult).toEqual({
      source: 'manual',
      label: 'Edificio B, planta baja (manual)',
    });

    expect(cache.size()).toBe(0);
  });

  test('handles HTTP 429, HTTP 500, malformed JSON, network failures, and timeouts gracefully with manual fallback', async () => {
    const cache = new LocationCache({ defaultTtlMs: 10_000 });
    const fetchMock = jest
      .fn<Promise<Response>, [RequestInfo | URL, RequestInit | undefined]>()
      .mockResolvedValueOnce(jsonResponse({ code: 'rate_limited' }, 429))
      .mockResolvedValueOnce(jsonResponse({ code: 'controlled_failure' }, 500))
      .mockResolvedValueOnce(new Response('{"items": [}', { status: 200 }))
      .mockRejectedValueOnce(new Error('Network offline'))
      .mockImplementationOnce(
        (_url, init) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              reject(new Error('Aborted due to timeout'));
            });
          }),
      );

    const adapter = new GeocodingLocationAdapter({
      cache,
      timeoutMs: 25,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    for (const scenario of ['rate_limited', 'server_error', 'malformed', 'offline', 'slow']) {
      const result = await adapter.resolveIncidentLocation({
        query: 'Aula C-12',
        manualLabel: 'Aula C-12, segundo piso',
        scenario,
      });

      expect(result).toEqual({
        source: 'manual',
        label: 'Aula C-12, segundo piso',
      });
    }

    expect(cache.size()).toBe(0);
  });

  test('returns manual location immediately when query is blank and supports describeCurrentLocation', async () => {
    const fetchMock = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit | undefined]>(
      async () => jsonResponse({ code: 'rate_limited' }, 429),
    );

    const adapter = new GeocodingLocationAdapter({
      defaultQuery: 'Biblioteca',
      defaultManualLabel: 'Biblioteca manual',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const blankQueryResult = await adapter.resolveIncidentLocation({
      query: '   ',
      manualLabel: 'Entrada principal manual',
    });
    expect(blankQueryResult).toEqual({
      source: 'manual',
      label: 'Entrada principal manual',
    });
    expect(fetchMock).not.toHaveBeenCalled();

    const description = await adapter.describeCurrentLocation();
    expect(description).toBe('Biblioteca manual');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
