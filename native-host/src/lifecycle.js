'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { logger } = require('./logger');

const CONFIG_DIR = path.join(os.homedir(), '.raycast-firefox');
const PID_FILE = path.join(CONFIG_DIR, 'host.pid');
const PORT_FILE = path.join(CONFIG_DIR, 'port');

/**
 * Kill any old host process found via the PID file.
 * Ensures only one host instance runs at a time.
 */
async function killOldProcess() {
  let pidStr;
  try {
    pidStr = fs.readFileSync(PID_FILE, 'utf-8').trim();
  } catch (err) {
    if (err.code === 'ENOENT') {
      // No PID file -- first run or already cleaned up
      return;
    }
    throw err;
  }

  const oldPid = parseInt(pidStr, 10);
  if (isNaN(oldPid)) {
    logger.warn({ pidStr }, 'Stale PID file with invalid content, removing');
    try { fs.unlinkSync(PID_FILE); } catch (_) { /* ignore */ }
    return;
  }

  // Check if process is alive
  try {
    process.kill(oldPid, 0);
  } catch (err) {
    if (err.code === 'ESRCH') {
      logger.info({ pid: oldPid }, 'Stale PID file, old process already gone');
      try { fs.unlinkSync(PID_FILE); } catch (_) { /* ignore */ }
      return;
    }
    throw err;
  }

  // Process is alive -- send SIGTERM
  logger.info({ pid: oldPid }, 'Killing old host process');
  try {
    process.kill(oldPid, 'SIGTERM');
  } catch (_) { /* ignore */ }

  // Wait 1 second then check again
  await new Promise((resolve) => setTimeout(resolve, 1000));

  try {
    process.kill(oldPid, 0);
    // Still alive -- send SIGKILL
    logger.warn({ pid: oldPid }, 'Old process still alive after SIGTERM, sending SIGKILL');
    try {
      process.kill(oldPid, 'SIGKILL');
    } catch (_) { /* ignore */ }
  } catch (err) {
    if (err.code === 'ESRCH') {
      // Process exited after SIGTERM -- good
      return;
    }
    throw err;
  }
}

/**
 * Write the current process PID to the PID file.
 */
function writePidFile() {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(PID_FILE, String(process.pid));
  logger.info({ pid: process.pid }, 'PID file written');
}

/**
 * Remove the PID file on shutdown.
 */
function cleanupPidFile() {
  try { fs.unlinkSync(PID_FILE); } catch (_) { /* ignore */ }
}

/**
 * Write the server port to the port file atomically.
 * Writes to a temp file first then renames (atomic on POSIX).
 */
function writePortFile(port) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  const tmpFile = path.join(CONFIG_DIR, 'port.tmp.' + process.pid);
  fs.writeFileSync(tmpFile, String(port));
  fs.renameSync(tmpFile, PORT_FILE);
  logger.info({ port }, 'Port file written');
}

/**
 * Remove the port file on shutdown.
 */
function cleanupPortFile() {
  try { fs.unlinkSync(PORT_FILE); } catch (_) { /* ignore */ }
}

/**
 * Returns the config directory path.
 */
function getConfigDir() {
  return CONFIG_DIR;
}

module.exports = {
  killOldProcess,
  writePidFile,
  cleanupPidFile,
  writePortFile,
  cleanupPortFile,
  getConfigDir,
};
