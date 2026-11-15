'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const summary = fs.readFileSync('src/components/SummaryPage.tsx', 'utf8');

test('summary period selector contains only Life, year and month in that order', () => {
  const definition = summary.match(
    /const periods: \[SummaryPeriod, string\]\[\] = \[([\s\S]*?)\];/
  );
  assert.ok(definition, 'Summary period selector definition must exist');
  const values = [...definition[1].matchAll(/\['(life|year|month|week|day)'/g)]
    .map(match => match[1]);
  assert.deepEqual(values, ['life', 'year', 'month']);
  assert.doesNotMatch(definition[0], /monthOnly|\['week'|\['day'/);
});

test('summary starts in Life mode and retains the year/month aggregation', () => {
  assert.match(summary, /const \[period, setPeriod\] = useState<SummaryPeriod>\('life'\)/);
  assert.match(summary, /groupSummary\(activities, period\)/);
  assert.match(summary, /summaryChart\(activities, period, label\)/);
  assert.match(summary, /setPeriod\(value\)/);
  assert.match(summary, /setLimit\(12\)/);
  assert.match(summary, /const chartAvailable = !monthOnly \|\| period !== 'month'/);
});

test('month-only disclosure does not expose day/week period selection', () => {
  assert.match(summary, /'活動日時は年月のみ公開されています。'/);
  assert.doesNotMatch(summary, /'日' : 'Day'|'週' : 'Week'/);
});
