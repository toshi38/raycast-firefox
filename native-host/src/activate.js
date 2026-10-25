'use strict';

const { execFile } = require('child_process');

const FIREFOX_BUNDLE_ID = 'org.mozilla.firefox';

// NSApplicationActivateIgnoringOtherApps (2) without NSApplicationActivateAllWindows (1)
// brings only the key/main window forward, matching alt-tab behavior.
const ACTIVATE_OPTIONS = 2;

/**
 * Build a JXA snippet that leaves the NSRunningApplication to raise in `app`.
 *
 * Each Firefox profile runs as its own process under the same bundle ID, so
 * look up the given process (the Firefox that launched this host) rather than
 * whichever one the bundle ID lookup happens to list first. Falls back to the
 * bundle ID lookup when that process is not an application.
 */
function buildLookupScript(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    throw new TypeError(`Invalid Firefox process ID: ${pid}`);
  }
  return `
    ObjC.import("AppKit");
    var app = $.NSRunningApplication.runningApplicationWithProcessIdentifier(${pid});
    if (app.isNil()) {
      var apps = $.NSRunningApplication.runningApplicationsWithBundleIdentifier("${FIREFOX_BUNDLE_ID}");
      if (apps.count > 0) app = apps.objectAtIndex(0);
    }
  `;
}

/**
 * Build a JXA script that raises the Firefox process `pid`.
 */
function buildActivateScript(pid) {
  return `${buildLookupScript(pid)}
    if (!app.isNil()) app.activateWithOptions(${ACTIVATE_OPTIONS});
  `;
}

/**
 * Raise the Firefox process that launched this host. macOS only.
 *
 * @param {number} [pid] - Firefox process ID (defaults to our parent)
 * @param {object} [opts]
 * @param {Function} [opts.run] - execFile-compatible runner
 * @param {Function} [opts.onError] - Called with the error if osascript fails
 */
function activateFirefox(pid = process.ppid, { run = execFile, onError = () => {} } = {}) {
  run('osascript', ['-l', 'JavaScript', '-e', buildActivateScript(pid)], (err) => {
    if (err) onError(err);
  });
}

module.exports = {
  FIREFOX_BUNDLE_ID,
  buildLookupScript,
  buildActivateScript,
  activateFirefox,
};
