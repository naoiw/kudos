import polyline from '@mapbox/polyline';
import boundaries from '../assets/japan-prefectures.json';
import type { Activity } from './types';

type Coordinate = [number, number]; // [longitude, latitude]
type Ring = Coordinate[];
type Box = { west: number; east: number; south: number; north: number };
type Polygon = { rings: Ring[]; box: Box };
type Prefecture = { name: string; polygons: Polygon[]; mainBounds: Box };

const NAMES = [
  '北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県',
  '茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県',
  '新潟県','富山県','石川県','福井県','山梨県','長野県','岐阜県',
  '静岡県','愛知県','三重県','滋賀県','京都府','大阪府','兵庫県',
  '奈良県','和歌山県','鳥取県','島根県','岡山県','広島県','山口県',
  '徳島県','香川県','愛媛県','高知県','福岡県','佐賀県','長崎県',
  '熊本県','大分県','宮崎県','鹿児島県','沖縄県',
] as const;

const boxForRing = (ring: Ring): Box => {
  let west = Infinity, east = -Infinity, south = Infinity, north = -Infinity;
  for (const [lng, lat] of ring) {
    west = Math.min(west, lng);
    east = Math.max(east, lng);
    south = Math.min(south, lat);
    north = Math.max(north, lat);
  }
  return { west, east, south, north };
};

const ringArea = (ring: Ring): number => {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
};

const prefectures: Prefecture[] = boundaries.features
  .map((feature) => {
    const coordinateSets: Coordinate[][][] =
      feature.geometry.type === 'Polygon'
        ? [feature.geometry.coordinates as Coordinate[][]]
        : feature.geometry.coordinates as Coordinate[][][];
    const polygons = coordinateSets
      .filter((polygon) => polygon.length > 0 && polygon[0].length >= 3)
      .map((rings) => ({ rings, box: boxForRing(rings[0]) }));
    let main = polygons[0];
    for (const polygon of polygons) {
      if (ringArea(polygon.rings[0]) > ringArea(main.rings[0])) main = polygon;
    }
    return {
      name: NAMES[feature.properties.code - 1],
      polygons,
      mainBounds: main.box,
    };
  })
  .filter((prefecture): prefecture is Prefecture => Boolean(prefecture.name));

function inBox(lat: number, lng: number, box: Box): boolean {
  return lat >= box.south && lat <= box.north &&
    lng >= box.west && lng <= box.east;
}

// GeoJSON coordinate order is longitude, latitude; holes are subtracted.
function inRing(lat: number, lng: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) &&
        lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

export function prefectureAt(lat: number, lng: number): string | null {
  for (const prefecture of prefectures) {
    for (const polygon of prefecture.polygons) {
      if (!inBox(lat, lng, polygon.box)) continue;
      if (!inRing(lat, lng, polygon.rings[0])) continue;
      if (polygon.rings.slice(1).some((hole) => inRing(lat, lng, hole))) continue;
      return prefecture.name;
    }
  }
  return null;
}

function validSegments(activity: Activity): Coordinate[][] {
  const encoded = activity.route_segments?.length
    ? activity.route_segments
    : activity.summary_polyline ? [activity.summary_polyline] : [];
  const segments: Coordinate[][] = [];
  for (const route of encoded) {
    try {
      const points = polyline.decode(route)
        .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng) &&
          Math.abs(lat) <= 90 && Math.abs(lng) <= 180)
        .map(([lat, lng]) => [lng, lat] as Coordinate);
      if (points.length >= 2) segments.push(points);
    } catch {
      // Malformed segment must not hide other activities.
    }
  }
  return segments;
}

const activityCache = new WeakMap<Activity, string[]>();

/**
 * Determine every prefecture visited by a GPX route, not just its start point.
 * Works with multi-segment tracks; use manual prefecture override as fallback.
 */
export function prefecturesForActivity(activity: Activity): string[] {
  const cached = activityCache.get(activity);
  if (cached) return cached;
  const result = new Set<string>();
  if (activity.location_country) {
    for (const name of NAMES) {
      if (activity.location_country.includes(name)) result.add(name);
    }
  }
  for (const segment of validSegments(activity)) {
    // Check all retained track points to catch prefectures crossed en route.
    for (const [lng, lat] of segment) {
      const name = prefectureAt(lat, lng);
      if (name) result.add(name);
    }
  }
  const names = [...result];
  activityCache.set(activity, names);
  return names;
}

export type MapBounds = [[number, number], [number, number]];

/** Main island/landmass is used when the prefecture includes remote islands. */
export function prefectureBounds(name: string): MapBounds | null {
  const prefecture = prefectures.find((p) => p.name === name);
  if (!prefecture) return null;
  const { south, west, north, east } = prefecture.mainBounds;
  return [[south, west], [north, east]];
}

/** Focus on the portion of the selected activity routes inside a prefecture. */
export function activityPointsInPrefecture(
  activities: Activity[],
  name: string
): [number, number][] {
  const points: [number, number][] = [];
  for (const activity of activities) {
    for (const segment of validSegments(activity)) {
      for (const [lng, lat] of segment) {
        if (prefectureAt(lat, lng) === name) points.push([lat, lng]);
      }
    }
  }
  return points;
}
