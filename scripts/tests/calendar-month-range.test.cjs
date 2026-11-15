'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');

function loadTs(filename, dependencies) {
  const script = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
  const moduleExports = {};
  new Function('require', 'exports', script)((name) => {
    if (name === 'react/jsx-runtime') return require('react/jsx-runtime');
    if (Object.hasOwn(dependencies, name)) return dependencies[name];
    throw new Error('Unexpected import: ' + name);
  }, moduleExports);
  return moduleExports;
}

const limits = loadTs('src/core/calendarMonthBounds.ts', {});
const local = (year, month) => new Date(year, month - 1, 1);
const label = date => String(date.getFullYear()) + '-' +
  String(date.getMonth() + 1).padStart(2, '0');
const item = (run_id, date) => ({
  run_id, start_date_local: date, name: 'Ride ' + run_id, type: 'Ride',
  distance: 3000, moving_time: '00:10:00',
});

test('oldest activity month through current month is the only navigable range', () => {
  const all = [
    item(1, '2026-09-14T07:00:00'),
    item(2, '2024-05-29T12:00:00'),
    item(3, '2025-02-11T14:00:00'),
  ];
  const bounds = limits.calendarMonthBounds(all, local(2026, 11));
  assert.equal(label(bounds.first), '2024-05');
  assert.equal(label(bounds.last), '2026-11');
  assert.equal(limits.isMonthWithinBounds(local(2024, 4), bounds), false);
  assert.equal(limits.isMonthWithinBounds(local(2024, 5), bounds), true);
  assert.equal(limits.isMonthWithinBounds(local(2026, 11), bounds), true);
  assert.equal(limits.isMonthWithinBounds(local(2026, 12), bounds), false);
  assert.equal(label(limits.clampCalendarMonth(local(2020, 1), bounds)), '2024-05');
  assert.equal(label(limits.clampCalendarMonth(local(2027, 6), bounds)), '2026-11');
});

test('the complete user history, not visible sport or region, sets oldest month', () => {
  const all = [
    item(1, '2022-03-17T12:00:00'),
    item(2, '2026-09-03T09:00:00'),
  ];
  const bounds = limits.calendarMonthBounds(all, local(2026, 11));
  assert.equal(label(bounds.first), '2022-03');
  const dashboard = fs.readFileSync('src/themes/dashboard/index.tsx', 'utf8');
  assert.match(dashboard, /<CalendarWidget[\s\S]*?activities=\{filtered\}\s*allActivities=\{activities\}/);
  assert.match(dashboard, /<CalendarWidget[\s\S]*?currentUser\.user_id/);
});

test('global year filter does not constrain browsing between activity years', () => {
  const all = [
    item(1, '2023-10-21T12:00:00'),
    item(2, '2025-02-08T09:00:00'),
    item(3, '2026-10-14T17:00:00'),
  ];
  const now = local(2026, 11);
  const firstYear = limits.calendarMonthBounds(all, now);
  assert.equal(label(firstYear.first), '2023-10');
  assert.equal(label(firstYear.last), '2026-11');
  const middleYear = limits.calendarMonthBounds(all, now);
  assert.equal(label(middleYear.first), '2023-10');
  assert.equal(label(middleYear.last), '2026-11');
  const currentYear = limits.calendarMonthBounds(all, now);
  assert.equal(label(currentYear.first), '2023-10');
  assert.equal(label(currentYear.last), '2026-11');
  assert.equal(limits.isMonthWithinBounds(local(2026, 12), currentYear), false);
});

test('empty history and future-only history do not expose future months', () => {
  const now = local(2026, 11);
  const empty = limits.calendarMonthBounds([], now);
  assert.equal(label(empty.first), '2026-11');
  assert.equal(label(empty.last), '2026-11');
  const future = limits.calendarMonthBounds([item(1, '2027-01-02T00:00:00')], now);
  assert.equal(label(future.first), '2026-11');
  assert.equal(label(future.last), '2026-11');
  assert.equal(limits.activityMonth('not-a-date'), null);
  assert.equal(limits.activityMonth('2026-13-01'), null);
  assert.equal(label(limits.activityMonth('2026-02-01T00:00:00')), '2026-02');
});

function findElements(node, predicate, result = []) {
  if (Array.isArray(node)) {
    for (const child of node) findElements(child, predicate, result);
  } else if (React.isValidElement(node)) {
    if (predicate(node)) result.push(node);
    findElements(node.props.children, predicate, result);
  }
  return result;
}

test('calendar disables month arrows at both history boundaries', () => {
  const now = new Date();
  const oldest = new Date(now.getFullYear(), now.getMonth() - 2, 15);
  const earliest = String(oldest.getFullYear()) + '-' +
    String(oldest.getMonth() + 1).padStart(2, '0') + '-15T10:00:00';
  const latest = String(now.getFullYear()) + '-' +
    String(now.getMonth() + 1).padStart(2, '0') + '-15T10:00:00';
  const olderItem = item(1, earliest);
  const latestItem = item(2, latest);
  const state = [];
  let currentHook = 0;
  const mockReact = {
    useMemo: compute => compute(),
    useEffect: () => {},
    useState: initial => {
      const i = currentHook++;
      if (!(i in state)) {
        state[i] = typeof initial === 'function' ? initial() : initial;
      }
      return [state[i], next => {
        state[i] = typeof next === 'function' ? next(state[i]) : next;
      }];
    },
  };
  const calendar = loadTs('src/components/CalendarWidget.tsx', {
    react: mockReact,
    '../hooks/useActivities': { formatDistance: meters => (meters / 1000).toFixed(1) },
    '../hooks/useLocale': { useLocale: () => ({ locale: 'ja' }) },
    '../core/calendarMonthBounds': limits,
  });
  const props = {
    activities: [olderItem, latestItem],
    allActivities: [olderItem, latestItem],
    yearFilter: null,
    selectedActivity: olderItem,
    onSelectActivity: () => {},
    onNavigateMonth: () => {},
  };
  function render() {
    currentHook = 0;
    const element = calendar.CalendarWidget(props);
    const back = findElements(element, el => el.type === 'button' &&
      el.props['aria-label'] === '前月')[0];
    const forward = findElements(element, el => el.type === 'button' &&
      el.props['aria-label'] === '翌月')[0];
    return { back, forward };
  }
  let { back, forward } = render();
  assert.equal(back.props.disabled, true, 'cannot go before oldest activity month');
  assert.equal(forward.props.disabled, false);
  forward.props.onClick();
  ({ back, forward } = render());
  assert.equal(back.props.disabled, false);
  assert.equal(forward.props.disabled, false);
  forward.props.onClick();
  ({ back, forward } = render());
  assert.equal(forward.props.disabled, true, 'cannot go to next month');
  forward.props.onClick(); // Guard prevents bypassing the disabled button via code.
  ({ back, forward } = render());
  assert.equal(forward.props.disabled, true);
});
