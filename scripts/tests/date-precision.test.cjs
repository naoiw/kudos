'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function loadTypeScript(path) {
  const source = fs.readFileSync(path, 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: path,
  }).outputText;
  const exports = {};
  vm.runInNewContext(js, { exports }, { filename: path });
  return exports;
}

const dates = loadTypeScript('src/core/datePrecision.ts');

test('month-only publication strips fabricated legacy days and clock time', () => {
  assert.equal(dates.normalizePublicDate('2026-11-15T12:00:00', 'month'), '2026-11');
  assert.equal(dates.normalizePublicDate('2026-11', 'month'), '2026-11');
  assert.equal(dates.normalizePublicDate('2027-01-01T00:00:00', 'month'), '2027-01');
  assert.throws(() => dates.normalizePublicDate('2026-13-21T12:00:00', 'month'));
  assert.throws(() => dates.normalizePublicDate('unknown', 'month'));
  assert.equal(dates.resolveDatePrecision(undefined), 'month');
  assert.equal(dates.resolveDatePrecision('exact'), 'exact');
});

test('exact publication preserves the source local timestamp and year boundary', () => {
  assert.equal(dates.normalizePublicDate('2027-01-01T01:30:00', 'exact'),
    '2027-01-01T01:30:00');
  assert.equal(dates.activityYear('2027-01'), 2027);
  assert.equal(dates.activityYear('2027-01-01T01:30:00'), 2027);
});

test('month-only dates format without a fabricated day in Japanese and English', () => {
  assert.equal(dates.formatActivityDate('2026-11', 'ja', true), '2026年11月');
  assert.equal(dates.formatActivityDate('2026-11', 'en', true), '2026-11');
  assert.equal(dates.formatActivityDate('2026-11-14T16:05:00', 'ja', true),
    '2026年11月14日 16:05');
});


test('monthly summary groups by true year and month without inventing days', () => {
  const source = fs.readFileSync('src/utils/summary.ts', 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(js, {
    exports,
    require(module) {
      if (module === '../hooks/useActivities') {
        return { parseMovingTime: time => {
          const parts = time.split(':').map(Number);
          return parts[0] * 3600 + parts[1] * 60 + parts[2];
        } };
      }
      throw new Error('Unexpected dependency: ' + module);
    },
  });
  const activity = (date, distance) => ({
    start_date_local: date, distance, moving_time: '01:00:00',
    elevation_gain: 0, average_heartrate: null,
  });
  const activities = [
    activity('2026-11', 1000), activity('2026-11', 2000),
    activity('2026-12', 3000), activity('2027-01', 4000),
  ];
  assert.equal(exports.summaryKey('2026-11', 'month'), '2026-11');
  assert.equal(exports.summaryKey('2026-11', 'year'), '2026');
  assert.equal(exports.summaryKey('2026-11', 'life'), 'Life');
  assert.match(source, /export type SummaryPeriod = 'life' \| 'year' \| 'month'/);
  const grouped = exports.groupSummary(activities, 'month');
  assert.deepEqual(Array.from(grouped, ([key, rows]) => [key, rows.length]),
    [['2027-01', 1], ['2026-12', 1], ['2026-11', 2]]);
  const chart = exports.summaryChart(activities.slice(0, 3), 'year', '2026');
  assert.equal(chart.find(row => row.label === '11').km, 3);
  assert.equal(chart.find(row => row.label === '12').km, 3);
  const life = exports.summaryChart(activities, 'life', 'Life');
  assert.equal(life.find(row => row.label === '2026').km, 6);
  assert.equal(life.find(row => row.label === '2027').km, 4);
});
