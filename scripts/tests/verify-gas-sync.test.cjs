'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '../..');
const verifier = path.join(root, 'scripts/verify-gas-sync.cjs');
const expected = [
  '00_Config.gs', '01_Sheets.gs', '02_Parser.gs', '03_Sync.gs',
  '04_Triggers.gs', '05_PublicPreview.gs', '06_BatchedPublish.gs',
  'appsscript.json',
].map((filename) => 'gas/' + filename);

function checkStatus(paths) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'kudos-clasp-test-'));
  try {
    const file = path.join(temp, 'status.json');
    fs.writeFileSync(file, JSON.stringify({ filesToPush: paths }));
    return spawnSync(process.execPath, [verifier, file], {
      cwd: root, encoding: 'utf8',
    });
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

test('approved GAS scripts and manifest pass clasp preflight', () => {
  const result = checkStatus(expected);
  assert.equal(result.status, 0, result.stderr);
});

test('unexpected deployable file blocks a push', () => {
  const result = checkStatus([...expected, 'gas/tests/injected.gs']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /GAS source validation failed/);
});

test('missing manifest blocks a push', () => {
  const result = checkStatus(expected.filter((entry) => entry !== 'gas/appsscript.json'));
  assert.notEqual(result.status, 0);
});
