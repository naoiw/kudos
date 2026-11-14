'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '../..');
const script = fs.readFileSync(path.join(root, 'scripts/generate-sport-rules.cjs'), 'utf8');
const canonicalRules = fs.readFileSync(path.join(root, 'shared/sport-rules.json'), 'utf8');
const currentGas = fs.readFileSync(path.join(root, 'gas/00_Config.gs'), 'utf8');

function fixture(source) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kudos-sport-eol-'));
  for (const folder of ['scripts', 'shared', 'gas']) {
    fs.mkdirSync(path.join(directory, folder));
  }
  fs.writeFileSync(path.join(directory, 'scripts/generate-sport-rules.cjs'), script);
  fs.writeFileSync(path.join(directory, 'shared/sport-rules.json'), canonicalRules);
  fs.writeFileSync(path.join(directory, 'gas/00_Config.gs'), source);
  return {
    directory,
    gas: path.join(directory, 'gas/00_Config.gs'),
    run(...args) {
      return spawnSync(process.execPath, [
        path.join(directory, 'scripts/generate-sport-rules.cjs'), ...args,
      ], { encoding: 'utf8' });
    },
    cleanup() { fs.rmSync(directory, { recursive: true, force: true }); },
  };
}

test('generated GAS sport rules validate on both LF and CRLF checkouts', () => {
  for (const eol of ['\n', '\r\n']) {
    const item = fixture(currentGas.replace(/\r?\n/g, eol));
    try {
      const checked = item.run('--check');
      assert.equal(checked.status, 0, checked.stderr);
      const before = fs.readFileSync(item.gas, 'utf8');
      assert.equal(item.run().status, 0);
      assert.equal(fs.readFileSync(item.gas, 'utf8'), before,
        'running generator on an unchanged file must not rewrite line endings');
    } finally { item.cleanup(); }
  }
});

test('stale rules fail validation, regenerate, and preserve CRLF', () => {
  const item = fixture(currentGas.replace(/\r?\n/g, '\r\n'));
  try {
    const rules = JSON.parse(canonicalRules);
    rules.titleKeywords.Golf.push('ゴルフ大会');
    fs.writeFileSync(path.join(item.directory, 'shared/sport-rules.json'),
      JSON.stringify(rules, null, 2));
    const stale = item.run('--check');
    assert.notEqual(stale.status, 0);
    assert.match(stale.stderr, /stale/);
    const generated = item.run();
    assert.equal(generated.status, 0, generated.stderr);
    const source = fs.readFileSync(item.gas, 'utf8');
    assert.ok(source.includes('ゴルフ大会'));
    assert.equal(source.replace(/\r\n/g, '').includes('\n'), false,
      'no isolated LF should be introduced into the CRLF source');
    const verified = item.run('--check');
    assert.equal(verified.status, 0, verified.stderr);
  } finally { item.cleanup(); }
});
