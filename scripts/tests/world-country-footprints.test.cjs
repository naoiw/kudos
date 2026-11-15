'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const polyline = require('@mapbox/polyline');

const world = JSON.parse(fs.readFileSync('src/assets/world-countries.json', 'utf8'));
const script = ts.transpileModule(
  fs.readFileSync('src/core/countryRoutes.ts', 'utf8'),
  {
    fileName: 'countryRoutes.ts',
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      resolveJsonModule: true,
    },
  }
).outputText;
const functions = {};
vm.runInNewContext(script, {
  exports: functions,
  require(name) {
    if (name === '@mapbox/polyline') return polyline;
    if (name === '../assets/world-countries.json') return world;
    throw new Error('Unexpected dependency: ' + name);
  },
});

function activity(points, country = null) {
  return {
    route_segments: points.map(segment => polyline.encode(segment)),
    summary_polyline: null,
    location_country: country,
  };
}

test('actual GPS coordinates recognize Japan and overseas countries', () => {
  assert.equal(functions.countryAt(35.68, 139.75), 'JPN');
  assert.equal(functions.countryAt(48.86, 2.35), 'FRA');
  assert.equal(functions.countryAt(40.71, -74.00), 'USA');
  assert.equal(functions.countryAt(25.05, 121.50), 'TWN');
  assert.equal(functions.countryAt(1.35, 103.81), 'SGP');
  assert.equal(functions.countryAt(13.45, 144.77), 'GUM');
  assert.equal(functions.countryAt(22.40, 114.10), 'HKG');
  assert.equal(functions.countryAt(999, 180), null);
  assert.equal(functions.regionLabel('JPN', 'ja'), '日本');
});

test('separate route segments crossing countries are classified independently', () => {
  const route = activity([
    [[35.68, 139.75], [35.69, 139.76]],
    [[48.85, 2.34], [48.86, 2.35]],
  ]);
  const codes = functions.countriesForActivity(route);
  assert.deepEqual([...codes].sort(), ['FRA', 'JPN']);
  assert.equal(functions.countriesForActivity(route), codes);
});

test('foreign location metadata is accepted without GPS; duplicated visits stay unique', () => {
  const paris = activity([[[48.85, 2.34], [48.86, 2.35]]]);
  const explicit = activity([], "{'country': 'France'}");
  const japan = activity([], 'Tokyo, Japan');
  assert.deepEqual([...functions.countriesForActivity(explicit)], ['FRA']);
  assert.deepEqual([...functions.countriesForActivity(japan)], ['JPN']);
  const unique = new Set([
    ...functions.countriesForActivity(paris),
    ...functions.countriesForActivity(explicit),
    ...functions.countriesForActivity(japan),
  ]);
  assert.equal(unique.size, 2);
});

test('world footprints share the global sport/year selection and route map scope', () => {
  const dashboard = fs.readFileSync('src/themes/dashboard/index.tsx', 'utf8');
  const map = fs.readFileSync('src/components/WorldMap.tsx', 'utf8');
  assert.match(dashboard, /const \[selectedCountry, setSelectedCountry\]/);
  assert.match(dashboard, /countriesForActivity\(activity\)\.includes\(selectedCountry\)/);
  assert.match(dashboard, /<WorldMap[\s\S]*?activities=\{baseFiltered\}/);
  assert.match(dashboard, /<RouteMap[\s\S]*?activities=\{filtered\}/);
  assert.match(dashboard, /<ProfileCard activities=\{yearFiltered\} filter=\{filter\}/);
  assert.match(map, /countriesForActivity\(activity\)/);
  assert.match(map, /onSelectCountry\(selectedCountry === code \? null : code\)/);
});
