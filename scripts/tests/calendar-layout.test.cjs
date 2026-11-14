'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

test('calendar keeps a fixed-height detail panel across months and selections', () => {
  const source = fs.readFileSync('src/components/CalendarWidget.tsx', 'utf8');

  // The same footer exists for empty months, populated months, and selected days.
  assert.match(source, /className="mt-3 h-24 overflow-y-auto"/);
  assert.match(source, /day !== null && dayActivities\.length > 0 \?/);
  assert.match(source, /!monthActivities\.length\s*\?/);
  assert.match(source, /'この月のアクティビティはありません'/);
  assert.doesNotMatch(source, /\{!monthActivities\.length && \(/);
  // Six rows are rendered regardless of the first weekday / number of days.
  assert.match(source, /Array\.from\(\{ length: 42 \}/);
});
