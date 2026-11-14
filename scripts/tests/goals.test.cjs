'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const configuration = fs.readFileSync('config.yml', 'utf8');
const defaults = {
  Ride: { yearly: 2000, monthly: 150 },
  Walk: { yearly: 250, monthly: 20 },
  Golf: { yearly: 10, monthly: 1 },
};
const storage = new Map();
const goalsModule = {};
const source = ts.transpileModule(
  fs.readFileSync('src/core/goals.ts', 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }
).outputText;
vm.runInNewContext(source, {
  exports: goalsModule,
  require(name) {
    if (name === './config') {
      return { GOALS: Object.fromEntries(
        Object.entries(defaults).map(([key, value]) => [key, { ...value, unit: 'distance' }])
      ) };
    }
    if (name === './sports') return { SPORT_ORDER: ['Ride', 'Walk', 'Golf'] };
    throw new Error('Unexpected module ' + name);
  },
  window: { localStorage: {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: key => storage.delete(key),
  } },
});

test('bundled config defines cycling, walking and golf annual/monthly defaults', () => {
  const expected = [
    ['Ride', 2000, 150], ['Walk', 250, 20], ['Golf', 10, 1],
  ];
  for (const [sport, year, month] of expected) {
    assert.match(configuration, new RegExp(
      '  ' + sport + ':\\s*\\n    yearly: ' + year + '\\s*\\n    monthly: ' + month + '\\b'
    ));
  }
  assert.deepEqual({ ...goalsModule.defaultSportGoals().Ride }, defaults.Ride);
  assert.deepEqual({ ...goalsModule.defaultSportGoals().Walk }, defaults.Walk);
  assert.deepEqual({ ...goalsModule.defaultSportGoals().Golf }, defaults.Golf);
});

test('individual sports and combined filter show independent goals', () => {
  const goals = goalsModule.defaultSportGoals();
  const selected = goalsModule.getGoalForFilter('Walk', goals);
  assert.equal(selected.yearly, 250);
  assert.equal(selected.monthly, 20);
  assert.ok(selected.weekly > 4.6 && selected.weekly < 4.7);
  const combined = goalsModule.getGoalForFilter('all', goals);
  assert.equal(combined.yearly, 2260);
  assert.equal(combined.monthly, 171);
  assert.equal(combined.weekly, 39.46);
});

test('user-specific goals persist and can be reset without changing other users', () => {
  const a = goalsModule.defaultSportGoals();
  a.Golf = { yearly: 18, monthly: 1.5 };
  assert.equal(goalsModule.saveSportGoals('alice', a), true);
  assert.equal(goalsModule.loadSportGoals('alice').Golf.yearly, 18);
  assert.equal(goalsModule.loadSportGoals('bob').Golf.yearly, 10);
  assert.equal(goalsModule.resetSportGoals('alice'), true);
  assert.equal(goalsModule.loadSportGoals('alice').Golf.yearly, 10);
});

test('invalid goals and malformed stored JSON cannot poison the dashboard', () => {
  assert.equal(goalsModule.isValidGoalKm(0), false);
  assert.equal(goalsModule.isValidGoalKm(Number.NaN), false);
  assert.equal(goalsModule.isValidGoalKm(Infinity), false);
  assert.equal(goalsModule.isValidGoalKm('1'), false);
  assert.equal(goalsModule.isValidGoalKm(0.5), true);
  const corrupt = { Ride: { yearly: -1, monthly: 7 }, Walk: { yearly: null } };
  const sanitized = goalsModule.mergeStoredSportGoals(corrupt);
  assert.equal(sanitized.Ride.yearly, 2000);
  assert.equal(sanitized.Ride.monthly, 7);
  assert.equal(sanitized.Walk.yearly, 250);
  assert.equal(sanitized.Golf.monthly, 1);
  storage.set('kudos:sport-goals:v1:broken', '{');
  assert.equal(goalsModule.loadSportGoals('broken').Ride.monthly, 150);
  assert.equal(goalsModule.saveSportGoals('bad', {
    Ride: { yearly: 0, monthly: 1 },
    Walk: defaults.Walk,
    Golf: defaults.Golf,
  }), false);
});
