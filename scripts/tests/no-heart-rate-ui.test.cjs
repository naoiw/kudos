'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(file) {
  return fs.readFileSync(file, 'utf8');
}
function collectUi(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return collectUi(file);
    return /\.(tsx|css)$/.test(entry.name) ? [file] : [];
  });
}

test('no heart-rate UI fields, labels or units remain', () => {
  const sources = [
    ...collectUi('src/components'),
    ...collectUi('src/themes'),
    'src/core/i18n.ts',
  ];
  for (const file of sources) {
    assert.doesNotMatch(read(file),
      /heart.?rate|heartrate|心拍|脈拍|\bbpm\b|t\(['"]hr['"]\)/i,
      'Unexpected heart rate display in ' + file);
  }
});

test('activity log columns and empty table colspan exclude heart rate', () => {
  const log = read('src/components/ActivityLog.tsx');
  assert.doesNotMatch(log, /average_heartrate|t\(['"]hr['"]\)/);
  assert.match(log, /colSpan=\{filter === 'Golf' \? 5 : 6\}/);
  assert.match(log, /filter !== 'Golf' && \(\s*<th /);
  assert.match(log, /filter !== 'Golf' && \(\s*<td /);
});

test('selected track details have no heart rate block', () => {
  const tracks = read('src/components/TracksPage.tsx');
  assert.doesNotMatch(tracks, /average_heartrate|bpm|心拍数/);
});

test('summary no longer calculates heart rate while retaining historic data schema', () => {
  const source = read('src/utils/summary.ts');
  assert.doesNotMatch(source, /heartRates|heartRate|average_heartrate/);
  // The imported Activity contract is preserved so old public JSON remains accepted.
  assert.match(read('src/core/types.ts'), /average_heartrate: number \| null;/);
  assert.doesNotMatch(source, /export function summarize\(/);
  assert.match(source, /export function summaryChart\(/);
});
