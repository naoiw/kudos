'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');

function transpile(file, dependencies) {
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
    throw new Error('Unexpected dependency: ' + name);
  }, exports);
  return exports;
}

const parseMovingTime = value =>
  value.split(':').reduce((seconds, part) => seconds * 60 + Number(part), 0);

const activityDays = transpile('src/core/activityDays.ts', {});
const grid = transpile('src/core/heatmapGrid.ts', {
  './heatmapWeek': { mondayFirstWeekdayIndex: day => (day + 6) % 7 },
  './hooks/useActivities': { parseMovingTime },
  './activityDays': activityDays,
});
function activity(id, startDate) {
  return {
    run_id: id,
    name: 'Ride ' + id,
    type: 'Ride',
    start_date_local: startDate,
    moving_time: '00:30:00',
    distance: 1000,
  };
}

function findElements(node, predicate, found = []) {
  if (Array.isArray(node)) {
    for (const child of node) findElements(child, predicate, found);
  } else if (React.isValidElement(node)) {
    if (predicate(node)) found.push(node);
    findElements(node.props.children, predicate, found);
  }
  return found;
}

test('a day containing multiple sessions is ordered earliest first like the calendar', () => {
  const late = activity(2, '2026-05-18T18:30:00');
  const early = activity(1, '2026-05-18T06:30:00');
  const other = activity(3, '2026-05-19T12:30:00');
  const input = [late, other, early];
  const result = grid.buildYearGrid(2026, input, false, true);
  const day = result.grid.flat().find(entry => entry.date === '2026-05-18');
  assert.deepEqual(day.activities.map(item => item.run_id), [1, 2]);
  assert.equal(day.distance, 2000);
  assert.deepEqual(input.map(item => item.run_id), [2, 3, 1], 'original data is untouched');
});

test('clicking a multi-session heatmap day selects its first route and keeps others selectable', () => {
  const late = activity(2, '2026-05-18T18:30:00');
  const early = activity(1, '2026-05-18T06:30:00');
  const separate = activity(3, '2026-05-19T12:30:00');
  const chosen = [];

  // Minimal synchronous React state, enough to exercise JSX callbacks without a DOM.
  const state = [];
  let hookIndex = 0;
  const mockReact = {
    memo: component => component,
    useMemo: calculate => calculate(),
    useRef: () => ({ current: null }),
    useState: initial => {
      const index = hookIndex++;
      if (!(index in state)) state[index] =
        typeof initial === 'function' ? initial() : initial;
      return [state[index], next => {
        state[index] = typeof next === 'function' ? next(state[index]) : next;
      }];
    },
  };
  const { ContributionHeatmap } = transpile('src/components/ContributionHeatmap.tsx', {
    react: mockReact,
    '../utils/exportCard': { exportCard: async () => '' },
    '../core/sports': { SPORT_ORDER: ['Ride', 'Walk', 'Golf'] },
    '../core/heatmapGrid': grid,
    '../hooks/useActivities': {
      getAvailableYears: () => [2026],
      formatDistance: meters => (meters / 1000).toFixed(1),
      formatPace: () => '0:00',
    },
    '../hooks/useLocale': {
      useLocale: () => ({ locale: 'ja', t: key => key }),
    },
  });
  const render = () => {
    hookIndex = 0;
    return ContributionHeatmap({
      activities: [late, separate, early],
      year: 2026,
      filter: 'all',
      onSelectActivity: selected => chosen.push(selected.run_id),
    });
  };

  const ui = render();
  const days = findElements(ui, node => node.type === 'button' &&
    typeof node.props.title === 'string' &&
    node.props.title.startsWith('2026-05-18:'));
  assert.equal(days.length, 1);
  assert.equal(days[0].props.disabled, false);
  days[0].props.onClick();
  assert.deepEqual(chosen, [1], 'map callback receives the earliest route, not none');

  const expanded = render();
  const detailButtons = findElements(expanded, node => node.type === 'button' &&
    typeof node.props.className === 'string' &&
    node.props.className.includes('rounded-md border border-'));
  assert.equal(detailButtons.length, 2);
  detailButtons[1].props.onClick();
  assert.deepEqual(chosen, [1, 2], 'the second session is still independently selectable');

  const singleDay = findElements(expanded, node => node.type === 'button' &&
    typeof node.props.title === 'string' &&
    node.props.title.startsWith('2026-05-19:'));
  assert.equal(singleDay.length, 1);
  singleDay[0].props.onClick();
  assert.deepEqual(chosen, [1, 2, 3], 'a single-session day still selects its route');
});

test('the heatmap reuses the same map selection callback as the calendar', () => {
  const dashboard = fs.readFileSync('src/themes/dashboard/index.tsx', 'utf8');
  assert.match(dashboard, /<ContributionHeatmap[\s\S]*?onSelectActivity=\{selectActivity\}/);
  assert.match(dashboard, /<CalendarWidget[\s\S]*?onSelectActivity=\{selectActivity\}/);
  assert.match(dashboard, /routeSectionRef\.current\?\.scrollIntoView/);
});
