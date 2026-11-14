'use strict';

// Single source of truth: shared/sport-rules.json.
// TypeScript imports JSON directly; Apps Script receives a generated literal.
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const rulesPath = path.join(root, 'shared/sport-rules.json');
const gasPath = path.join(root, 'gas/00_Config.gs');
const begin = '// BEGIN GENERATED SPORT RULES - DO NOT EDIT';
const end = '// END GENERATED SPORT RULES';
const check = process.argv.includes('--check');

function validateRules(rules) {
  const genres = ['Ride', 'Walk', 'Golf'];
  const isPermutation = (values) =>
    Array.isArray(values) && values.length === genres.length &&
    genres.every((genre) => values.includes(genre)) &&
    new Set(values).size === genres.length;

  if (rules.version !== 1 || !isPermutation(rules.order) ||
      !isPermutation(rules.titlePriority)) {
    throw new Error('Invalid sport rule schema, genre order, or title priority.');
  }
  const aliases = new Set();
  for (const [label, groups] of [
    ['aliases', rules.aliases],
    ['titleKeywords', rules.titleKeywords],
  ]) {
    if (!groups || Object.keys(groups).sort().join(',') !== genres.slice().sort().join(',')) {
      throw new Error('Invalid ' + label + ' genre keys.');
    }
    for (const genre of genres) {
      const tokens = groups[genre];
      if (!Array.isArray(tokens) || !tokens.length ||
          tokens.some((word) => typeof word !== 'string' ||
            !word.trim() || word !== word.toLowerCase() || word !== word.trim()) ||
          new Set(tokens).size !== tokens.length) {
        throw new Error('Invalid/duplicate ' + label + ' for ' + genre);
      }
      if (label === 'aliases') {
        for (const alias of tokens) {
          if (aliases.has(alias)) throw new Error('Overlapping sport aliases: ' + alias);
          aliases.add(alias);
        }
      }
    }
  }
}

try {
  const rules = JSON.parse(fs.readFileSync(rulesPath, 'utf8'));
  validateRules(rules);
  const source = fs.readFileSync(gasPath, 'utf8');
  const start = source.indexOf(begin);
  const finish = source.indexOf(end, start + begin.length);
  if (start < 0 || finish < 0 || source.indexOf(begin, start + 1) >= 0 ||
      source.indexOf(end, finish + 1) >= 0) {
    throw new Error('Missing or duplicated generated block markers in GAS.');
  }
  // Git for Windows can check out .gs files with CRLF. A content-equivalent
  // generated block must use the existing file's newline convention.
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  const block = (begin + '\nconst KUDOS_SPORT_RULES = Object.freeze(' +
    JSON.stringify(rules, null, 2) + ');\n' + end).replace(/\n/g, newline);
  const expected = source.slice(0, start) + block + source.slice(finish + end.length);
  if (check) {
    if (source !== expected) throw new Error(
      'Generated GAS rules are stale. Run: node scripts/generate-sport-rules.cjs'
    );
    console.log('GAS sport rules match shared/sport-rules.json.');
  } else if (expected !== source) {
    fs.writeFileSync(gasPath, expected);
    console.log('Updated generated GAS sport rules.');
  } else {
    console.log('GAS sport rules are current.');
  }
} catch (error) {
  console.error('Sport rule generation failed: ' + error.message);
  process.exitCode = 1;
}
