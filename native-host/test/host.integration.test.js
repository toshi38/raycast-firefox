'use strict';

// Runs the real host.js as Firefox would: a child process speaking native
// messaging on stdin/stdout. HOME points at a temporary directory so the
// host's records, logs and port file stay out of the real ~/.raycast-firefox.
// This test process plays Firefox, so the host's firefoxPid is process.pid.

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { afterEach, beforeEach, describe, test } = require('node:test');
const { createDecoder, encode } = require('../src/protocol');

const HOST = path.join(__dirname, '..', 'host.js');

let home;
let host;

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'raycast-firefox-home-'));
});

afterEach(async () => {
  if (host && host.exitCode === null && host.signalCode === null) {
    host.kill('SIGKILL');
    await new Promise((resolve) => host.once('exit', resolve));
  }
  fs.rmSync(home, { recursive: true, force: true });
});

const configDir = () => path.join(home, '.raycast-firefox');
const recordFile = () => path.join(configDir(), 'hosts', `${process.pid}.json`);

/**
 * Start host.js and answer its requests like the WebExtension: every command
 * gets `reply(message)` back, or is ignored if `reply` returns undefined.
 */
function startHost(reply = () => undefined) {
  host = spawn(process.execPath, [HOST], {
    env: { ...process.env, HOME: home },
    stdio: ['pipe', 'pipe', 'inherit'],
  });
  const received = [];
  host.stdout.on('data', createDecoder((msg) => {
    received.push(msg);
    const response = reply(msg);
    if (response !== undefined) host.stdin.write(encode(response));
  }));
  return received;
}

/** Poll until `check` returns a truthy value, or fail after `timeoutMs`. */
async function waitFor(check, what, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = check();
    if (value) return value;
    if (Date.now() > deadline) assert.fail(`Timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

/** Resolve with the exit code once `proc` exits, or fail after `timeoutMs`. */
function waitForExit(proc, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for the host to exit')), timeoutMs);
    proc.once('exit', (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
}

function readRecord() {
  try {
    return JSON.parse(fs.readFileSync(recordFile(), 'utf-8'));
  } catch (_) {
    return null;
  }
}

/** Send the WebExtension's handshake reply, which starts the HTTP server. */
async function connect(received) {
  const handshake = await waitFor(() => received.find((m) => m.type === 'handshake'), 'handshake');
  host.stdin.write(encode({ id: handshake.id, ok: true, data: { extensionVersion: 'test' } }));
  return waitFor(() => readRecord()?.port && readRecord(), 'record with a port');
}

describe('host.js', { timeout: 20000 }, () => {
  test('registers under the PID of the Firefox that launched it, then publishes its port', async () => {
    const received = startHost();

    const early = await waitFor(readRecord, 'record');
    assert.equal(early.pid, host.pid);
    assert.equal(early.firefoxPid, process.pid);

    const record = await connect(received);
    assert.equal(fs.readFileSync(path.join(configDir(), 'port'), 'utf-8'), String(record.port));

    const health = await (await fetch(`http://127.0.0.1:${record.port}/health`)).json();
    assert.equal(health.data.pid, host.pid);
    assert.equal(health.data.firefoxPid, process.pid);
  });

  test('relays HTTP requests to the extension and back', async () => {
    const received = startHost((msg) =>
      msg.command === 'list-tabs'
        ? { id: msg.id, ok: true, data: { tabs: [{ id: 7, title: 'Hello' }], total: 1, hasMore: false } }
        : undefined
    );
    const { port } = await connect(received);

    const tabs = await (await fetch(`http://127.0.0.1:${port}/tabs`)).json();

    assert.deepEqual(tabs.data.tabs, [{ id: 7, title: 'Hello' }]);
  });

  test('exits and removes its record and port file when Firefox disconnects', async () => {
    const received = startHost();
    await connect(received);
    const exited = waitForExit(host);

    host.stdin.end();

    assert.equal(await exited, 0);
    assert.equal(fs.existsSync(recordFile()), false);
    assert.equal(fs.existsSync(path.join(configDir(), 'port')), false);
  });

  test("leaves another profile's record alone when it exits", async () => {
    // Another live process (this test runner) stands in for a second host.
    const other = path.join(configDir(), 'hosts', '1.json');
    fs.mkdirSync(path.dirname(other), { recursive: true });
    fs.writeFileSync(other, JSON.stringify({ pid: process.pid, firefoxPid: 1, port: 26999 }));

    const received = startHost();
    await connect(received);
    const exited = waitForExit(host);
    host.stdin.end();
    await exited;

    assert.equal(JSON.parse(fs.readFileSync(other, 'utf-8')).port, 26999);
    assert.equal(fs.readFileSync(path.join(configDir(), 'port'), 'utf-8'), '26999', 'shared port file handed over');
  });

  test('replaces a previous host for the same Firefox', async () => {
    const firstReceived = startHost();
    await connect(firstReceived);
    const first = host;
    const firstExited = waitForExit(first);

    const secondReceived = startHost();
    await firstExited;
    const record = await connect(secondReceived);

    assert.equal(record.pid, host.pid);
    assert.notEqual(record.pid, first.pid);
  });
});
