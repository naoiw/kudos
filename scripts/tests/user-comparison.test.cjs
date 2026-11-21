'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

const source = fs.readFileSync('src/core/userComparison.ts', 'utf8');
const compiled = ts.transpileModule(source, {
  fileName: 'src/core/userComparison.ts',
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true,
  },
}).outputText;
const comparison = {};
new Function('require', 'exports', compiled)((name) => {
  if (name === './hooks/useActivities') {
    return { parseMovingTime: value =>
      value.split(':').reduce((total, part) => total * 60 + Number(part), 0) };
  }
  if (name === './prefectureRoutes') {
    return { prefecturesForActivity: activity => activity.visited ?? [] };
  }
  throw new Error('Unexpected module: ' + name);
}, comparison);

const activity = (user_id, date, type, distance, visited = [], moving_time = '01:00:00') => ({
  user_id, start_date_local: date, type, distance, visited, moving_time,
});

test('comparison uses only selected users and the same sport and period for every user', () => {
  const data = [
    activity('u1', '2025-12-31T08:00:00', 'Ride', 11000, ['東京都']),
    activity('u1', '2026-01-02T08:00:00', 'Ride', 5000, ['東京都', '神奈川県']),
    activity('u1', '2026-01-04T08:00:00', 'Walk', 2000, ['東京都']),
    activity('u2', '2026-01-02T08:00:00', 'Ride', 7000, ['千葉県'], '00:30:00'),
    activity('u2', '2026-02-01T08:00:00', 'Golf', 9000, ['千葉県']),
    activity('private', '2026-01-02T08:00:00', 'Ride', 999999, ['北海道']),
  ];
  const result = comparison.compareUsers(data, ['u1', 'u2'], 'Ride', 'year', 2026, 1, 'exact');
  assert.deepEqual(result.map(value => value.activityCount), [1, 1]);
  assert.deepEqual(result.map(value => value.distanceMeters), [5000, 7000]);
  assert.deepEqual(result.map(value => value.movingSeconds), [3600, 1800]);
  assert.deepEqual(result.map(value => value.prefectureCount), [2, 1]);
  assert.equal(result[0].trend.length, 12);
  assert.equal(result[0].trend[0].km, 5);
  assert.equal(result[1].trend[1].km, 0);
  assert.equal(result[0].trend.reduce((sum, bucket) => sum + bucket.km, 0), 5);
  assert.equal(data.length, 6, 'aggregator must not mutate the catalog');
});

test('Life is all years, month uses the local date, and leap-year days are valid', () => {
  const data = [
    activity('a', '2024-02-29T23:30:00', 'Walk', 3000, ['東京都']),
    activity('a', '2025-02-28T21:00:00', 'Walk', 6000, ['東京都']),
    activity('b', '2024-02-29T00:30:00', 'Walk', 1200, ['大阪府']),
  ];
  assert.deepEqual(comparison.comparisonYears(data), [2025, 2024]);
  const life = comparison.compareUsers(data, ['a', 'b'], 'all', 'life', 2024, 1, 'exact');
  assert.deepEqual(life.map(item => item.activityCount), [2, 1]);
  assert.deepEqual(life[0].trend.map(bucket => bucket.label), ['2024', '2025']);
  assert.deepEqual(life[0].trend.map(bucket => bucket.km), [3, 6]);
  const month = comparison.compareUsers(data, ['a', 'b'], 'Walk', 'month', 2024, 2, 'exact');
  assert.equal(month[0].activityCount, 1);
  assert.equal(month[0].trend.length, 29);
  assert.equal(month[0].trend[28].km, 3);
  assert.equal(month[1].trend[28].km, 1.2);
});

test('month-only disclosure omits fake daily series but retains true monthly totals', () => {
  const data = [
    activity('a', '2026-05', 'Ride', 12000),
    activity('b', '2026-05', 'Ride', 8000),
  ];
  const month = comparison.compareUsers(data, ['a', 'b'], 'Ride', 'month', 2026, 5, 'month');
  assert.deepEqual(month.map(item => item.distanceMeters), [12000, 8000]);
  assert.deepEqual(month.map(item => item.trend), [[], []]);
  const year = comparison.compareUsers(data, ['a', 'b'], 'Ride', 'year', 2026, 5, 'month');
  assert.equal(year[0].trend[4].km, 12);
  assert.equal(year[1].trend[4].km, 8);
});

test('empty users, duplicate selections, and missing activity records remain isolated', () => {
  const data = [
    activity('a', '2026-03-01', 'Ride', 15000, ['東京都', '東京都']),
    activity('a', '2026-03-02', 'Ride', 1000, ['東京都', '千葉県']),
  ];
  const result = comparison.compareUsers(data, ['b', 'a', 'a'], 'Ride', 'year', 2026, 1, 'month');
  assert.deepEqual(result.map(item => item.userId), ['b', 'a']);
  assert.equal(result[0].activityCount, 0);
  assert.equal(result[0].prefectureCount, 0);
  assert.ok(result[0].trend.every(bucket => bucket.km === 0));
  assert.equal(result[1].prefectureCount, 2);
  assert.deepEqual(comparison.compareUsers(data, [], 'all', 'life', 2026, 1, 'month'), []);
});

test('comparison is linked from the header and consumes approved catalog activities only', () => {
  const header = fs.readFileSync('src/components/Header.tsx', 'utf8');
  const dashboard = fs.readFileSync('src/themes/dashboard/index.tsx', 'utf8');
  const page = fs.readFileSync('src/components/ComparePage.tsx', 'utf8');
  assert.match(header, /page: 'compare'/);
  assert.match(dashboard, /route === 'compare'/);
  assert.match(dashboard, /<ComparePage[\s\S]*?users=\{catalog\.users\}[\s\S]*?activities=\{catalog\.activities\}/);
  assert.match(dashboard, /page === 'compare' \? catalog\.activities : activities/);
  assert.match(page, /selectedUsers\.length < 2/);
  assert.match(page, /datePrecision === 'month' && period === 'month'/);
  assert.match(page, /aria-label=\{ja \? '比較するユーザー' : 'Users to compare'\}/);
});
