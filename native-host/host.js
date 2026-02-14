'use strict';

// Logger MUST be initialized first -- before any other module or console usage.
const { logger, getLogDir } = require('./src/logger');

// Override console methods to prevent accidental stdout/stderr writes.
// stdout is reserved exclusively for the native messaging binary protocol.
console.log = (...args) => logger.info({ console: true }, args.join(' '));
console.error = (...args) => logger.error({ console: true }, args.join(' '));
console.warn = (...args) => logger.warn({ console: true }, args.join(' '));

const { createDecoder, encode } = require('./src/protocol');
const { version } = require('./package.json');
const lifecycle = require('./src/lifecycle');
const bridge = require('./src/bridge');
const { ensureServer } = require('./src/server');

// -- Native messaging output --

/**
 * Sends a message to the WebExtension via the native messaging protocol.
 * Writes a length-prefixed binary message to stdout.
 */
function sendNativeMessage(msg) {
  if (!bridge.isNativeConnected()) {
    logger.warn({ msg }, 'Cannot send native message: connection closed');
    return false;
  }
  const buf = encode(msg);
  process.stdout.write(buf);
  return true;
}

// -- Startup --

logger.info({ version, pid: process.pid, logDir: getLogDir() }, 'Native messaging host starting');

// Wire bridge to use our sendNativeMessage function
bridge.setSendNativeMessage(sendNativeMessage);
bridge.setNativeConnected(true);

// -- Lazy HTTP server --
// HTTP server does NOT start on host launch. It starts when the first native
// message arrives from Firefox, confirming the WebExtension connection is live.
let serverStarted = false;

logger.info('Waiting for Firefox connection before starting HTTP server');

// -- Stdin (native messaging) setup --

// CRITICAL: Do NOT call process.stdin.setEncoding() -- must stay in raw Buffer mode
const decoder = createDecoder(onMessage, logger);

process.stdin.on('data', decoder);

process.stdin.on('end', () => {
  bridge.setNativeConnected(false);
  lifecycle.cleanupPortFile();
  logger.info('Firefox disconnected (stdin EOF), removed port file');
  // Host stays alive but port file removal signals Raycast immediately
});

process.stdin.on('error', (err) => {
  bridge.setNativeConnected(false);
  lifecycle.cleanupPortFile();
  logger.error({ err: err.message }, 'Native messaging stdin error, removed port file');
  // Host stays alive but port file removal signals Raycast immediately
});

// -- Message handling --

function onMessage(msg) {
  logger.info({ id: msg.id, command: msg.command || msg.type }, 'Received native message');

  // Lazy server start: triggered on first native message from Firefox
  if (!serverStarted) {
    serverStarted = true;
    logger.info('First native message received, starting HTTP server');
    ensureServer().catch((err) => {
      logger.error({ err: err.message }, 'Failed to start HTTP server');
    });
  }

  bridge.handleNativeResponse(msg);
}

// -- Lifecycle management --

(async () => {
  try {
    await lifecycle.killOldProcess();
  } catch (err) {
    logger.error({ err: err.message }, 'Error killing old process');
  }

  lifecycle.writePidFile();

  // Send version handshake to WebExtension
  bridge.sendVersionHandshake();

  logger.info('Host ready, waiting for native connection');
})();

// -- Signal handlers --

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down');
  lifecycle.cleanupPidFile();
  lifecycle.cleanupPortFile();
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('Received SIGINT, shutting down');
  lifecycle.cleanupPidFile();
  lifecycle.cleanupPortFile();
  process.exit(0);
});

process.on('exit', () => {
  lifecycle.cleanupPidFile();
  lifecycle.cleanupPortFile();
});

process.on('uncaughtException', (err) => {
  logger.fatal({ err: err.message, stack: err.stack }, 'Uncaught exception');
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error({ reason: String(reason) }, 'Unhandled promise rejection');
});

// -- Exports for other modules --

module.exports = { sendNativeMessage };
