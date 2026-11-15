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
  const dashboard = fs.readFileSync('src/themes/dashboard/index.tsx', 'utf8');
  assert.match(dashboard, /const \[summaryPeriod, setSummaryPeriod\] = useState<SummaryPeriod>\('life'\)/);
  assert.match(summary, /period: SummaryPeriod;/);
  assert.match(summary, /groupSummary\(activities, period\)/);
  assert.match(summary, /summaryChart\(activities, period, label\)/);
  assert.match(summary, /onPeriodChange\(value\)/);
  assert.match(summary, /setLimit\(12\)/);
  assert.match(summary, /const chartAvailable = !monthOnly \|\| period !== 'month'/);
});

test('month-only disclosure does not expose day/week period selection', () => {
  assert.match(summary, /'活動日時は年月のみ公開されています。'/);
  assert.doesNotMatch(summary, /'日' : 'Day'|'週' : 'Week'/);
});


test('Life selection chooses all years, including direct navigation to Summary', () => {
  const dashboard = fs.readFileSync('src/themes/dashboard/index.tsx', 'utf8');
  assert.match(dashboard,
    /pageFromPath\(\) === 'summary'\s*\?\s*null\s*:\s*getAvailableYears\(activities\)\[0\] \?\? null/);
  assert.match(dashboard,
    /const navigate = \(next: Page\) => \{\s*if \(next === 'summary'\) \{\s*[\s\S]*?setSummaryPeriod\('life'\);\s*setYear\(null\)/);
  assert.match(dashboard,
    /onPeriodChange=\{\(nextPeriod\) => \{\s*setSummaryPeriod\(nextPeriod\);\s*if \(nextPeriod === 'life'\) \{\s*setYear\(null\)/);
  assert.match(dashboard, /activities=\{baseFiltered\}/);
  assert.match(dashboard, /period=\{summaryPeriod\}/);
});

test('Life is not left selected when the global year filter is changed to a specific year', () => {
  const dashboard = fs.readFileSync('src/themes/dashboard/index.tsx', 'utf8');
  assert.match(dashboard,
    /page === 'summary' && summaryPeriod === 'life' && value !== null[\s\S]*?setSummaryPeriod\('year'\);\s*\}\s*setYear\(value\)/);
  assert.match(dashboard,
    /page === 'summary' && summaryPeriod === 'life'\s*\?\s*null\s*:\s*getAvailableYears\(userActivities\)\[0\] \?\? null/);
  assert.match(dashboard,
    /const onPopState = \(\) => \{[\s\S]*?if \(nextPage === 'summary'\) \{\s*setSummaryPeriod\('life'\);\s*setYear\(null\)/);
});
