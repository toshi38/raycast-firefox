'use strict';

const pino = require('pino');
const path = require('path');
const os = require('os');

const LOG_DIR = path.join(os.homedir(), '.raycast-firefox', 'logs');

const transport = pino.transport({
  target: 'pino-roll',
  options: {
    file: path.join(LOG_DIR, 'host.log'),
    size: '5m',
    frequency: 'daily',
    mkdir: true,
    limit: {
      count: 5,
    },
  },
});

const logger = pino(
  {
    level: 'info',
    formatters: {
      level: (label) => ({ level: label }),
    },
  },
  transport,
);

/**
 * Returns the log directory path (useful for error messages to users).
 */
function getLogDir() {
  return LOG_DIR;
}

module.exports = { logger, getLogDir };
