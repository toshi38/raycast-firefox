'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { describe, test } = require('node:test');
const {
  FIREFOX_BUNDLE_ID,
  buildLookupScript,
  buildActivateScript,
  activateFirefox,
} = require('../src/activate');

const isMac = process.platform === 'darwin';

/** Run a lookup script on macOS and return the PID it resolved, or '' for none. */
function resolvePid(pid) {
  const script = `${buildLookupScript(pid)}
    app.isNil() ? "" : String(app.processIdentifier);
  `;
  return execFileSync('osascript', ['-l', 'JavaScript', '-e', script], { encoding: 'utf-8' }).trim();
}

/** The PID the bundle ID lookup lists first, or '' when Firefox is not running. */
function firstFirefoxPid() {
  const script = `
    ObjC.import("AppKit");
    var apps = $.NSRunningApplication.runningApplicationsWithBundleIdentifier("${FIREFOX_BUNDLE_ID}");
    apps.count > 0 ? String(apps.objectAtIndex(0).processIdentifier) : "";
  `;
  return execFileSync('osascript', ['-l', 'JavaScript', '-e', script], { encoding: 'utf-8' }).trim();
}

function finderPid() {
  try {
    return execFileSync('pgrep', ['-x', 'Finder'], { encoding: 'utf-8' }).trim().split('\n')[0];
  } catch {
    return '';
  }
}

describe('buildActivateScript', () => {
  test('looks up the given process before the bundle ID', () => {
    const script = buildActivateScript(4242);
    const byPid = script.indexOf('runningApplicationWithProcessIdentifier(4242)');
    const byBundle = script.indexOf(`runningApplicationsWithBundleIdentifier("${FIREFOX_BUNDLE_ID}")`);
    assert.ok(byPid !== -1, 'targets the given PID');
    assert.ok(byBundle > byPid, 'falls back to the bundle ID lookup afterwards');
  });

  test('raises only the focused window', () => {
    assert.match(buildActivateScript(4242), /activateWithOptions\(2\)/);
  });

  for (const pid of [0, -1, 1.5, NaN, '4242', '1); doShellScript("x"', undefined]) {
    test(`rejects invalid PID ${typeof pid === 'string' ? JSON.stringify(pid) : String(pid)}`, () => {
      assert.throws(() => buildActivateScript(pid), TypeError);
    });
  }
});

describe('activateFirefox', () => {
  test('runs the activate script for the given PID through osascript', () => {
    const calls = [];
    activateFirefox(4242, { run: (...args) => calls.push(args) });
    assert.equal(calls.length, 1);
    const [cmd, args] = calls[0];
    assert.equal(cmd, 'osascript');
    assert.deepEqual(args, ['-l', 'JavaScript', '-e', buildActivateScript(4242)]);
  });

  test('defaults to the parent process, the Firefox that launched the host', () => {
    const calls = [];
    activateFirefox(undefined, { run: (...args) => calls.push(args) });
    assert.equal(calls[0][1][3], buildActivateScript(process.ppid));
  });

  test('reports osascript failures to onError', () => {
    const failure = new Error('osascript failed');
    const errors = [];
    activateFirefox(4242, {
      run: (_cmd, _args, cb) => cb(failure),
      onError: (err) => errors.push(err),
    });
    assert.deepEqual(errors, [failure]);
  });

  test('does not call onError on success', () => {
    const errors = [];
    activateFirefox(4242, {
      run: (_cmd, _args, cb) => cb(null),
      onError: (err) => errors.push(err),
    });
    assert.deepEqual(errors, []);
  });
});

describe('lookup script on macOS', { skip: !isMac && 'requires macOS' }, () => {
  test('resolves the given application process, not the first bundle ID match', (t) => {
    const pid = finderPid();
    if (!pid) {
      t.skip('Finder is not running');
      return;
    }
    assert.equal(resolvePid(Number(pid)), pid);
  });

  test('falls back to the bundle ID lookup when the process is not an application', () => {
    // launchd (PID 1) is never an NSRunningApplication.
    assert.equal(resolvePid(1), firstFirefoxPid());
  });
});
