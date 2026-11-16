'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');

function loadTs(file, dependencies = {}) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    fileName: file,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
  const exports = {};
  new Function('require', 'exports', code)((name) => {
    if (name === 'react/jsx-runtime') return require('react/jsx-runtime');
    if (Object.hasOwn(dependencies, name)) return dependencies[name];
    throw new Error('Unexpected dependency in ' + file + ': ' + name);
  }, exports);
  return exports;
}

const parseMovingTime = value =>
  value.split(':').reduce((seconds, part) => seconds * 60 + Number(part), 0);
const activityDays = loadTs('src/core/activityDays.ts');
const grid = loadTs('src/core/heatmapGrid.ts', {
  './heatmapWeek': { mondayFirstWeekdayIndex: day => (day + 6) % 7 },
  './hooks/useActivities': { parseMovingTime },
  './activityDays': activityDays,
});
const referenceDay = new Date(2026, 10, 16, 12, 0, 0);
const fakeGrid = {
  ...grid,
  isFutureHeatmapDay: day => grid.isFutureHeatmapDay(day, referenceDay),
};
const mockReact = {
  memo: component => component,
  useMemo: calculate => calculate(),
  useRef: () => ({ current: null }),
  useState: initial => [
    typeof initial === 'function' ? initial() : initial,
    () => {},
  ],
};
const { ContributionHeatmap } = loadTs('src/components/ContributionHeatmap.tsx', {
  react: mockReact,
  '../utils/exportCard': { exportCard: async () => '' },
  '../core/sports': { SPORT_ORDER: ['Ride', 'Walk', 'Golf'] },
  '../core/heatmapGrid': fakeGrid,
  '../hooks/useActivities': {
    getAvailableYears: () => [2026, 2025],
    formatDistance: meters => (meters / 1000).toFixed(1),
    formatPace: () => '0:00',
  },
  '../hooks/useLocale': { useLocale: () => ({ locale: 'ja', t: key => key }) },
});
const act = (date, id) => ({
  run_id: id, name: 'Ride ' + id, type: 'Ride',
  start_date_local: date, distance: 2500, moving_time: '00:15:00',
});
const acts = [
  act('2025-12-31T10:00:00', 1),
  act('2026-11-15T10:00:00', 2),
  act('2026-11-16T10:00:00', 3),
  // Even if upstream contains a future-dated record, it cannot be selected.
  act('2026-11-17T10:00:00', 4),
];
function elements(node, testElement, result = []) {
  if (Array.isArray(node)) node.forEach(child => elements(child, testElement, result));
  else if (React.isValidElement(node)) {
    if (testElement(node)) result.push(node);
    elements(node.props.children, testElement, result);
  }
  return result;
}
function render(year, onSelectActivity) {
  return ContributionHeatmap({
    activities: acts, year, filter: 'all', onSelectActivity,
  });
}
function dayButton(ui, date) {
  const matches = elements(ui, node => node.type === 'button' &&
    typeof node.props.title === 'string' && node.props.title.startsWith(date));
  assert.equal(matches.length, 1, 'Expected one cell for ' + date);
  return matches[0];
}

test('future classification respects local calendar days including year and leap boundaries', () => {
  const future = grid.isFutureHeatmapDay;
  assert.equal(future('2026-11-15', referenceDay), false);
  assert.equal(future('2026-11-16', referenceDay), false);
  assert.equal(future('2026-11-17', referenceDay), true);
  assert.equal(future('2025-12-31', referenceDay), false);
  assert.equal(future('2027-01-01', referenceDay), true);
  assert.equal(future('2024-02-29', new Date(2024, 1, 28, 23, 59)), true);
  assert.equal(future('2024-02-29', new Date(2024, 1, 29, 0, 1)), false);
  assert.equal(future('2027-01-01', new Date(2026, 11, 31, 23, 59)), true);
  assert.equal(future('2027-01-01', new Date(2027, 0, 1, 0, 0)), false);
});

test('current-year heatmap future cells are dim and disabled, today remains selectable', () => {
  const chosen = [];
  const ui = render(2026, selected => chosen.push(selected.run_id));
  const yesterday = dayButton(ui, '2026-11-15');
  const today = dayButton(ui, '2026-11-16');
  const tomorrow = dayButton(ui, '2026-11-17');
  const futureEmpty = dayButton(ui, '2026-12-31');
  const emptyPast = dayButton(ui, '2026-01-01');

  assert.equal(yesterday.props.disabled, false);
  assert.equal(today.props.disabled, false);
  assert.equal(today.props.style.opacity, 1);
  assert.equal(tomorrow.props.disabled, true);
  assert.equal(tomorrow.props.style.opacity, 0.25);
  assert.equal(tomorrow.props.style.backgroundColor, 'var(--color-border)');
  assert.match(tomorrow.props.title, /未来の日付/);
  assert.equal(futureEmpty.props.disabled, true);
  assert.equal(futureEmpty.props.style.opacity, 0.25);
  assert.equal(emptyPast.props.style.opacity, 1, 'past dates without records are not future');
  // Extra guard also rejects event invocation when a disabled button callback is called directly.
  tomorrow.props.onClick();
  today.props.onClick();
  assert.deepEqual(chosen, [3]);
});

test('all-years mode dims only future cells; historical records stay normal', () => {
  const ui = render(null, () => {});
  const historical = dayButton(ui, '2025-12-31');
  const current = dayButton(ui, '2026-11-16');
  const future = dayButton(ui, '2026-11-17');
  assert.equal(historical.props.disabled, false);
  assert.equal(historical.props.style.opacity, 1);
  assert.equal(current.props.style.opacity, 1);
  assert.equal(future.props.disabled, true);
  assert.equal(future.props.style.opacity, 0.25);
  const days = elements(ui, node => node.type === 'button' &&
    typeof node.props.title === 'string' && /^\d{4}-\d{2}-\d{2}/.test(node.props.title));
  assert.equal(days.length, 365 + 365, 'full-year layout is preserved for both years');
});

test('the heatmap still uses local-year data and unchanged selection routing', () => {
  const dashboard = fs.readFileSync('src/themes/dashboard/index.tsx', 'utf8');
  const heatmap = fs.readFileSync('src/components/ContributionHeatmap.tsx', 'utf8');
  assert.match(dashboard, /<ContributionHeatmap[\s\S]*?onSelectActivity=\{selectActivity\}/);
  assert.match(heatmap, /isFutureHeatmapDay\(day\.date, today\)/);
  assert.match(heatmap, /disabled=\{isFuture \|\| !day\.activities\.length\}/);
});
