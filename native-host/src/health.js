'use strict';

const { isNativeConnected } = require('./bridge');
const { version } = require('../package.json');

/**
 * Build the health response object.
 * Does NOT write an HTTP response -- caller handles that.
 *
 * @param {number} currentPort - The port the HTTP server is listening on
 * @returns {object} Envelope-format health response
 */
function handleHealth(currentPort) {
  return {
    ok: true,
    data: {
      uptime: process.uptime(),
      firefoxConnected: isNativeConnected(),
      port: currentPort,
      version,
      pid: process.pid,
      memoryMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
    },
    meta: {
      timestamp: Date.now(),
    },
  };
}

module.exports = { handleHealth };
