'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');
const ReactDOMServer = require('react-dom/server');
const polyline = require('@mapbox/polyline');

function loadTs(file, dependencies = {}, injectedFetch = () => {
  throw new Error('Unexpected HTTP call');
}) {
  const raw = fs.readFileSync(file, 'utf8')
    .replaceAll('import.meta.env.BASE_URL', JSON.stringify('/kudos/'));
  const code = ts.transpileModule(raw, {
    fileName: file,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
  const exports = {};
  const mockRequire = name => {
    if (Object.prototype.hasOwnProperty.call(dependencies, name)) {
      return dependencies[name];
    }
    if (name === 'react/jsx-runtime') return require('react/jsx-runtime');
    throw new Error('Missing mock for ' + file + ': ' + name);
  };
  new Function('require', 'exports', 'fetch', code)(
    mockRequire, exports, injectedFetch
  );
  return exports;
}

const datePrecision = loadTs('src/core/datePrecision.ts');
const activityFilters = loadTs('src/core/activityFilters.ts', {
  './datePrecision': datePrecision,
});
const parseTime = value => {
  if (typeof value === 'number') return value;
  if (!value) return 0;
  return value.split(':').reduce((total, part) => total * 60 + Number(part), 0);
};
const mondayWeek = loadTs('src/core/heatmapWeek.ts');
const heatmap = loadTs('src/core/heatmapGrid.ts', {
  './heatmapWeek': mondayWeek,
  './hooks/useActivities': { parseMovingTime: parseTime },
});
const geometry = loadTs('src/core/trackGeometry.ts', {
  '@mapbox/polyline': polyline,
});
const path = 'data/exports/abcdef0123456789/chunk-0001.json';
const chunkDoc = (entries = [{ run_id: 7, route_segments: ['abc', 'def'] }]) =>
  ({ schema_version: 1, routes: entries });
const response = (value, ok = true, status = 200) =>
  ({ ok, status, json: async () => value });
const activity = (user_id, run_id, type, start_date_local, distance = 1000) => ({
  user_id, run_id, type, start_date_local, start_date: start_date_local,
  name: type, distance, moving_time: '00:15:00',
  summary_polyline: null, location_country: null,
});

test('sport, year and user scopes never mix activity records', () => {
  const acts = [
    activity('u01', 1, 'Ride', '2025-12-31T10:00:00'),
    activity('u01', 2, 'Walk', '2026-01-01T10:00:00'),
    activity('u02', 3, 'Ride', '2026-01-01T10:00:00'),
  ];
  const first = activityFilters.activitiesForUser(acts, 'u01');
  assert.deepEqual(first.map(a => a.run_id), [1, 2]);
  assert.equal(activityFilters.latestActivityYear(first), 2026);
  assert.deepEqual(activityFilters.filterActivities(first, 'Ride', 2025).map(a => a.run_id), [1]);
  assert.deepEqual(activityFilters.filterActivities(first, 'all', 2026).map(a => a.run_id), [2]);
  assert.equal(activityFilters.filterActivities(first, 'Golf', 2026).length, 0);
  assert.deepEqual(activityFilters.filterActivities(first, 'all', null).map(a => a.run_id), [1, 2]);
  assert.equal(activityFilters.latestActivityYear([]), null);
  assert.equal(acts.length, 3);
});

test('pure React user picker renders its state and dispatches user changes', () => {
  const { UserPicker } = loadTs('src/components/UserPicker.tsx');
  const users = [
    { user_id: 'u01', display_name: 'ユーザー1' },
    { user_id: 'u02', display_name: 'ユーザー2' },
  ];
  const changed = [];
  const props = {
    users, selectedUserId: 'u01', locale: 'ja',
    onChange: id => changed.push(id),
  };
  const html = ReactDOMServer.renderToStaticMarkup(
    React.createElement(UserPicker, props)
  );
  assert.match(html, /aria-label="表示するユーザー"/);
  assert.match(html, /value="u01" selected=""/);
  assert.match(html, /value="u02"/);
  const element = UserPicker(props);
  const selector = React.Children.toArray(element.props.children)
    .find(child => child.type === 'select');
  assert.ok(selector);
  selector.props.onChange({ target: { value: 'u02' } });
  assert.deepEqual(changed, ['u02']);
  const enHtml = ReactDOMServer.renderToStaticMarkup(
    React.createElement(UserPicker, { ...props, locale: 'en', selectedUserId: 'u02' })
  );
  assert.match(enHtml, /aria-label="Selected user"/);
});

test('heatmap Monday-first dates, 2024 leap year, and daily totals', () => {
  const acts = [
    activity('u01', 1, 'Ride', '2024-01-01T09:00:00', 4000),
    activity('u01', 2, 'Walk', '2024-01-01T12:00:00', 1000),
    activity('u01', 3, 'Golf', '2024-12-31T12:00:00', 7000),
  ];
  const year = heatmap.buildYearGrid(2024, acts, false, true);
  assert.equal(year.stats.count, 3);
  assert.equal(year.stats.distance, 12000);
  assert.equal(year.grid.flat().length, 366);
  assert.equal(year.grid[0][0].date, '2024-01-01');
  assert.equal(year.grid[0][0].distance, 5000);
  assert.equal(year.grid[0][0].activities.length, 2);
  assert.equal(year.grid.at(-1).at(-1).date, '2024-12-31');
  assert.equal(year.monthPositions.length, 12);

  const sunday = heatmap.buildYearGrid(2023,
    [activity('u01', 4, 'Ride', '2023-01-01T09:00:00')], false, false);
  assert.equal(sunday.grid[0].length, 1);
  assert.equal(sunday.grid[0][0].date, '2023-01-01');
  assert.equal(mondayWeek.mondayFirstWeekdayIndex(0), 6);
  assert.equal(sunday.stats.count, 1);
});

test('map track thumbnail is deterministic and tolerates missing/corrupted geometry', () => {
  const encoded = polyline.encode([[35.6812, 139.7671], [35.682, 139.768]]);
  const points = geometry.renderTrackSVG(encoded);
  assert.match(points, /^\d/);
  assert.equal(points.split(' ').length, 2);
  assert.equal(geometry.renderTrackSVG(''), '');
  assert.equal(geometry.renderTrackSVG(polyline.encode([[35.68, 139.76]])), '');
});

test('route chunk reader limits concurrency and joins records across chunks', async () => {
  const paths = Array.from({ length: 8 }, (_, n) =>
    'data/exports/abcdef0123456789/chunk-' + String(n + 1).padStart(4, '0') + '.json'
  );
  const called = [];
  let active = 0, maximum = 0;
  const fetchMock = async url => {
    called.push(url);
    active++;
    maximum = Math.max(maximum, active);
    await new Promise(resolve => setImmediate(resolve));
    active--;
    const id = Number(url.slice(-9, -5));
    return response(chunkDoc([{ run_id: id, route_segments: ['route-' + id] }]));
  };
  const loader = loadTs('src/core/routeChunks.ts');
  const routes = await loader.loadRouteChunks(paths, '/kudos/', fetchMock);
  assert.equal(routes.size, 8);
  assert.equal(called.length, 8);
  assert.equal(maximum, 6);
  assert.equal(routes.get(1)[0], 'route-1');
});

test('route chunk fetch rejects malformed, missing, duplicate and unsafe data', async () => {
  const loader = loadTs('src/core/routeChunks.ts');
  const load = (paths, doc, ok = true) =>
    loader.loadRouteChunks(paths, '/kudos/', async () => response(doc, ok, 404));
  await assert.rejects(load(['../secrets'], chunkDoc()), /Invalid route chunk path/);
  await assert.rejects(load([path], chunkDoc(), false), /could not be fetched/);
  await assert.rejects(load([path], { schema_version: 9, routes: [] }), /format/);
  await assert.rejects(load([path], { schema_version: 1 }), /format/);
  await assert.rejects(load([path], chunkDoc([{ run_id: 2, route_segments: [] }])), /Invalid or duplicated/);
  await assert.rejects(load([path], chunkDoc([
    { run_id: 7, route_segments: ['one'] }, { run_id: 7, route_segments: ['two'] },
  ])), /Invalid or duplicated/);
});

function loadCatalogWith(manifest, chunks = {}, demo = []) {
  const mockFetch = async url => {
    if (url === '/kudos/data/preview.json') return response(manifest);
    if (url === '/demo.json') return response(demo);
    if (Object.prototype.hasOwnProperty.call(chunks, url)) return chunks[url];
    return response(null, false, 404);
  };
  const loader = loadTs('src/core/routeChunks.ts', {}, mockFetch);
  const hooks = loadTs('src/core/hooks/useActivities.ts', {
    react: { useMemo: fn => fn() },
    '../sports': { resolveActivitySport: (_name, type) =>
      ['Ride', 'Walk', 'Golf'].includes(type) ? type : null },
    '../datePrecision': datePrecision,
    '../activityFilters': activityFilters,
    '../routeChunks': loader,
    '@/static/activities.json?url': '/demo.json',
  }, mockFetch);
  return hooks;
}
async function getCatalog(hooks) {
  try {
    return hooks.getActivityCatalog();
  } catch (value) {
    if (!value || typeof value.then !== 'function') throw value;
    await value;
    return hooks.getActivityCatalog();
  }
}

test('legacy schema v1 remains readable and month-only dates discard fake days', async () => {
  const older = {
    schema_version: 1, mode: 'public-stats-preview', date_precision: 'month',
    users: [{ user_id: 'u01', display_name: 'One' }],
    activities: [activity('u01', 1, 'Ride', '2026-10-14T13:24:00')],
  };
  const catalog = await getCatalog(loadCatalogWith(older));
  assert.equal(catalog.mode, 'public-preview');
  assert.equal(catalog.datePrecision, 'month');
  assert.equal(catalog.activities[0].start_date_local, '2026-10');
  assert.equal(catalog.activities[0].route_segments, undefined);
});

test('schema v2 retains route segments, user identity and exact dates', async () => {
  const manifest = {
    schema_version: 2, mode: 'public-stats-preview', date_precision: 'exact',
    users: [{ user_id: 'u01', display_name: 'One' }, { user_id: 'u02', display_name: 'Two' }],
    route_chunks: [path],
    activities: [
      activity('u02', 7, 'Golf', '2026-11-14T10:00:00'),
    ],
  };
  const hooks = loadCatalogWith(manifest, {
    ['/kudos/' + path]: response(chunkDoc()),
  });
  const catalog = await getCatalog(hooks);
  assert.equal(catalog.activities.length, 1);
  assert.equal(catalog.activities[0].user_id, 'u02');
  assert.equal(catalog.activities[0].route_segments.length, 2);
  assert.equal(catalog.datePrecision, 'exact');
  assert.equal(activityFilters.activitiesForUser(catalog.activities, 'u01').length, 0);
  assert.equal(activityFilters.activitiesForUser(catalog.activities, 'u02').length, 1);
});

test('broken published v2 route data surfaces an error, never fake demo routes', async () => {
  const manifest = {
    schema_version: 2, mode: 'public-stats-preview', date_precision: 'exact',
    users: [{ user_id: 'u01', display_name: 'One' }],
    route_chunks: [path],
    activities: [activity('u01', 7, 'Ride', '2026-11-14T10:00:00')],
  };
  const demo = [activity('demo', 999, 'Ride', '2025-01-01T10:00:00')];
  await assert.rejects(
    getCatalog(loadCatalogWith(manifest, {}, demo)),
    /Route chunk could not be fetched/
  );
});

test('unknown preview schema retains the existing synthetic demo fallback', async () => {
  const hooks = loadCatalogWith({ schema_version: 9 }, {}, [
    activity('demo', 100, 'Walk', '2025-01-01T12:00:00'),
  ]);
  const catalog = await getCatalog(hooks);
  assert.equal(catalog.mode, 'demo');
  assert.equal(catalog.activities[0].run_id, 100);
});
