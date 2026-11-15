'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');

function loadTs(file, dependencies) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    fileName: file,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    },
  }).outputText;
  const exported = {};
  new Function('require', 'exports', code)((name) => {
    if (name === 'react/jsx-runtime') return require('react/jsx-runtime');
    if (Object.hasOwn(dependencies, name)) return dependencies[name];
    throw new Error('Unexpected import ' + name);
  }, exported);
  return exported;
}
const range = loadTs('src/core/calendarMonthBounds.ts', {});
const activityDays = loadTs('src/core/activityDays.ts', {});
const activity = (id, local) => ({
  run_id: id, start_date_local: local, type: 'Ride',
  name: 'Cycling', distance: 2000, moving_time: '00:10:00',
});
const history = [
  activity(1, '2020-03-01T09:00:00'),
  activity(2, '2025-02-01T09:00:00'),
  activity(3, '2026-01-15T09:00:00'),
  activity(4, '2026-10-20T09:00:00'),
];
function findElements(node, predicate, result = []) {
  if (Array.isArray(node)) {
    for (const child of node) findElements(child, predicate, result);
  } else if (React.isValidElement(node)) {
    if (predicate(node)) result.push(node);
    findElements(node.props.children, predicate, result);
  }
  return result;
}
function calendarInstance() {
  const state = [];
  let nextHook = 0;
  const react = {
    useMemo: compute => compute(),
    useEffect: () => {},
    useState: initial => {
      const hook = nextHook++;
      if (!(hook in state)) state[hook] =
        typeof initial === 'function' ? initial() : initial;
      return [state[hook], value => {
        state[hook] = typeof value === 'function' ? value(state[hook]) : value;
      }];
    },
  };
  const { CalendarWidget } = loadTs('src/components/CalendarWidget.tsx', {
    react,
    '../hooks/useActivities': { formatDistance: value => String(value / 1000) },
    '../hooks/useLocale': { useLocale: () => ({ locale: 'ja' }) },
    '../core/calendarMonthBounds': range,
    '../core/activityDays': activityDays,
  });
  return props => {
    nextHook = 0;
    const tree = CalendarWidget(props);
    const arrow = label => findElements(tree, node => node.type === 'button' &&
      node.props['aria-label'] === label)[0];
    const heading = findElements(tree, node => node.type === 'h2')[0];
    return { previous: arrow('前月'), next: arrow('翌月'), heading: heading.props.children };
  };
}

test('January 2026 back arrow navigates to December 2025 and reports the year', () => {
  const report = [];
  const render = calendarInstance();
  const page = render({
    activities: history.filter(a => a.start_date_local.startsWith('2026')),
    allActivities: history, yearFilter: 2026,
    selectedActivity: history[2],
    onNavigateMonth: date => report.push(date),
    onSelectActivity: () => {},
  });
  assert.equal(page.previous.props.disabled, false);
  assert.equal(page.heading, '2026年1月');
  page.previous.props.onClick();
  assert.equal(report.length, 1);
  assert.equal(report[0].getFullYear(), 2025);
  assert.equal(report[0].getMonth(), 11);
});

test('year-filter remount displays the exact requested month, not latest recorded month', () => {
  const render = calendarInstance(); // mimics a new keyed calendar for 2025
  const December2025 = new Date(2025, 11, 1);
  const data2025 = history.filter(a => a.start_date_local.startsWith('2025'));
  const report = [];
  const page = render({
    activities: data2025,
    allActivities: history,
    yearFilter: 2025,
    navigationMonth: December2025,
    selectedActivity: null,
    onNavigateMonth: date => report.push(date),
    onSelectActivity: () => {},
  });
  assert.equal(page.heading, '2025年12月');
  assert.equal(page.previous.props.disabled, false);
  assert.equal(page.next.props.disabled, false);
  page.next.props.onClick();
  assert.equal(report[0].getFullYear(), 2026);
  assert.equal(report[0].getMonth(), 0);
});

test('bounds hold at oldest user month and current month even across years', () => {
  const now = new Date(2026, 10, 15);
  const bounds = range.calendarMonthBounds(history, now);
  assert.equal(range.isMonthWithinBounds(new Date(2020, 1, 1), bounds), false);
  assert.equal(range.isMonthWithinBounds(new Date(2020, 2, 1), bounds), true);
  assert.equal(range.isMonthWithinBounds(new Date(2025, 11, 1), bounds), true);
  assert.equal(range.isMonthWithinBounds(new Date(2026, 10, 1), bounds), true);
  assert.equal(range.isMonthWithinBounds(new Date(2026, 11, 1), bounds), false);
});

test('dashboard updates global year filter on cross-year arrow without resetting the target month', () => {
  const dashboard = fs.readFileSync('src/themes/dashboard/index.tsx', 'utf8');
  assert.match(dashboard, /navigationMonth=\{calendarNavigationMonth\}/);
  assert.match(dashboard, /onNavigateMonth=\{\(nextMonth\) => \{/);
  assert.match(dashboard, /setCalendarNavigationMonth\(nextMonth\)/);
  assert.match(dashboard,
    /year !== null && nextMonth\.getFullYear\(\) !== year[\s\S]*?setYear\(nextMonth\.getFullYear\(\)\)/);
  assert.match(dashboard, /setCalendarNavigationMonth\(null\)/);
  assert.match(dashboard, /yearFilter=\{year\}/);
});
