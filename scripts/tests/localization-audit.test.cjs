'use strict';

// Audit maintained source and documentation; imported user activity names are not translations.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Unicode escapes keep the guard readable without embedding untranslated UI copy.
// Only characters specific to simplified Chinese are included; Japanese kanji are allowed.
const simplifiedChinese = /[\u8fd9\u4eec\u6ca1\u4e3a\u53d1\u5e94\u65f6\u7f51\u56fe\u7ecf\u73b0\u6837\u5bfc\u6d4b\u5f55\u9009\u8f66\u8fd0\u8ba1\u7ed3\u7edf\u8bfb\u5173\u9875\u7f16\u5f00\u7535\u89c8\u9501\u5f39\u663e\u5e2e\u529e\u89c9\u5b9e\u8bdd\u8282\u9f50\u6b22\u8d25\u52b2\u8bed\u5c81\u953b\u70bc\u7231\u6ee1\u7ea7\u9a91\u7eed\u8d1f\u521a\u6682\u7c7b\u8ff9\u6865\u5417\u5bf9\u8bb2\u8fc7\u8bbe\u7b80\u7efc\u79cd\u8fd8\u6237\u4e2a\u5e08\u9879\u9876\u573a\u9519\u8bd5\u4e1c\u51fb\u50a8\u538b\u6267]/u;
const extensions = new Set(['.ts', '.tsx', '.css', '.gs', '.cjs', '.md', '.yml', '.html']);

function collect(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const name = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Generated and user-authored activity names should not be rewritten.
      if (name === path.join('src', 'static') || name === path.join('src', 'assets')) return [];
      return collect(name);
    }
    return extensions.has(path.extname(name)) ? [name] : [];
  });
}

test('maintained source and docs have no simplified Chinese UI text or comments', () => {
  const files = [
    ...collect('src'), ...collect('gas'), ...collect('scripts'),
    ...collect('docs'), 'README.md', 'index.html', 'config.yml',
  ];
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    assert.equal(simplifiedChinese.test(content), false,
      'Unexpected simplified Chinese character in ' + file);
  }
});

test('calendar empty state and heatmap counters use Japanese for ja locale', () => {
  const calendar = fs.readFileSync('src/components/CalendarWidget.tsx', 'utf8');
  const heatmap = fs.readFileSync('src/components/ContributionHeatmap.tsx', 'utf8');
  const summary = fs.readFileSync('src/components/SummaryPage.tsx', 'utf8');
  assert.match(calendar, /'この月のアクティビティはありません'/u);
  assert.doesNotMatch(calendar, /\bzh\b/u);
  assert.doesNotMatch(summary, /\bzh\b/u);
  assert.doesNotMatch(heatmap, /locale === 'ja' \? '次' : 'sessions'/u);
  assert.equal((heatmap.match(/locale === 'ja' \? '回' : 'sessions'/gu) || []).length, 3);
});
