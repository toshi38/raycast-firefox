'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { afterEach, beforeEach, describe, test } = require('node:test');
const { PINNED_FILES, buildPin, writePin } = require('../scripts/pin-for-raycast');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'pin-for-raycast.js');
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

let dir;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'raycast-firefox-pin-'));
  fs.writeFileSync(path.join(dir, 'host.bundle.js'), 'bundle contents');
  fs.writeFileSync(path.join(dir, 'run.sh'), '#!/bin/sh\n');
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('buildPin', () => {
  test('records the version and the SHA-256 of each release asset', () => {
    assert.deepEqual(buildPin('1.2.0', dir), {
      version: '1.2.0',
      sha256: {
        'host.bundle.js': sha256('bundle contents'),
        'run.sh': sha256('#!/bin/sh\n'),
      },
    });
  });

  test('pins the assets the Raycast installer downloads', () => {
    assert.deepEqual(PINNED_FILES, ['host.bundle.js', 'run.sh']);
  });

  test('fails when an asset is missing rather than pinning a partial release', () => {
    fs.unlinkSync(path.join(dir, 'run.sh'));
    assert.throws(() => buildPin('1.2.0', dir), /ENOENT/);
  });
});

describe('writePin', () => {
  test('writes Prettier-formatted JSON with a trailing newline', () => {
    const out = path.join(dir, 'pin.json');
    writePin({ version: '1.2.0', sha256: { 'run.sh': 'ab' } }, out);
    assert.equal(fs.readFileSync(out, 'utf-8'), '{\n  "version": "1.2.0",\n  "sha256": {\n    "run.sh": "ab"\n  }\n}\n');
  });
});

describe('pin-for-raycast.js', () => {
  test('pins the version from package.json', () => {
    const out = path.join(dir, 'pin.json');
    execFileSync(process.execPath, [SCRIPT, dir, out], { stdio: 'ignore' });
    const pin = JSON.parse(fs.readFileSync(out, 'utf-8'));
    assert.equal(pin.version, require('../package.json').version);
    assert.equal(pin.sha256['host.bundle.js'], sha256('bundle contents'));
  });
});
