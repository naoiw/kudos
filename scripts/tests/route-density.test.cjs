'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const polyline = require('@mapbox/polyline');

const source = fs.readFileSync('src/core/routeDensity.ts', 'utf8');
const js = ts.transpileModule(source, {
  fileName: 'src/core/routeDensity.ts',
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true,
  },
}).outputText;
const density = {};
new Function('require', 'exports', js)(name => {
  if (name === '@mapbox/polyline') return polyline;
  throw new Error('Unexpected dependency: ' + name);
}, density);

const encode = (...points) => polyline.encode(points);
const a = [35.6800, 139.7600];
const b = [35.6810, 139.7610];
const c = [35.6820, 139.7620];
const d = [35.6900, 139.7700];

test('a grid cell is counted once per activity, not once per GPS point or return pass', () => {
  const same = encode(a, b, c);
  const outAndBack = encode(a, b, c, b, a, b, c);
  const result = density.calculateRouteDensity([
    { summary_polyline: outAndBack },
    { summary_polyline: same },
  ]);
  assert.equal(result.activityCount, 2);
  assert.ok(result.cells.length > 2);
  assert.ok(result.cells.every(cell => cell.count === 2));
  assert.equal(result.maxCount, 2);
  const projected = density.densityGridPoint(a[0], a[1]);
  assert.ok(projected?.every(Number.isFinite));
  assert.equal(density.densityColor(1), '#2563eb');
  assert.equal(density.densityColor(2), '#f59e0b');
  assert.equal(density.densityColor(4), '#ef4444');
});

test('multiple GPX segments do not bridge the gap between their endpoints', () => {
  const result = density.calculateRouteDensity([
    { route_segments: [encode(a, b), encode(d, [35.691, 139.771])] },
  ]);
  assert.equal(result.activityCount, 1);
  const middle = density.calculateRouteDensity([
    { route_segments: [encode([35.685, 139.765], [35.686, 139.766])] },
  ]);
  const firstKeys = new Set(result.cells.map(({ x, y }) => x + ',' + y));
  const midpointKeys = middle.cells.map(({ x, y }) => x + ',' + y);
  assert.ok(midpointKeys.every(key => !firstKeys.has(key)));
});

test('empty, invalid, and incomplete routes are ignored safely', () => {
  const result = density.calculateRouteDensity([
    { summary_polyline: null },
    { route_segments: [encode(a), encode([95, 200], [95.1, 200.1])] },
    { route_segments: [], summary_polyline: encode(a, b) },
  ]);
  assert.equal(result.activityCount, 1);
  assert.ok(result.cells.length > 0);
  assert.ok(result.bounds);
  const empty = density.calculateRouteDensity([]);
  assert.deepEqual(empty, { cells: [], activityCount: 0, maxCount: 0, bounds: null });
});

test('enough independent visits produce high-density cells', () => {
  const routes = Array.from({ length: 5 }, () => ({ summary_polyline: encode(a, b, c) }));
  const result = density.calculateRouteDensity(routes);
  assert.equal(result.activityCount, 5);
  assert.equal(result.maxCount, 5);
  assert.ok(result.cells.every(cell => cell.count === 5));
  const [southwest, northeast] = result.bounds;
  assert.ok(southwest[0] < northeast[0] && southwest[1] < northeast[1]);
});

test('map sources remain selected-user/year/sport/region scoped; worker is cancellable', () => {
  const dashboard = fs.readFileSync('src/themes/dashboard/index.tsx', 'utf8');
  const map = fs.readFileSync('src/components/RouteMapCanvas.tsx', 'utf8');
  const layer = fs.readFileSync('src/components/RouteDensityOverlay.tsx', 'utf8');
  const worker = fs.readFileSync('src/workers/routeDensity.worker.ts', 'utf8');
  assert.match(dashboard, /<RouteMap[\s\S]*?activities=\{filtered\}[\s\S]*?allActivities=\{filtered\}/);
  assert.match(map, /worker\.postMessage\(activities\.map/);
  assert.match(map, /worker\?\.terminate\(\)/);
  assert.match(map, /viewMode === 'density' && !selectedActivity/);
  assert.match(map, /aria-pressed=\{viewMode === mode\}/);
  assert.match(layer, /route-map-density-canvas/);
  const css = fs.readFileSync('src/components/RouteMap.css', 'utf8');
  const densityRule = css.split('.route-map-density-canvas')[1]?.split('}')[0] ?? '';
  assert.match(densityRule, /pointer-events: none/);
  assert.match(worker, /calculateRouteDensity\(data\)/);
});
