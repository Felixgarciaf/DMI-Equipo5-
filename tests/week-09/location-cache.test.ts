import {
  isValidGeocodingCoordinate,
  isValidGeocodingResult,
  LocationCache,
  normalizeLocationCacheKey,
} from '../../src/campusops/infrastructure/location-cache';

describe('Week 09 — LocationCache', () => {
  test('normalizes query keys consistently regardless of case and extra whitespace', () => {
    expect(normalizeLocationCacheKey('  Edificio   de   Prueba  A ')).toBe('edificio de prueba a');
    expect(normalizeLocationCacheKey('   ')).toBe('');
  });

  test('validates latitude and longitude boundaries strictly', () => {
    expect(isValidGeocodingCoordinate(0, 0)).toBe(true);
    expect(isValidGeocodingCoordinate(-90, -180)).toBe(true);
    expect(isValidGeocodingCoordinate(90, 180)).toBe(true);
    expect(isValidGeocodingCoordinate(90.0001, 0)).toBe(false);
    expect(isValidGeocodingCoordinate(-90.1, 0)).toBe(false);
    expect(isValidGeocodingCoordinate(0, 180.1)).toBe(false);
    expect(isValidGeocodingCoordinate(0, -180.1)).toBe(false);
    expect(isValidGeocodingCoordinate(Number.NaN, 0)).toBe(false);
    expect(isValidGeocodingCoordinate(0, Number.POSITIVE_INFINITY)).toBe(false);
    expect(isValidGeocodingCoordinate('19.43', -99.13)).toBe(false);

    expect(isValidGeocodingResult({ label: 'Laboratorio A', latitude: 19.3, longitude: -99.1 })).toBe(true);
    expect(isValidGeocodingResult({ label: '   ', latitude: 19.3, longitude: -99.1 })).toBe(false);
    expect(isValidGeocodingResult({ label: 'Incompleta' })).toBe(false);
    expect(isValidGeocodingResult(null)).toBe(false);
  });

  test('stores and retrieves valid geocoding results using normalized keys without sharing references', () => {
    let currentTime = 1_000;
    const cache = new LocationCache({ defaultTtlMs: 5_000, now: () => currentTime });

    const original = {
      label: 'Edificio de prueba A',
      latitude: 19.332,
      longitude: -99.186,
    };

    expect(cache.set('  Edificio de   Prueba A ', original)).toBe(true);
    expect(cache.has('edificio de prueba a')).toBe(true);
    expect(cache.size()).toBe(1);

    const retrieved = cache.get('EDIFICIO DE PRUEBA A');
    expect(retrieved).toEqual(original);
    expect(retrieved).not.toBe(original);
  });

  test('expires entries once TTL has elapsed and removes them on access or purge', () => {
    let currentTime = 10_000;
    const cache = new LocationCache({ defaultTtlMs: 3_000, now: () => currentTime });

    cache.set('Biblioteca Central', {
      label: 'Biblioteca Central, Planta Alta',
      latitude: 19.333,
      longitude: -99.187,
    });

    currentTime = 12_999;
    expect(cache.get('biblioteca central')).toEqual({
      label: 'Biblioteca Central, Planta Alta',
      latitude: 19.333,
      longitude: -99.187,
    });

    currentTime = 13_000;
    expect(cache.get('biblioteca central')).toBeNull();
    expect(cache.has('biblioteca central')).toBe(false);
    expect(cache.size()).toBe(0);
  });

  test('rejects invalid entries, empty queries, or non-positive TTLs', () => {
    const cache = new LocationCache({ defaultTtlMs: 5_000 });

    expect(
      cache.set('   ', { label: 'Zona A', latitude: 0, longitude: 0 }),
    ).toBe(false);
    expect(
      cache.set('Zona A', { label: 'Zona A', latitude: 95, longitude: 0 }),
    ).toBe(false);
    expect(
      cache.set('Zona A', { label: 'Zona A', latitude: 0, longitude: 0 }, 0),
    ).toBe(false);
    expect(
      cache.set('Zona A', { label: 'Zona A', latitude: 0, longitude: 0 }, -100),
    ).toBe(false);
    expect(cache.size()).toBe(0);
  });

  test('supports explicit deletion, clear, and bounded maxEntries eviction', () => {
    let currentTime = 500;
    const cache = new LocationCache({ defaultTtlMs: 10_000, maxEntries: 2, now: () => currentTime });

    cache.set('zona-1', { label: 'Zona 1', latitude: 1, longitude: 1 });
    currentTime += 100;
    cache.set('zona-2', { label: 'Zona 2', latitude: 2, longitude: 2 });
    currentTime += 100;
    cache.set('zona-3', { label: 'Zona 3', latitude: 3, longitude: 3 });

    expect(cache.get('zona-1')).toBeNull();
    expect(cache.get('zona-2')).toEqual({ label: 'Zona 2', latitude: 2, longitude: 2 });
    expect(cache.get('zona-3')).toEqual({ label: 'Zona 3', latitude: 3, longitude: 3 });

    expect(cache.delete('zona-2')).toBe(true);
    expect(cache.get('zona-2')).toBeNull();

    cache.clear();
    expect(cache.size()).toBe(0);
  });
});
