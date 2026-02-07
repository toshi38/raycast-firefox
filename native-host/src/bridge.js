'use strict';

const crypto = require('crypto');
const { logger } = require('./logger');

// -- Pending request-response correlation map --
// Key: request ID (UUID), Value: { resolve, reject, timer }
const pendingRequests = new Map();

// -- Module state set by host.js --
let sendNativeMessageFn = null;
let nativeConnected = false;

/**
 * Set the function used to send native messages to the WebExtension.
 * Called by host.js after it defines sendNativeMessage.
 */
function setSendNativeMessage(fn) {
  sendNativeMessageFn = fn;
}

/**
 * Update the native connection status.
 * Called by host.js on stdin connect/disconnect.
 */
function setNativeConnected(connected) {
  nativeConnected = connected;
}

/**
 * Returns whether the native messaging connection is active.
 */
function isNativeConnected() {
  return nativeConnected;
}

/**
 * Send a command to the WebExtension and return a promise that resolves
 * when the response arrives (correlated by request ID).
 *
 * Rejects after 2 seconds if no response is received.
 *
 * @param {string} command - Command name (e.g. 'list-tabs', 'switch-tab')
 * @param {object} params - Command parameters
 * @returns {Promise<any>} Response data from the WebExtension
 */
function sendRequest(command, params = {}) {
  return new Promise((resolve, reject) => {
    if (!nativeConnected) {
      reject(new Error('Firefox is not connected. Is the Raycast Firefox extension installed and Firefox running?'));
      return;
    }

    const id = crypto.randomUUID();

    const timer = setTimeout(() => {
      pendingRequests.delete(id);
      reject(new Error('WebExtension response timeout (2s)'));
    }, 2000);

    pendingRequests.set(id, { resolve, reject, timer });

    sendNativeMessageFn({ id, command, params });
  });
}

/**
 * Handle an incoming native message from the WebExtension.
 * Resolves or rejects the corresponding pending request.
 *
 * @param {object} message - Message from the WebExtension
 */
function handleNativeResponse(message) {
  const { id } = message;

  // Handshake responses are informational, not request-response
  if (message.type === 'handshake') {
    logger.info({ message }, 'Received handshake response from WebExtension');
    return;
  }

  const pending = pendingRequests.get(id);
  if (!pending) {
    logger.warn({ id, message }, 'Response for unknown request ID');
    return;
  }

  clearTimeout(pending.timer);
  pendingRequests.delete(id);

  if (message.ok) {
    pending.resolve(message.data);
  } else {
    pending.reject(new Error(message.error || 'Unknown error from WebExtension'));
  }
}

/**
 * Send a version handshake message to the WebExtension on initial connect.
 */
function sendVersionHandshake() {
  if (!sendNativeMessageFn) {
    return;
  }
  const { version } = require('../package.json');
  sendNativeMessageFn({
    id: crypto.randomUUID(),
    type: 'handshake',
    version,
    protocol: 1,
  });
  logger.info({ version }, 'Version handshake sent');
}

module.exports = {
  setSendNativeMessage,
  setNativeConnected,
  isNativeConnected,
  sendRequest,
  handleNativeResponse,
  sendVersionHandshake,
};
