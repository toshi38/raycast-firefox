#!/usr/bin/env node
'use strict';

/**
 * Pin the native host release that the Raycast extension installs.
 *
 * Writes the native host version and the SHA-256 of each release asset to
 * raycast-extension/src/lib/native-host-pin.json. The Raycast extension only
 * installs that exact release and rejects files whose hashes differ, so the
 * Store PR that ships the extension also records which host it installs.
 *
 * The release workflow runs this after versioning and building, before the
 * version commit, so the pin always names the release being published.
 *
 * Usage: node scripts/pin-for-raycast.js [distDir] [outFile]
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PINNED_FILES = ['host.bundle.js', 'run.sh'];
const DEFAULT_DIST = path.join(__dirname, '..', 'dist');
const DEFAULT_OUT = path.join(__dirname, '..', '..', 'raycast-extension', 'src', 'lib', 'native-host-pin.json');

/**
 * Build the pin for `version` from the files in `distDir`.
 * Throws if a pinned file is missing.
 */
function buildPin(version, distDir) {
  const sha256 = {};
  for (const name of PINNED_FILES) {
    const contents = fs.readFileSync(path.join(distDir, name));
    sha256[name] = crypto.createHash('sha256').update(contents).digest('hex');
  }
  return { version, sha256 };
}

/** Write the pin as Prettier-formatted JSON. */
function writePin(pin, outFile) {
  fs.writeFileSync(outFile, JSON.stringify(pin, null, 2) + '\n');
}

if (require.main === module) {
  const distDir = process.argv[2] || DEFAULT_DIST;
  const outFile = process.argv[3] || DEFAULT_OUT;
  const { version } = require('../package.json');
  const pin = buildPin(version, distDir);
  writePin(pin, outFile);
  console.log(`Pinned native-host@${version} in ${path.relative(process.cwd(), outFile)}`);
  for (const [name, hash] of Object.entries(pin.sha256)) console.log(`  ${hash}  ${name}`);
}

module.exports = { PINNED_FILES, buildPin, writePin };
