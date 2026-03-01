'use strict';

const pino = require('pino');
const { rotateIfNeeded, LOG_DIR, LOG_FILE } = require('./log-rotation');

// Rotate logs before creating the pino destination
rotateIfNeeded();

const dest = pino.destination({
  dest: LOG_FILE,
  mkdir: true,
  sync: true,
});

const logger = pino(
  {
    level: 'info',
    formatters: {
      level: (label) => ({ level: label }),
    },
  },
  dest,
);

/**
 * Returns the log directory path (useful for error messages to users).
 */
function getLogDir() {
  return LOG_DIR;
}

module.exports = { logger, getLogDir };
