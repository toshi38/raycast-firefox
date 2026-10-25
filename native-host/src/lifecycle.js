'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const CONFIG_DIR = path.join(os.homedir(), '.raycast-firefox');

/**
 * Manage this host's registration so several Firefox profiles can each run
 * their own host side by side.
 *
 * Every Firefox process (one per running profile) launches its own host, so a
 * host is identified by the PID of the Firefox that launched it. Each host
 * owns `hosts/<firefoxPid>.json`, which Raycast reads to find every host:
 *
 *   { pid, firefoxPid, port, profilePath, version }
 *
 * `port` is null until the HTTP server is listening.
 *
 * The host also writes the single `port` file read by Raycast extension
 * versions that only know about one host. Whichever host wrote it last wins.
 *
 * @param {object} opts
 * @param {string} [opts.configDir] - Defaults to ~/.raycast-firefox
 * @param {number} opts.pid - This host's PID
 * @param {number} opts.firefoxPid - PID of the Firefox that launched this host
 * @param {string} opts.version - Native host version
 * @param {object} opts.logger - pino-compatible logger
 * @param {Function} [opts.kill] - process.kill-compatible function
 * @param {number} [opts.killGraceMs] - Wait between SIGTERM and SIGKILL
 */
function createLifecycle({
  configDir = CONFIG_DIR,
  pid,
  firefoxPid,
  version,
  logger,
  kill = process.kill.bind(process),
  killGraceMs = 1000,
}) {
  const hostsDir = path.join(configDir, 'hosts');
  const recordFile = path.join(hostsDir, `${firefoxPid}.json`);
  const legacyPidFile = path.join(configDir, 'host.pid');
  const legacyPortFile = path.join(configDir, 'port');

  const record = { pid, firefoxPid, port: null, profilePath: null, version };
  let registered = false;

  function isAlive(targetPid) {
    try {
      kill(targetPid, 0);
      return true;
    } catch (err) {
      // EPERM means the process exists but belongs to someone else.
      return err.code === 'EPERM';
    }
  }

  function readPid(file, parse) {
    try {
      const value = parse(fs.readFileSync(file, 'utf-8'));
      return Number.isInteger(value) && value > 0 ? value : null;
    } catch (_) {
      return null;
    }
  }

  async function terminate(targetPid) {
    logger.info({ pid: targetPid }, 'Killing previous host process');
    try { kill(targetPid, 'SIGTERM'); } catch (_) { /* ignore */ }

    await new Promise((resolve) => setTimeout(resolve, killGraceMs));

    if (isAlive(targetPid)) {
      logger.warn({ pid: targetPid }, 'Previous host still alive after SIGTERM, sending SIGKILL');
      try { kill(targetPid, 'SIGKILL'); } catch (_) { /* ignore */ }
    }
  }

  function writeAtomic(file, contents) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmpFile = `${file}.tmp.${pid}`;
    fs.writeFileSync(tmpFile, contents);
    fs.renameSync(tmpFile, file);
  }

  function writeRecord() {
    writeAtomic(recordFile, JSON.stringify(record));
    registered = true;
  }

  /** Every readable record other than this host's own, as { file, record }. */
  function otherRecords() {
    let names = [];
    try { names = fs.readdirSync(hostsDir).filter((n) => n.endsWith('.json')); } catch (_) { return []; }
    const others = [];
    for (const name of names) {
      const file = path.join(hostsDir, name);
      if (file === recordFile) continue;
      try {
        others.push({ file, record: JSON.parse(fs.readFileSync(file, 'utf-8')) });
      } catch (_) { /* skip unreadable record */ }
    }
    return others;
  }

  /** Remove `file` unless it has changed since it was read as `record`. */
  function removeStale(file, record) {
    removeIfOwned(file, (s) => {
      try { return JSON.parse(s).pid === record.pid; } catch (_) { return false; }
    });
  }

  /** Port of another serving host, or null. Only used while the shared port file is absent. */
  function otherLiveHostPort() {
    if (fs.existsSync(legacyPortFile)) return null;
    const live = otherRecords().find(({ record: r }) => Number.isInteger(r.port) && isAlive(r.pid));
    return live ? live.record.port : null;
  }

  function removeIfOwned(file, isOwned) {
    try {
      if (isOwned(fs.readFileSync(file, 'utf-8'))) fs.unlinkSync(file);
    } catch (_) { /* missing or unreadable: nothing of ours to remove */ }
  }

  return {
    recordFile,

    /**
     * Stop any previous host for the same Firefox process, plus a host from a
     * version that used the single shared `host.pid` file. Hosts belonging to
     * other Firefox profiles are left running.
     */
    async killPreviousHosts() {
      const candidates = [
        readPid(recordFile, (s) => JSON.parse(s).pid),
        readPid(legacyPidFile, (s) => parseInt(s.trim(), 10)),
      ];
      try { fs.unlinkSync(legacyPidFile); } catch (_) { /* ignore */ }

      const targets = [...new Set(candidates)].filter((p) => p && p !== pid && isAlive(p));
      await Promise.all(targets.map(terminate));
    },

    /**
     * Write this host's record before the HTTP server has a port, and remove
     * records left by hosts that died without cleaning up (for example after
     * SIGKILL), so a reused PID can't make one look alive again.
     */
    register() {
      for (const { file, record: other } of otherRecords()) {
        if (!Number.isInteger(other.pid) || !isAlive(other.pid)) removeStale(file, other);
      }
      writeRecord();
      logger.info({ recordFile, firefoxPid }, 'Host registered');
    },

    /**
     * Record the HTTP server port once it is listening. This host now owns the
     * port, so any other record still claiming it is stale.
     */
    publishPort(port) {
      record.port = port;
      for (const { file, record: other } of otherRecords()) {
        if (other.port === port) removeStale(file, other);
      }
      writeRecord();
      writeAtomic(legacyPortFile, String(port));
      logger.info({ port }, 'Port published');
    },

    /** Record the Firefox profile directory once it is known. */
    setProfilePath(profilePath) {
      record.profilePath = profilePath;
      if (registered) writeRecord();
    },

    /**
     * Remove this host's record. If the shared `port` file still points at
     * this host, point it at another running host, or remove it when there is
     * none. Leaves files written by any other host alone.
     */
    cleanup() {
      removeIfOwned(recordFile, (s) => {
        try { return JSON.parse(s).pid === pid; } catch (_) { return false; }
      });
      if (record.port !== null) {
        removeIfOwned(legacyPortFile, (s) => s.trim() === String(record.port));
        const next = otherLiveHostPort();
        if (next !== null) {
          try { writeAtomic(legacyPortFile, String(next)); } catch (_) { /* ignore */ }
        }
      }
      registered = false;
    },

    getRecord() {
      return { ...record };
    },
  };
}

module.exports = { CONFIG_DIR, createLifecycle };
