'use strict';

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

/**
 * Pick the Firefox profile directory out of `lsof -Fn` output.
 *
 * A running Firefox holds `.parentlock` open in its profile directory. It can
 * also hold other `.parentlock` files (for example the update directory), so
 * only a directory that contains `prefs.js` counts as a profile.
 *
 * @param {string} output - Output of `lsof -Fn -p <pid>`
 * @param {Function} [exists] - fs.existsSync-compatible function
 * @returns {string|null}
 */
function parseProfilePath(output, exists = fs.existsSync) {
  for (const line of output.split('\n')) {
    if (!line.startsWith('n') || !line.endsWith('/.parentlock')) continue;
    const dir = path.dirname(line.slice(1));
    if (exists(path.join(dir, 'prefs.js'))) return dir;
  }
  return null;
}

/**
 * Find the profile directory of the Firefox process `firefoxPid`.
 * Resolves to null if it cannot be determined.
 *
 * @param {number} firefoxPid
 * @param {object} [opts]
 * @param {Function} [opts.run] - execFile-compatible runner
 * @returns {Promise<string|null>}
 */
function detectProfilePath(firefoxPid, { run = execFile } = {}) {
  return new Promise((resolve) => {
    run('lsof', ['-a', '-p', String(firefoxPid), '-Fn'], { maxBuffer: 16 * 1024 * 1024 }, (err, stdout) => {
      // lsof exits 1 when some files can't be listed but still prints the rest.
      resolve(stdout ? parseProfilePath(String(stdout)) : null);
    });
  });
}

module.exports = { parseProfilePath, detectProfilePath };
