'use strict';

// Fail closed if clasp could upload files other than the approved GAS sources.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const gasRoot = path.join(root, 'gas');
const sourceNames = [
  '00_Config.gs',
  '01_Sheets.gs',
  '02_Parser.gs',
  '03_Sync.gs',
  '04_Triggers.gs',
  '05_PublicPreview.gs',
  '06_BatchedPublish.gs',
];
const allowedPaths = new Set([
  ...sourceNames.map((name) => 'gas/' + name),
  'gas/appsscript.json',
]);

function assertSameFiles(files, description) {
  const listed = [...files].sort();
  const expected = [...allowedPaths].sort();
  if (listed.length !== new Set(listed).size ||
      JSON.stringify(listed) !== JSON.stringify(expected)) {
    throw new Error(description + ' differs from the GAS allowlist.\n' +
      'Expected: ' + expected.join(', ') + '\n' +
      'Actual: ' + listed.join(', '));
  }
}

function collectDeployableFiles(directory, relativeDir = 'gas') {
  const result = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const relative = relativeDir + '/' + entry.name;
    if (entry.isSymbolicLink()) {
      throw new Error('Symlinks are not allowed in the GAS source tree: ' + relative);
    }
    if (entry.isDirectory()) {
      result.push(...collectDeployableFiles(path.join(directory, entry.name), relative));
    } else if (/\.(gs|js|html|json)$/i.test(entry.name)) {
      result.push(relative);
    }
  }
  return result;
}

try {
  const generated = spawnSync(process.execPath,
    [path.join(root, 'scripts/generate-sport-rules.cjs'), '--check'],
    { cwd: root, encoding: 'utf8' });
  if (generated.status !== 0) {
    throw new Error('Generated sport rules differ from the canonical JSON. ' +
      (generated.stderr || '').trim());
  }
  assertSameFiles(collectDeployableFiles(gasRoot), 'Local deployable files');
  for (const name of sourceNames) {
    const source = fs.readFileSync(path.join(gasRoot, name), 'utf8');
    new vm.Script(source, { filename: name });
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(gasRoot, 'appsscript.json'), 'utf8'));
  if (manifest.runtimeVersion !== 'V8') {
    throw new Error('Apps Script manifest must use the V8 runtime.');
  }

  const configPath = path.join(root, '.clasp.json');
  if (fs.existsSync(configPath)) {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (!config.scriptId || config.rootDir !== 'gas') {
      throw new Error('.clasp.json must contain a scriptId and rootDir: "gas".');
    }
  }

  if (process.argv.length > 2) {
    const status = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
    if (!Array.isArray(status.filesToPush)) {
      throw new Error('Expected clasp show-file-status --json output.');
    }
    const files = status.filesToPush.map((file) =>
      String(file).replace(/\\/g, '/').replace(/^\.\//, '')
    );
    assertSameFiles(files, 'clasp filesToPush');
  }
  console.log('GAS source validation passed: 7 scripts and appsscript.json.');
} catch (error) {
  console.error('GAS source validation failed: ' + error.message);
  process.exitCode = 1;
}
