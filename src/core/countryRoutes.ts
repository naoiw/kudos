import polyline from '@mapbox/polyline';
import source from '../assets/world-countries.json';
import type { Activity } from './types';

type Coordinate = [number, number]; // GeoJSON: [longitude, latitude]
type Ring = Coordinate[];
type Bounds = { west: number; east: number; south: number; north: number };
type Polygon = { rings: Ring[]; bounds: Bounds };
export type WorldRegion = {
  code: string;
  name: string;
  ja: string;
  polygons: Coordinate[][][];
  point?: Coordinate;
};

const regions: WorldRegion[] = [
  ...source.features,
  ...source.tiny.map(({ code, name, ja, point }) => ({
    code, name, ja, polygons: [] as Coordinate[][][], point: point as Coordinate,
  })),
];
const byCode = new Map(regions.map(region => [region.code, region]));

const polygons = source.features.map((feature) => ({
  code: feature.code,
  polygons: feature.polygons.map((rings): Polygon => {
    const coordinates = rings[0];
    return {
      rings: rings as Ring[],
      bounds: {
        west: Math.min(...coordinates.map(point => point[0])),
        east: Math.max(...coordinates.map(point => point[0])),
        south: Math.min(...coordinates.map(point => point[1])),
        north: Math.max(...coordinates.map(point => point[1])),
      },
    };
  }),
}));

function withinBounds(lat: number, lng: number, box: Bounds): boolean {
  return lat >= box.south && lat <= box.north &&
    lng >= box.west && lng <= box.east;
}

function insideRing(lat: number, lng: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) &&
        lng < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function countryInPolygons(lat: number, lng: number): string | null {
  for (const region of polygons) {
    for (const polygon of region.polygons) {
      if (!withinBounds(lat, lng, polygon.bounds)) continue;
      if (!insideRing(lat, lng, polygon.rings[0])) continue;
      if (polygon.rings.slice(1).some((hole) => insideRing(lat, lng, hole))) continue;
      return region.code;
    }
  }
  return null;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const r = Math.PI / 180;
  const dLat = (lat2 - lat1) * r;
  const dLng = (lng2 - lng1) * r;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.min(1, Math.sqrt(a)));
}

// Small territories are absent from coarse Natural Earth outlines.
// Apply a conservative radius to each tiny-country marker; for ambiguous
// mainland enclaves a much smaller radius avoids claiming nearby routes.
function tinyRadiusKm(code: string): number {
  if (['GUM', 'SGP', 'HKG', 'MAC'].includes(code)) return 22;
  if (['MCO', 'GIB', 'VAT', 'SMR', 'AND', 'LIE'].includes(code)) return 3;
  return 12;
}

const tinyPoints = source.tiny.map((region) => ({
  code: region.code,
  lat: region.point[1],
  lng: region.point[0],
  radiusKm: tinyRadiusKm(region.code),
}));

/** Resolve GPS coordinates to Natural Earth country/territory codes. */
export function countryAt(lat: number, lng: number): string | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) ||
      Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  // Tiny islands and enclaves can lie inside the larger neighbour's coarse outline.
  for (const tiny of tinyPoints) {
    if (Math.abs(lat - tiny.lat) > 0.35 ||
        Math.abs(lng - tiny.lng) > 0.35) continue;
    if (haversineKm(lat, lng, tiny.lat, tiny.lng) <= tiny.radiusKm) {
      return tiny.code;
    }
  }
  return countryInPolygons(lat, lng);
}

export function worldRegion(code: string): WorldRegion | undefined {
  return byCode.get(code);
}

export function worldRegions(): readonly WorldRegion[] {
  return regions;
}

export function regionLabel(code: string, locale: 'ja' | 'en'): string {
  const region = byCode.get(code);
  return region ? (locale === 'ja' ? region.ja : region.name) : code;
}

function countryFromLocation(location: string | null): string | null {
  const value = location?.trim();
  if (!value || /^(none|null|unknown|不明)$/i.test(value)) return null;
  let country = value;
  if (value.startsWith('{')) {
    try {
      const parsed: unknown = JSON.parse(
        value.replace(/'/g, '"').replace(/\bNone\b/g, 'null')
      );
      if (typeof parsed !== 'object' || parsed === null) return null;
      const named = (parsed as Record<string, unknown>).country;
      if (typeof named !== 'string') return null;
      country = named.trim();
    } catch {
      return null;
    }
  } else {
    // Plain "City, Country" strings put the country last.
    country = value.split(',').at(-1)?.trim() || value;
  }
  if (!country || /^(none|null|unknown|不明)$/i.test(country)) return null;
  const key = country.toLocaleLowerCase('en-US');
  if (key === 'japan' || key === '日本' || key === 'jpn') return 'JPN';
  if (key === 'usa' || key === 'us' || key === 'united states') return 'USA';
  const match = regions.find((region) =>
    region.code.toLowerCase() === key ||
    region.name.toLocaleLowerCase('en-US') === key ||
    region.ja === country
  );
  return match?.code ?? null;
}

const cache = new WeakMap<Activity, string[]>();

/** All countries/territories actually touched by retained route points. */
export function countriesForActivity(activity: Activity): string[] {
  const cached = cache.get(activity);
  if (cached) return cached;
  const result = new Set<string>();
  const explicitCountry = countryFromLocation(activity.location_country);
  if (explicitCountry) result.add(explicitCountry);
  const encoded = activity.route_segments?.length
    ? activity.route_segments
    : activity.summary_polyline ? [activity.summary_polyline] : [];
  for (const line of encoded) {
    try {
      for (const [lat, lng] of polyline.decode(line)) {
        const code = countryAt(lat, lng);
        if (code) result.add(code);
      }
    } catch {
      // Skip only the malformed segment; other segments remain usable.
    }
  }
  const codes = [...result];
  cache.set(activity, codes);
  return codes;
}
