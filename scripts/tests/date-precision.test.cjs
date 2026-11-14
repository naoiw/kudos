'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function loadTypeScript(path) {
  const source = fs.readFileSync(path, 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: path,
  }).outputText;
  const exports = {};
  vm.runInNewContext(js, { exports }, { filename: path });
  return exports;
}

const dates = loadTypeScript('src/core/datePrecision.ts');

test('month-only publication strips fabricated legacy days and clock time', () => {
  assert.equal(dates.normalizePublicDate('2026-11-15T12:00:00', 'month'), '2026-11');
  assert.equal(dates.normalizePublicDate('2026-11', 'month'), '2026-11');
  assert.equal(dates.normalizePublicDate('2027-01-01T00:00:00', 'month'), '2027-01');
  assert.throws(() => dates.normalizePublicDate('2026-13-21T12:00:00', 'month'));
  assert.throws(() => dates.normalizePublicDate('unknown', 'month'));
  assert.equal(dates.resolveDatePrecision(undefined), 'month');
  assert.equal(dates.resolveDatePrecision('exact'), 'exact');
});

test('exact publication preserves the source local timestamp and year boundary', () => {
  assert.equal(dates.normalizePublicDate('2027-01-01T01:30:00', 'exact'),
    '2027-01-01T01:30:00');
  assert.equal(dates.activityYear('2027-01'), 2027);
  assert.equal(dates.activityYear('2027-01-01T01:30:00'), 2027);
});

test('month-only dates format without a fabricated day in Japanese and English', () => {
  assert.equal(dates.formatActivityDate('2026-11', 'ja', true), '2026年11月');
  assert.equal(dates.formatActivityDate('2026-11', 'en', true), '2026-11');
  assert.equal(dates.formatActivityDate('2026-11-14T16:05:00', 'ja', true),
    '2026年11月14日 16:05');
});
