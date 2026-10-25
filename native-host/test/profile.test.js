'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { describe, test } = require('node:test');
const { parseProfilePath, detectProfilePath } = require('../src/profile');

const PROFILES = '/Users/me/Library/Application Support/Firefox/Profiles';

const LSOF_OUTPUT = [
  'p78957',
  'fcwd',
  'n/',
  'f12',
  'n/Users/me/Library/Caches/Mozilla/updates/Applications/Firefox/.parentlock',
  'f13',
  `n${PROFILES}/rgS3yvsW.Profile 1/.parentlock`,
  'f14',
  `n${PROFILES}/rgS3yvsW.Profile 1/places.sqlite`,
  '',
].join('\n');

const existsIn = (...files) => (file) => files.includes(file);

describe('parseProfilePath', () => {
  test('returns the locked directory that contains prefs.js', () => {
    const exists = existsIn(`${PROFILES}/rgS3yvsW.Profile 1/prefs.js`);
    assert.equal(parseProfilePath(LSOF_OUTPUT, exists), `${PROFILES}/rgS3yvsW.Profile 1`);
  });

  test('skips .parentlock files outside a profile, such as the update directory', () => {
    assert.equal(parseProfilePath(LSOF_OUTPUT, existsIn()), null);
  });

  test('ignores names that merely contain .parentlock', () => {
    const output = `n${PROFILES}/x.default/.parentlock-journal\n`;
    assert.equal(parseProfilePath(output, () => true), null);
  });

  test('returns null for empty output', () => {
    assert.equal(parseProfilePath('', () => true), null);
  });
});

describe('detectProfilePath', () => {
  test('asks lsof for the files of the given Firefox process', async () => {
    let call;
    await detectProfilePath(78957, {
      run: (cmd, args, _opts, cb) => {
        call = [cmd, args];
        cb(null, '');
      },
    });
    assert.deepEqual(call, ['lsof', ['-a', '-p', '78957', '-Fn']]);
  });

  test('still uses the output when lsof exits non-zero', async (t) => {
    // lsof exits 1 when it cannot list some of the files.
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'raycast-firefox-profile-'));
    t.after(() => fs.rmSync(profile, { recursive: true, force: true }));
    fs.writeFileSync(path.join(profile, 'prefs.js'), '');

    const result = await detectProfilePath(1, {
      run: (_cmd, _args, _opts, cb) => cb(new Error('exit 1'), `p1\nn${profile}/.parentlock\n`),
    });

    assert.equal(result, profile);
  });

  test('resolves null when lsof produces nothing', async () => {
    const result = await detectProfilePath(1, {
      run: (_cmd, _args, _opts, cb) => cb(new Error('lsof failed'), ''),
    });
    assert.equal(result, null);
  });
});
