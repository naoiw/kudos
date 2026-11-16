import polyline from '@mapbox/polyline';

// Zoom-14 Web Mercator cells of about 80 meters in Japan.
export const CELL_SIZE = 12;
const WORLD = 256 * 2 ** 14;
export interface DensityTrack { summary_polyline?: string | null; route_segments?: string[] }
export interface DensityCell { x: number; y: number; count: number }
export interface DensityResult {
  cells: DensityCell[];
  activityCount: number;
  bounds: [[number, number], [number, number]] | null;
  maxCount: number;
}
export const unproject = (x: number, y: number): [number, number] => [
  Math.atan(Math.sinh(Math.PI * (1 - 2 * y / WORLD))) * 180 / Math.PI,
  x / WORLD * 360 - 180,
];
export function densityGridPoint(lat: number, lng: number): [number, number] | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) ||
    Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  const radians = Math.max(-85.05112878, Math.min(85.05112878, lat)) * Math.PI / 180;
  return [
    ((lng + 180) / 360 * WORLD) / CELL_SIZE,
    ((1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) * WORLD / 2) / CELL_SIZE,
  ];
}
function visit(a: [number, number], b: [number, number], seen: Set<string>): void {
  let x = Math.floor(a[0]), y = Math.floor(a[1]);
  const endX = Math.floor(b[0]), endY = Math.floor(b[1]);
  const dx = b[0] - a[0], dy = b[1] - a[1];
  // Ignore GPS teleports or path discontinuities, not real segments.
  if (Math.abs(endX - x) + Math.abs(endY - y) > 2500) return;
  const sx = Math.sign(dx), sy = Math.sign(dy);
  const stepX = sx ? Math.abs(1 / dx) : Infinity;
  const stepY = sy ? Math.abs(1 / dy) : Infinity;
  let nextX = sx > 0 ? (x + 1 - a[0]) * stepX :
    sx < 0 ? (a[0] - x) * stepX : Infinity;
  let nextY = sy > 0 ? (y + 1 - a[1]) * stepY :
    sy < 0 ? (a[1] - y) * stepY : Infinity;
  seen.add(x + ',' + y);
  for (let i = 0; (x !== endX || y !== endY) && i < 2501; i++) {
    if (nextX < nextY) { x += sx; nextX += stepX; }
    else if (nextY < nextX) { y += sy; nextY += stepY; }
    else { x += sx; y += sy; nextX += stepX; nextY += stepY; }
    seen.add(x + ',' + y);
  }
}
/** Each activity contributes once to a grid cell, regardless of track point density. */
export function calculateRouteDensity(tracks: readonly DensityTrack[]): DensityResult {
  const totals = new Map<string, number>();
  let activityCount = 0;
  for (const track of tracks) {
    const routes = track.route_segments?.length
      ? track.route_segments : track.summary_polyline ? [track.summary_polyline] : [];
    const seen = new Set<string>();
    for (const route of routes) {
      let points: number[][];
      try { points = polyline.decode(route); } catch { continue; }
      let prior: [number, number] | null = null;
      for (const point of points) {
        const current = densityGridPoint(point[0], point[1]);
        if (prior && current) visit(prior, current, seen);
        prior = current;
      }
    }
    if (!seen.size) continue;
    activityCount++;
    for (const key of seen) totals.set(key, (totals.get(key) ?? 0) + 1);
  }
  const cells: DensityCell[] = [];
  let south = Infinity, west = Infinity, north = -Infinity, east = -Infinity;
  let maxCount = 0;
  for (const [key, count] of totals) {
    const [x, y] = key.split(',').map(Number);
    const nw = unproject(x * CELL_SIZE, y * CELL_SIZE);
    const se = unproject((x + 1) * CELL_SIZE, (y + 1) * CELL_SIZE);
    south = Math.min(south, se[0]); north = Math.max(north, nw[0]);
    west = Math.min(west, nw[1]); east = Math.max(east, se[1]);
    maxCount = Math.max(maxCount, count);
    cells.push({ x, y, count });
  }
  return { cells, activityCount, maxCount,
    bounds: cells.length ? [[south, west], [north, east]] : null };
}
export function densityColor(count: number): string {
  return count >= 4 ? '#ef4444' : count >= 2 ? '#f59e0b' : '#2563eb';
}
