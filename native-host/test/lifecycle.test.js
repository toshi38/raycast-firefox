'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { afterEach, beforeEach, describe, test } = require('node:test');
const { createLifecycle } = require('../src/lifecycle');

const silentLogger = { info() {}, warn() {}, error() {} };

let dir;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'raycast-firefox-lifecycle-'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

/**
 * Fake process table for process.kill: `alive` is the set of live PIDs, and
 * `exitOn` maps a PID to the signal that makes it exit.
 */
function fakeKill({ alive = [], exitOn = {} } = {}) {
  const live = new Set(alive);
  const signals = [];
  const kill = (pid, signal) => {
    if (!live.has(pid)) {
      const err = new Error('kill ESRCH');
      err.code = 'ESRCH';
      throw err;
    }
    if (signal === 0) return true;
    signals.push([pid, signal]);
    if (exitOn[pid] === signal || signal === 'SIGKILL') live.delete(pid);
    return true;
  };
  return { kill, signals, live };
}

function lifecycleFor(firefoxPid, pid, extra = {}) {
  return createLifecycle({
    configDir: dir,
    pid,
    firefoxPid,
    version: '9.9.9',
    logger: silentLogger,
    killGraceMs: 0,
    ...extra,
  });
}

const readJSON = (file) => JSON.parse(fs.readFileSync(file, 'utf-8'));
const recordPath = (firefoxPid) => path.join(dir, 'hosts', `${firefoxPid}.json`);
const portPath = () => path.join(dir, 'port');

describe('register and publishPort', () => {
  test('writes a record named after the Firefox PID', () => {
    const lc = lifecycleFor(500, 1500);
    lc.register();
    assert.deepEqual(readJSON(recordPath(500)), {
      pid: 1500,
      firefoxPid: 500,
      port: null,
      profilePath: null,
      version: '9.9.9',
    });
  });

  test('adds the port to the record and writes the shared port file', () => {
    const lc = lifecycleFor(500, 1500);
    lc.register();
    lc.publishPort(26395);
    assert.equal(readJSON(recordPath(500)).port, 26395);
    assert.equal(fs.readFileSync(portPath(), 'utf-8'), '26395');
  });

  test('records the profile path, including when it arrives before register', () => {
    const lc = lifecycleFor(500, 1500);
    lc.setProfilePath('/profiles/early');
    assert.equal(fs.existsSync(recordPath(500)), false, 'nothing written before register');
    lc.register();
    assert.equal(readJSON(recordPath(500)).profilePath, '/profiles/early');
    lc.setProfilePath('/profiles/late');
    assert.equal(readJSON(recordPath(500)).profilePath, '/profiles/late');
  });

  test('two profiles get separate records', () => {
    const a = lifecycleFor(500, 1500);
    const b = lifecycleFor(600, 1600);
    a.register();
    b.register();
    a.publishPort(26394);
    b.publishPort(26395);
    assert.equal(readJSON(recordPath(500)).port, 26394);
    assert.equal(readJSON(recordPath(600)).port, 26395);
  });
});

describe('cleanup', () => {
  test("removes this host's record and the shared port file it wrote", () => {
    const lc = lifecycleFor(500, 1500);
    lc.register();
    lc.publishPort(26394);
    lc.cleanup();
    assert.equal(fs.existsSync(recordPath(500)), false);
    assert.equal(fs.existsSync(portPath()), false);
  });

  test("leaves another profile's record and port file alone", () => {
    const a = lifecycleFor(500, 1500);
    const b = lifecycleFor(600, 1600);
    a.register();
    a.publishPort(26394);
    b.register();
    b.publishPort(26395);

    a.cleanup();

    assert.equal(fs.existsSync(recordPath(500)), false);
    assert.equal(readJSON(recordPath(600)).port, 26395);
    assert.equal(fs.readFileSync(portPath(), 'utf-8'), '26395', 'shared port file still points at b');
  });

  test('hands the shared port file to another running host', () => {
    const { kill } = fakeKill({ alive: [1500, 1600] });
    const a = lifecycleFor(500, 1500, { kill });
    const b = lifecycleFor(600, 1600, { kill });
    b.register();
    b.publishPort(26395);
    a.register();
    a.publishPort(26394);

    a.cleanup();

    assert.equal(fs.readFileSync(portPath(), 'utf-8'), '26395');
  });

  test('does not hand the shared port file to a host that has exited', () => {
    const { kill } = fakeKill({ alive: [1500] });
    lifecycleFor(600, 1600, { kill }).register();
    fs.writeFileSync(recordPath(600), JSON.stringify({ pid: 1600, firefoxPid: 600, port: 26395 }));
    const a = lifecycleFor(500, 1500, { kill });
    a.register();
    a.publishPort(26394);

    a.cleanup();

    assert.equal(fs.existsSync(portPath()), false);
  });

  test('leaves a record that a newer host for the same Firefox has taken over', () => {
    const old = lifecycleFor(500, 1500);
    old.register();
    const replacement = lifecycleFor(500, 1501);
    replacement.register();

    old.cleanup();

    assert.equal(readJSON(recordPath(500)).pid, 1501);
  });
});

describe('killPreviousHosts', () => {
  test('stops a live previous host for the same Firefox', async () => {
    lifecycleFor(500, 1500).register();
    const { kill, signals } = fakeKill({ alive: [1500, 1501], exitOn: { 1500: 'SIGTERM' } });

    await lifecycleFor(500, 1501, { kill }).killPreviousHosts();

    assert.deepEqual(signals, [[1500, 'SIGTERM']]);
  });

  test('escalates to SIGKILL when the previous host ignores SIGTERM', async () => {
    lifecycleFor(500, 1500).register();
    const { kill, signals } = fakeKill({ alive: [1500, 1501] });

    await lifecycleFor(500, 1501, { kill }).killPreviousHosts();

    assert.deepEqual(signals, [[1500, 'SIGTERM'], [1500, 'SIGKILL']]);
  });

  test("never touches another profile's host", async () => {
    lifecycleFor(600, 1600).register();
    const { kill, signals } = fakeKill({ alive: [1600, 1501] });

    await lifecycleFor(500, 1501, { kill }).killPreviousHosts();

    assert.deepEqual(signals, []);
  });

  test('ignores a stale record whose host has exited', async () => {
    lifecycleFor(500, 1500).register();
    const { kill, signals } = fakeKill({ alive: [1501] });

    await lifecycleFor(500, 1501, { kill }).killPreviousHosts();

    assert.deepEqual(signals, []);
  });

  test('stops a host from a version that used the shared host.pid file, and removes the file', async () => {
    fs.writeFileSync(path.join(dir, 'host.pid'), '1400');
    const { kill, signals } = fakeKill({ alive: [1400, 1501], exitOn: { 1400: 'SIGTERM' } });

    await lifecycleFor(500, 1501, { kill }).killPreviousHosts();

    assert.deepEqual(signals, [[1400, 'SIGTERM']]);
    assert.equal(fs.existsSync(path.join(dir, 'host.pid')), false);
  });

  test('never kills itself', async () => {
    fs.writeFileSync(path.join(dir, 'host.pid'), '1501');
    const { kill, signals } = fakeKill({ alive: [1501] });

    await lifecycleFor(500, 1501, { kill }).killPreviousHosts();

    assert.deepEqual(signals, []);
  });

  test('copes with corrupt record and pid files', async () => {
    fs.mkdirSync(path.join(dir, 'hosts'));
    fs.writeFileSync(recordPath(500), '{not json');
    fs.writeFileSync(path.join(dir, 'host.pid'), 'garbage');
    const { kill, signals } = fakeKill({ alive: [1501] });

    await lifecycleFor(500, 1501, { kill }).killPreviousHosts();

    assert.deepEqual(signals, []);
  });
});
