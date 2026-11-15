'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const filename = 'src/core/heatmapWeek.ts';
const source = fs.readFileSync(filename, 'utf8');
const output = ts.transpileModule(source, {
  fileName: filename,
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const moduleExports = {};
vm.runInNewContext(output, { exports: moduleExports }, { filename });
const { mondayFirstWeekdayIndex } = moduleExports;

test('heatmap rows start on Monday and end on Sunday', () => {
  assert.deepEqual(
    Array.from({ length: 7 }, (_, day) => mondayFirstWeekdayIndex(day)),
    [6, 0, 1, 2, 3, 4, 5]
  );
  const grid = fs.readFileSync('src/core/heatmapGrid.ts', 'utf8');
  const heatmap = fs.readFileSync('src/components/ContributionHeatmap.tsx', 'utf8');
  assert.match(grid, /startDay = mondayFirstWeekdayIndex\(startDate\.getDay\(\)\)/);
  assert.match(heatmap, /weekdayIds = \['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'\]/);
  assert.match(heatmap, /\['月', '', '水', '', '金', '', ''\]/);
  assert.match(heatmap, /\['M', '', 'W', '', 'F', '', ''\]/);
});

test('January 1 aligns in its correct weekday row across year boundaries', () => {
  // A Sunday start needs six blank cells; a Monday start needs none.
  for (const [year, expectedOffset] of [
    [2017, 6], [2018, 0], [2023, 6], [2024, 0], [2026, 3], [2028, 5],
  ]) {
    const offset = mondayFirstWeekdayIndex(new Date(year, 0, 1).getDay());
    assert.equal(offset, expectedOffset, 'Year ' + year);
    const firstWeekDates = Math.min(7 - offset, 365);
    assert.equal((7 - firstWeekDates), offset, 'First week padding for ' + year);
  }
  const grid = fs.readFileSync('src/core/heatmapGrid.ts', 'utf8');
  const heatmap = fs.readFileSync('src/components/ContributionHeatmap.tsx', 'utf8');
  assert.match(grid, /Math\.floor\(\(d \+ startDay\) \/ 7\)/);
  assert.match(heatmap, /Array\.from\(\{ length: 7 - week\.length \}/);
});
