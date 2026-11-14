'use strict';

// This script is only invoked by the explicitly dispatched GAS workflow.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

try {
  if (process.env.GITHUB_ACTIONS !== 'true') {
    throw new Error('This setup is restricted to GitHub Actions.');
  }
  const scriptId = (process.env.GAS_SCRIPT_ID || '').trim();
  const credentials = process.env.CLASPRC_JSON || '';
  if (!/^[A-Za-z0-9_-]{20,}$/.test(scriptId)) {
    throw new Error('GAS_SCRIPT_ID is missing or invalid.');
  }
  const parsed = JSON.parse(credentials);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('CLASPRC_JSON must contain the clasp auth JSON object.');
  }

  // Fail if files already exist; never overwrite developer or runner credentials.
  fs.writeFileSync('.clasp.json', JSON.stringify({ scriptId, rootDir: 'gas' }) + '\n', {
    mode: 0o600, flag: 'wx',
  });
  fs.writeFileSync(path.join(os.homedir(), '.clasprc.json'), credentials, {
    mode: 0o600, flag: 'wx',
  });
  console.log('clasp configuration created without printing credentials.');
} catch (error) {
  console.error('clasp configuration failed: ' + error.message);
  process.exitCode = 1;
}
