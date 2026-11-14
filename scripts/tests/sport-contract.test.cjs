'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { createRequire } = require('node:module');

const root = path.resolve(__dirname, '../..');
const cases = JSON.parse(fs.readFileSync(path.join(root, 'shared/sport-contract-cases.json'), 'utf8'));
const gas = vm.createContext({});
new vm.Script(fs.readFileSync(path.join(root, 'gas/00_Config.gs'), 'utf8'))
  .runInContext(gas);

const tsPath = path.join(root, 'src/core/sports.ts');
const compiled = ts.transpileModule(fs.readFileSync(tsPath, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    esModuleInterop: true },
}).outputText;
const frontend = {};
new Function('require', 'exports', compiled)(createRequire(tsPath), frontend);

test('GAS and TypeScript classify all shared contract cases identically', () => {
  for (const item of cases) {
    const name = item.nameOverride || item.name;
    const detected = item.detected;
    const override = item.override || '';
    const actualGas = vm.runInContext('kudosResolveSport_(_name, _detected, _override)', Object.assign(gas,
      { _name: name, _detected: detected, _override: override }));
    const actualFrontend = frontend.resolveSportClassification(name, detected, override);
    for (const actual of [actualGas, actualFrontend]) {
      assert.equal(actual.sport, item.expected, JSON.stringify(item));
      assert.equal(actual.confidence, item.confidence, JSON.stringify(item));
    }
    assert.equal(actualGas.sport, actualFrontend.sport);
    assert.equal(actualGas.confidence, actualFrontend.confidence);
  }
});

test('legacy Run is Walk while trusted genre_version preserves GAS override', () => {
  assert.equal(frontend.normalizeSport(' Run '), 'Walk');
  assert.equal(frontend.resolveActivitySport('ゴルフ', 'Run', false), 'Golf');
  assert.equal(frontend.resolveActivitySport('ゴルフ', 'Run', true), 'Walk');
  assert.equal(frontend.resolveActivitySport('サイクリング', 'Unknown', true), null);
  assert.equal(frontend.resolveActivitySport('不明', 'Unknown', false), null);
  assert.deepEqual(Array.from(frontend.SPORT_ORDER), ['Ride', 'Walk', 'Golf']);
});
