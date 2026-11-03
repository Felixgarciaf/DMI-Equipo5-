import type { GeocodingLookupResult } from '../domain/ports';

export type LocationCacheOptions = Readonly<{
  defaultTtlMs?: number;
  maxEntries?: number;
  now?: () => number;
}>;

export type CachedLocationEntry = Readonly<{
  value: GeocodingLookupResult;
  storedAt: number;
  expiresAt: number;
}>;

const DEFAULT_TTL_MS = 5 * 60 * 1000;
const DEFAULT_MAX_ENTRIES = 100;

export function normalizeLocationCacheKey(query: string): string {
  return query.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function isValidGeocodingCoordinate(latitude: unknown, longitude: unknown): boolean {
  return (
    typeof latitude === 'number' &&
    Number.isFinite(latitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    typeof longitude === 'number' &&
    Number.isFinite(longitude) &&
    longitude >= -180 &&
    longitude <= 180
  );
}

export function isValidGeocodingResult(candidate: unknown): candidate is GeocodingLookupResult {
  if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) {
    return false;
  }

  const record = candidate as Record<string, unknown>;
  return (
    typeof record.label === 'string' &&
    record.label.trim().length > 0 &&
    isValidGeocodingCoordinate(record.latitude, record.longitude)
  );
}

export class LocationCache {
  private readonly entries = new Map<string, CachedLocationEntry>();
  private readonly defaultTtlMs: number;
  private readonly maxEntries: number;
  private readonly now: () => number;

  constructor(options: LocationCacheOptions = {}) {
    this.defaultTtlMs = options.defaultTtlMs ?? DEFAULT_TTL_MS;
    this.maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
    this.now = options.now ?? (() => Date.now());
  }

  get(query: string): GeocodingLookupResult | null {
    const key = normalizeLocationCacheKey(query);
    if (!key) {
      return null;
    }

    const entry = this.entries.get(key);
    if (!entry) {
      return null;
    }

    const currentTime = this.now();
    if (currentTime >= entry.expiresAt) {
      this.entries.delete(key);
      return null;
    }

    return { ...entry.value };
  }

  set(query: string, value: GeocodingLookupResult, ttlMs = this.defaultTtlMs): boolean {
    const key = normalizeLocationCacheKey(query);
    if (!key || !isValidGeocodingResult(value) || !Number.isFinite(ttlMs) || ttlMs <= 0) {
      return false;
    }

    this.purgeExpired();

    if (!this.entries.has(key) && this.entries.size >= this.maxEntries) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey !== undefined) {
        this.entries.delete(oldestKey);
      }
    }

    const currentTime = this.now();
    this.entries.set(key, {
      value: {
        label: value.label,
        latitude: value.latitude,
        longitude: value.longitude,
      },
      storedAt: currentTime,
      expiresAt: currentTime + ttlMs,
    });
    return true;
  }

  has(query: string): boolean {
    return this.get(query) !== null;
  }

  delete(query: string): boolean {
    const key = normalizeLocationCacheKey(query);
    if (!key) {
      return false;
    }
    return this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }

  purgeExpired(): number {
    const currentTime = this.now();
    let removed = 0;

    for (const [key, entry] of this.entries.entries()) {
      if (currentTime >= entry.expiresAt) {
        this.entries.delete(key);
        removed += 1;
      }
    }

    return removed;
  }

  size(): number {
    this.purgeExpired();
    return this.entries.size;
  }
}
