'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

function source(file) {
  return fs.readFileSync(file, 'utf8');
}

test('one dashboard year selector controls activity data and widgets', () => {
  const dashboard = source('src/themes/dashboard/index.tsx');
  assert.match(dashboard, /aria-label=\{locale === 'ja' \? '表示する年' : 'Activity year'\}/);
  assert.match(dashboard, /\[null, \.\.\.years\]\.map\(\(value\) => \(/);
  assert.match(dashboard, /onClick=\{\(\) => \{\s*setYear\(value\);\s*setSelectedActivity\(null\);\s*setSelectedPrefecture\(null\);/);
  assert.match(dashboard, /const yearFiltered = useFilteredActivities\(activities, 'all', year\)/);
  assert.match(dashboard, /const baseFiltered = useFilteredActivities\(activities, filter, year\)/);
  assert.match(dashboard, /<ProfileCard activities=\{yearFiltered\} filter=\{filter\}/);
  assert.match(dashboard, /<JapanMap\s+activities=\{baseFiltered\}/);
  assert.match(dashboard, /<SummaryPage[\s\S]*?activities=\{baseFiltered\}/);
  assert.match(dashboard, /<TracksPage[\s\S]*?year=\{year\}[\s\S]*?activities=\{baseFiltered\}/);
  assert.match(dashboard, /<ContributionHeatmap[\s\S]*?activities=\{baseFiltered\}[\s\S]*?year=\{year\}/);
  assert.match(dashboard, /<ActivityLog[\s\S]*?activities=\{filtered\}/);
  assert.match(dashboard, /<CalendarWidget[\s\S]*?activities=\{filtered\}/);
  assert.match(dashboard, /<RouteMap[\s\S]*?allActivities=\{baseFiltered\}/);
});

test('individual widgets no longer own year or sport selection', () => {
  const activityLog = source('src/components/ActivityLog.tsx');
  assert.doesNotMatch(activityLog, /setYear:|Year tabs|aria-label=.*アクティビティの年/);
  const heatmap = source('src/components/ContributionHeatmap.tsx');
  assert.match(heatmap, /const selectedYear = year \?\? 'all'/);
  assert.doesNotMatch(heatmap, /setSelectedYear|handleSelectYear|yearWindowEnd/);
  const summary = source('src/components/SummaryPage.tsx');
  assert.doesNotMatch(summary, /setYear\(|setSport\(|集計対象の年/);
  assert.match(summary, /groupSummary\(activities, period\)/);
  const tracks = source('src/components/TracksPage.tsx');
  assert.doesNotMatch(tracks, /setSelectedYear|setSportFilter|Year pills/);
  assert.match(tracks, /const base = activities/);
});

test('monthly and yearly target cards use the shared selected year', () => {
  const cards = source('src/components/StatsCards.tsx');
  assert.match(cards, /const currentYear = year \?\? today\.getFullYear\(\)/);
  assert.match(cards, /new Date\(year, today\.getMonth\(\), today\.getDate\(\)/);
  assert.match(cards, /a\.start_date_local\.slice\(0, 7\) !==/);
  assert.match(cards, /\$\{now\.getFullYear\(\)\}-\$\{String\(now\.getMonth\(\) \+ 1\)/);
});
