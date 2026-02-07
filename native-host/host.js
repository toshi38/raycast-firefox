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

// -- Native connection state --

let nativeConnected = true; // true until stdin ends

/**
 * Returns whether the native messaging connection (stdin) is still open.
 */
function isNativeConnected() {
  return nativeConnected;
}

/**
 * Sends a message to the WebExtension via the native messaging protocol.
 * Writes a length-prefixed binary message to stdout.
 */
function sendNativeMessage(msg) {
  if (!nativeConnected) {
    logger.warn({ msg }, 'Cannot send native message: connection closed');
    return false;
  }
  const buf = encode(msg);
  process.stdout.write(buf);
  return true;
}

// -- Stdin (native messaging) setup --

logger.info({ version, pid: process.pid, logDir: getLogDir() }, 'Native messaging host starting');

// CRITICAL: Do NOT call process.stdin.setEncoding() -- must stay in raw Buffer mode
const decoder = createDecoder(onMessage, logger);

process.stdin.on('data', decoder);

process.stdin.on('end', () => {
  nativeConnected = false;
  logger.info('Native messaging connection closed (stdin EOF)');
  // Do NOT exit -- host stays alive for HTTP requests
});

process.stdin.on('error', (err) => {
  nativeConnected = false;
  logger.error({ err: err.message }, 'Native messaging stdin error');
  // Do NOT exit -- host stays alive for HTTP requests
});

// -- Message handling --

function onMessage(msg) {
  logger.info({ id: msg.id, command: msg.command || msg.type }, 'Received native message');
  // Bridge module (Plan 02) will handle routing.
  // For now, just log received messages.
}

// -- Signal handlers --

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM');
  // Lifecycle module (Plan 02) handles PID cleanup and graceful shutdown.
  // For now, just log.
});

process.on('SIGINT', () => {
  logger.info('Received SIGINT');
  // Lifecycle module (Plan 02) handles PID cleanup and graceful shutdown.
  // For now, just log.
});

process.on('uncaughtException', (err) => {
  logger.fatal({ err: err.message, stack: err.stack }, 'Uncaught exception');
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error({ reason: String(reason) }, 'Unhandled promise rejection');
});

logger.info('Host ready, waiting for native connection');

// -- Exports for other modules --

module.exports = { sendNativeMessage, isNativeConnected };
