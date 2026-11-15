'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function parseMovingTime(value) {
  if (typeof value === 'number') return value;
  if (!value) return 0;
  return value.split(':').reduce((seconds, part) => seconds * 60 + Number(part), 0);
}
const source = fs.readFileSync('src/core/sportMetrics.ts', 'utf8');
const code = ts.transpileModule(source, {
  fileName: 'sportMetrics.ts',
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const sport = {};
vm.runInNewContext(code, {
  exports: sport,
  require(name) {
    if (name === './hooks/useActivities') return { parseMovingTime };
    throw new Error('Unexpected import: ' + name);
  },
});
function activity(type, date, distance, moving_time, elevation_gain = null, average_speed = 0) {
  return {
    type, start_date_local: date, distance, moving_time,
    elevation_gain, average_speed,
  };
}
const samples = [
  activity('Ride', '2026-11-01T09:00:00', 10000, '00:30:00', 140, 5.556),
  activity('Ride', '2026-11-02T09:00:00', 5000, '00:15:00', 40, 5.556),
  activity('Walk', '2026-11-01T10:00:00', 2000, '00:30:00', null, 1.111),
  activity('Walk', '2026-11-02T10:00:00', 3000, '00:45:00', null, 1.111),
  activity('Golf', '2026-11-01T11:00:00', 12000, '03:00:00', null, 1.111),
  activity('Golf', '2026-11-03T11:00:00', 5000, '01:30:00', null, 1.111),
];
const metricMap = (filter, precision = 'exact', acts = samples) =>
  Object.fromEntries(Array.from(sport.sportMetrics(acts, filter, 'ja', precision))
    .map(metric => [metric.key, metric.value]));

test('cycling totals, duration, elevation and weighted speed are correct', () => {
  const m = metricMap('Ride');
  assert.equal(m.activityCount, '2');
  assert.equal(m.movingTime, '0h 45m');
  assert.equal(m.distance, '15 km');
  assert.equal(m.averageSpeed, '20 km/h');
  assert.equal(m.elevationGain, '180 m');
  assert.equal(m.longestDistance, '10 km');
  assert.equal(m.averageDistance, '7.5 km');
  assert.equal(m.averagePace, undefined);
});

test('walking pace is time-and-distance weighted, and days not sessions count for streak', () => {
  const m = metricMap('Walk');
  assert.equal(m.activityCount, '2');
  assert.equal(m.distance, '5 km');
  assert.equal(m.movingTime, '1h 15m');
  assert.equal(m.averagePace, '15:00 /km');
  assert.equal(m.longestStreak, '2 日');
  assert.equal(m.averageSpeed, undefined);
  assert.equal(metricMap('Walk', 'month').longestStreak, undefined);
  assert.equal(sport.longestActivityStreak([
    ...samples.filter(a => a.type === 'Walk'),
    activity('Walk', '2026-11-02T14:00:00', 1000, '00:20:00'),
  ]), 2);
});

test('golf uses only walking distance, activity counts and time; never pace or scores', () => {
  const m = metricMap('Golf');
  assert.equal(m.activityCount, '2');
  assert.equal(m.movingTime, '4h 30m');
  assert.equal(m.walkingDistance, '17 km');
  assert.equal(m.averageDistance, '8.5 km');
  assert.equal(m.longestDistance, '12 km');
  assert.equal(m.averageSpeed, undefined);
  assert.equal(m.averagePace, undefined);
  assert.equal(sport.activityMotionValue(samples[4]), '—');
});

test('all-sport summaries count every activity without misleading mixed-speed metrics', () => {
  const m = metricMap('all');
  assert.equal(m.activityCount, '6');
  assert.equal(m.distance, '37 km');
  assert.equal(m.rideCount, '2 回');
  assert.equal(m.walkCount, '2 回');
  assert.equal(m.golfCount, '2 回');
  assert.equal(m.averageSpeed, undefined);
  assert.equal(m.averagePace, undefined);
  assert.equal(m.elevationGain, '180 m');
});

test('empty datasets do not divide by zero; row values depend on sport', () => {
  const ride = metricMap('Ride', 'exact', []);
  const walk = metricMap('Walk', 'exact', []);
  const golf = metricMap('Golf', 'exact', []);
  assert.equal(ride.averageSpeed, '—');
  assert.equal(walk.averagePace, '—');
  assert.equal(golf.averageDistance, '—');
  assert.match(sport.activityMotionValue(samples[0]), /km\/h$/);
  assert.match(sport.activityMotionValue(samples[2]), /\/km$/);
  assert.equal(sport.activityMotionValue(samples[4]), '—');
});

test('dashboard, summary and log share the sport metric presentation', () => {
  const stats = fs.readFileSync('src/components/StatsCards.tsx', 'utf8');
  const summary = fs.readFileSync('src/components/SummaryPage.tsx', 'utf8');
  const log = fs.readFileSync('src/components/ActivityLog.tsx', 'utf8');
  const dashboard = fs.readFileSync('src/themes/dashboard/index.tsx', 'utf8');
  assert.match(stats, /sportMetrics\(yearActivities, filter, locale, datePrecision\)/);
  assert.match(summary, /sportMetrics\(activities, filter, isJapanese \? 'ja' : 'en'/);
  assert.match(summary, /filter === 'Golf'/);
  assert.match(dashboard, /<SummaryPage[\s\S]*?filter=\{filter\}/);
  assert.match(log, /activityMotionValue\(a\)/);
  assert.match(log, /filter !== 'Golf'/);
  assert.doesNotMatch(summary, /最速ペース|Fastest pace/);
  assert.doesNotMatch(summary, /formatPace/);
});
