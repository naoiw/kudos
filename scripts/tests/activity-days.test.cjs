'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const filename = 'src/core/activityDays.ts';
const script = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  fileName: filename,
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const api = {};
vm.runInNewContext(script, { exports: api }, { filename });

const item = (id, date) => ({ run_id: id, start_date_local: date });
const toIds = groups => Object.fromEntries(
  [...groups].map(([key, entries]) => [key, entries.map(entry => entry.run_id)])
);

test('day groups preserve recorded local dates and chronologically order sessions', () => {
  const entries = [
    item(2, '2026-01-01T21:30:00'),
    item(3, '2025-12-31T23:59:00'),
    item(1, '2026-01-01T05:15:00'),
    item(4, '2026-01-01T12:00:00'),
  ];
  const groups = api.groupActivitiesByLocalDay(entries);
  assert.deepEqual(toIds(groups), {
    '2026-01-01': [1, 4, 2],
    '2025-12-31': [3],
  });
  assert.deepEqual(entries.map(a => a.run_id), [2, 3, 1, 4],
    'input order must never be mutated');
});

test('optional month scope selects the right activities across year boundaries', () => {
  const entries = [
    item(1, '2025-12-31T23:59:00'),
    item(2, '2026-01-01T00:01:00'),
    item(3, '2026-01-02T12:00:00'),
  ];
  assert.deepEqual(toIds(api.groupActivitiesByLocalDay(entries, '2025-12')), {
    '2025-12-31': [1],
  });
  assert.deepEqual(toIds(api.groupActivitiesByLocalDay(entries, '2026-01')), {
    '2026-01-01': [2],
    '2026-01-02': [3],
  });
});

test('month-only disclosures never invent days or appear in a day heatmap', () => {
  const entries = [
    item(1, '2026-01'),
    item(2, '2026-02'),
    item(3, '2026-01-15T12:00:00'),
  ];
  assert.deepEqual(toIds(api.groupActivitiesByLocalDay(entries, '2026-01')), {
    '2026-01-15': [3],
  });
  assert.equal(api.groupActivitiesByLocalDay(entries.slice(0, 2)).size, 0);
});

test('calendar and heatmap use the same shared day grouping without timezone parsing', () => {
  const calendar = fs.readFileSync('src/components/CalendarWidget.tsx', 'utf8');
  const heatmap = fs.readFileSync('src/core/heatmapGrid.ts', 'utf8');
  assert.match(calendar, /groupActivitiesByLocalDay\(activities, monthKey\)/);
  assert.match(heatmap, /groupActivitiesByLocalDay\(yearActivities\)/);
  assert.doesNotMatch(calendar, /new Date\(activity\.start_date_local\)/);
});
