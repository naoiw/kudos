'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('initial activity filters default to all sports and the latest available year', () => {
  const dashboard = fs.readFileSync('src/themes/dashboard/index.tsx', 'utf8');
  const activities = fs.readFileSync('src/core/hooks/useActivities.ts', 'utf8');

  assert.match(dashboard, /const \[filter, setFilter\] = useState<SportFilter>\('all'\)/);
  assert.match(dashboard,
    /const \[year, setYear\] = useState<number \| null>\(\s*\(\) => getAvailableYears\(activities\)\[0\] \?\? null\s*\)/);
  assert.match(activities, /return Array\.from\(years\)\.sort\(\(a, b\) => b - a\)/);
  assert.match(dashboard, /const years = useMemo\(\(\) => getAvailableYears\(activities\), \[activities\]\)/);
});

test('switching users selects their latest year and all sports', () => {
  const dashboard = fs.readFileSync('src/themes/dashboard/index.tsx', 'utf8');
  const chooseUser = dashboard.slice(
    dashboard.indexOf('  const chooseUser = '),
    dashboard.indexOf('  const navigate = ')
  );
  assert.match(chooseUser, /catalog\.activities\.filter\(\(activity\) =>\s*activity\.user_id === userId/);
  assert.match(chooseUser, /setFilter\('all'\)/);
  assert.match(chooseUser, /setYear\(getAvailableYears\(userActivities\)\[0\] \?\? null\)/);
  assert.match(chooseUser, /setSelectedCountry\(null\)/);
  assert.match(chooseUser, /setSelectedPrefecture\(null\)/);
  assert.match(chooseUser, /setSelectedActivity\(null\)/);
});

test('all-years remains available as a selectable override', () => {
  const dashboard = fs.readFileSync('src/themes/dashboard/index.tsx', 'utf8');
  assert.match(dashboard, /\[null, \.\.\.years\]\.map\(\(value\) => \(/);
  assert.match(dashboard, /setYear\(value\)/);
});
