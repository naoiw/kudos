'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('typescript');
const polyline = require('@mapbox/polyline');

function loadTs(filename, dependencies = {}) {
  const transpiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      resolveJsonModule: true,
    },
  }).outputText;
  const exports = {};
  vm.runInNewContext(transpiled, {
    exports,
    require(name) {
      if (name in dependencies) return dependencies[name];
      throw new Error('Unexpected dependency ' + name);
    },
  }, { filename });
  return exports;
}

const boundaries = JSON.parse(
  fs.readFileSync(path.join('src', 'assets', 'japan-prefectures.json'), 'utf8')
);
const geography = loadTs('src/core/prefectureRoutes.ts', {
  '@mapbox/polyline': polyline,
  '../assets/japan-prefectures.json': boundaries,
});
const achievements = loadTs('src/core/locationAchievements.ts', {
  './prefectureRoutes': geography,
});
const activity = (segments, country = null, type = 'Ride') => ({
  type,
  location_country: country,
  route_segments: segments.map(points => polyline.encode(points)),
  summary_polyline: null,
});

test('profile geography is derived from GPX even when all location fields are null', () => {
  const tokyo = activity([[[35.68, 139.75], [35.69, 139.77]]]);
  const osaka = activity([[[34.68, 135.50], [34.69, 135.51]]]);
  assert.ok(geography.prefecturesForActivity(tokyo).includes('東京都'));
  assert.ok(geography.prefecturesForActivity(osaka).includes('大阪府'));

  const first = achievements.locationAchievements([tokyo]);
  assert.equal(first.countryCount, 1);
  assert.equal(first.prefectureCount, 1);

  const together = achievements.locationAchievements([tokyo, osaka, tokyo]);
  assert.equal(together.countryCount, 1);
  assert.equal(together.prefectureCount, 2);
  assert.equal(achievements.locationAchievements([osaka]).prefectureCount, 1);
});

test('multi-prefecture routes, metadata, and missing GPS have safe counting', () => {
  const across = activity([[[35.68, 139.75], [35.69, 139.77]],
    [[34.68, 135.50], [34.69, 135.51]]]);
  assert.equal(achievements.locationAchievements([across]).prefectureCount, 2);

  const unknown = activity([], null);
  const manualPref = activity([], '東京都');
  const abroad = activity([], "{'country': 'France'}");
  const japan = activity([], 'Tokyo, Japan');
  const stats = achievements.locationAchievements([
    unknown, manualPref, abroad, japan,
  ]);
  assert.equal(stats.countryCount, 2);
  assert.equal(stats.prefectureCount, 1);
  assert.equal(achievements.locationAchievements([unknown]).countryCount, 0);
});

test('profile uses the same GPS route detector as JapanMap and respects sport filter', () => {
  const profile = fs.readFileSync('src/components/ProfileCard.tsx', 'utf8');
  const japanMap = fs.readFileSync('src/components/JapanMap.tsx', 'utf8');
  assert.match(profile, /locationAchievements\(filteredActivities\)/);
  assert.match(profile, /\[filteredActivities\]/);
  assert.match(japanMap, /prefecturesForActivity\(activity\)/);
  assert.match(profile, /countryCount\} \{t\('countries'\)\}/);
  assert.match(profile, /prefectureCount\} \{t\('provinces'\)\}/);
  assert.doesNotMatch(profile, /const loc = a\.location_country/);
});
