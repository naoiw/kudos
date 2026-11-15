'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

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
  const compiled = ts.transpileModule(source, {
    fileName: 'src/utils/summary.ts',
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const moduleExports = {};
  new Function('require', 'exports', compiled)(
    name => {
      if (name === '../hooks/useActivities') {
        return { parseMovingTime: () => 120 };
      }
      throw new Error('Unexpected import: ' + name);
    },
    moduleExports
  );
  const summary = moduleExports.summarize([
    { distance: 1000, moving_time: '00:02:00', average_heartrate: 140 },
  ]);
  assert.equal(summary.count, 1);
  assert.equal(summary.distance, 1000);
  assert.equal(Object.hasOwn(summary, 'heartRate'), false);
});
