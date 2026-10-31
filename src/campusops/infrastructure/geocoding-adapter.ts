import type { IncidentLocation } from '../contracts';
import type {
  GeocodingLookupResult,
  LocationLookupRequest,
  LocationProviderPort,
} from '../domain/ports';
import { isValidGeocodingResult, LocationCache } from './location-cache';

export type GeocodingAdapterOptions = Readonly<{
  baseUrl?: string;
  actorId?: string;
  accessToken?: string;
  timeoutMs?: number;
  defaultQuery?: string;
  defaultManualLabel?: string;
  cache?: LocationCache;
  fetchImpl?: typeof fetch;
}>;

const DEFAULT_BASE_URL = 'http://127.0.0.1:4310';
const DEFAULT_ACTOR_ID = 'reporter-1';
const DEFAULT_ACCESS_TOKEN = 'course-valid-token:reporter-1:g1';
const DEFAULT_TIMEOUT_MS = 1_000;
const DEFAULT_QUERY = 'Edificio de prueba A';
const DEFAULT_MANUAL_LABEL = 'Ubicacion manual sin geocodificacion';

export function normalizeProviderLocation(
  providerResult: unknown,
  manualLabel: string,
): IncidentLocation {
  if (isValidGeocodingResult(providerResult)) {
    return {
      source: 'provider',
      label: providerResult.label,
      latitude: providerResult.latitude,
      longitude: providerResult.longitude,
    };
  }

  return {
    source: 'manual',
    label: manualLabel,
  };
}

export class GeocodingLocationAdapter implements LocationProviderPort {
  private readonly baseUrl: string;
  private readonly actorId: string;
  private readonly accessToken: string;
  private readonly timeoutMs: number;
  private readonly defaultQuery: string;
  private readonly defaultManualLabel: string;
  private readonly cache: LocationCache;
  private readonly fetchImpl: typeof fetch;

  constructor(options: GeocodingAdapterOptions = {}) {
    this.baseUrl = (
      options.baseUrl ??
      process.env.EXPO_PUBLIC_COURSE_BACKEND_URL ??
      DEFAULT_BASE_URL
    ).replace(/\/+$/, '');
    this.actorId = options.actorId ?? DEFAULT_ACTOR_ID;
    this.accessToken = options.accessToken ?? DEFAULT_ACCESS_TOKEN;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.defaultQuery = options.defaultQuery ?? DEFAULT_QUERY;
    this.defaultManualLabel = options.defaultManualLabel ?? DEFAULT_MANUAL_LABEL;
    this.cache = options.cache ?? new LocationCache();
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async lookupLocation(query: string, scenario = 'success'): Promise<GeocodingLookupResult | null> {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      return null;
    }

    if (scenario === 'success') {
      const cached = this.cache.get(trimmedQuery);
      if (cached) {
        return cached;
      }
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const encodedQuery = encodeURIComponent(trimmedQuery);
      const response = await this.fetchImpl(`${this.baseUrl}/v1/geocoding?q=${encodedQuery}`, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'X-Course-Actor': this.actorId,
          'X-Course-Scenario': scenario,
        },
      });

      if (!response.ok) {
        return null;
      }

      const payload: unknown = await response.json();
      if (!isValidGeocodingResult(payload)) {
        return null;
      }

      const validLocation: GeocodingLookupResult = {
        label: payload.label,
        latitude: payload.latitude,
        longitude: payload.longitude,
      };

      if (scenario === 'success') {
        this.cache.set(trimmedQuery, validLocation);
      }

      return validLocation;
    } catch {
      return null;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async resolveIncidentLocation(request: LocationLookupRequest): Promise<IncidentLocation> {
    const providerResult = await this.lookupLocation(request.query, request.scenario);
    return normalizeProviderLocation(providerResult, request.manualLabel);
  }

  async describeCurrentLocation(): Promise<string> {
    const resolved = await this.resolveIncidentLocation({
      query: this.defaultQuery,
      manualLabel: this.defaultManualLabel,
    });
    return resolved.label;
  }
}
