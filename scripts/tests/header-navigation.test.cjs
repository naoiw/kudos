'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('header omits GitHub link but preserves primary navigation and theme toggle', () => {
  const header = fs.readFileSync('src/components/Header.tsx', 'utf8');
  assert.doesNotMatch(header, /github\.com\/naoiw\/kudos|title="GitHub"|>GitHub<\/a>/);
  assert.match(header, /onNavigate\('home'\)/);
  for (const page of ['home', 'tracks', 'summary', 'compare']) {
    assert.match(header, new RegExp("page: '" + page + "'"));
  }
  assert.match(header, /onClick=\{\(\) => onNavigate\(item\.page\)\}/);
  assert.match(header, /onClick=\{toggleTheme\}/);
});
