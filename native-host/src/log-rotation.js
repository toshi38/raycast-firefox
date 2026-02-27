'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const LOG_DIR = path.join(os.homedir(), '.raycast-firefox', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'host.log');
const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_LOG_FILES = 5;

/**
 * Rotate logs at startup if the current log file exceeds MAX_LOG_SIZE.
 * Shifts host.log -> host.log.1 -> host.log.2 -> ... -> host.log.N (deleted).
 * Only runs once at process start -- not on every write.
 */
function rotateIfNeeded() {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    const stat = fs.statSync(LOG_FILE);
    if (stat.size < MAX_LOG_SIZE) return;

    // Delete oldest
    const oldest = `${LOG_FILE}.${MAX_LOG_FILES}`;
    try { fs.unlinkSync(oldest); } catch (_) { /* ignore */ }

    // Shift existing rotated files
    for (let i = MAX_LOG_FILES - 1; i >= 1; i--) {
      const from = `${LOG_FILE}.${i}`;
      const to = `${LOG_FILE}.${i + 1}`;
      try { fs.renameSync(from, to); } catch (_) { /* ignore */ }
    }

    // Rotate current
    fs.renameSync(LOG_FILE, `${LOG_FILE}.1`);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      // Can't log yet -- write to stderr as last resort
      process.stderr.write(`Log rotation error: ${err.message}\n`);
    }
  }
}

module.exports = { rotateIfNeeded, LOG_DIR, LOG_FILE };
