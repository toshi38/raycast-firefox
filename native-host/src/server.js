'use strict';

const http = require('http');
const { URL } = require('url');
const { execFile } = require('child_process');
const { logger } = require('./logger');
const { sendRequest } = require('./bridge');
const { writePortFile } = require('./lifecycle');
const { handleHealth } = require('./health');

const BASE_PORT = 26394;
const MAX_PORT_ATTEMPTS = 10;

// -- Module state --
let server = null;
let currentPort = null;
let starting = false;
let startPromise = null;

/**
 * Ensure the HTTP server is running. Starts it if not already started.
 * Returns a promise that resolves with { server, port }.
 * Safe to call multiple times -- subsequent calls return the same promise.
 */
function ensureServer() {
  if (server) {
    return Promise.resolve({ server, port: currentPort });
  }
  if (starting) {
    return startPromise;
  }
  starting = true;
  startPromise = startServer(0).then((result) => {
    starting = false;
    return result;
  }).catch((err) => {
    starting = false;
    throw err;
  });
  return startPromise;
}

/**
 * Try to start the HTTP server on BASE_PORT + attempt.
 * Retries on EADDRINUSE up to MAX_PORT_ATTEMPTS.
 */
function startServer(attempt) {
  return new Promise((resolve, reject) => {
    if (attempt >= MAX_PORT_ATTEMPTS) {
      reject(new Error(`All ports ${BASE_PORT}-${BASE_PORT + MAX_PORT_ATTEMPTS - 1} are in use`));
      return;
    }

    const port = BASE_PORT + attempt;
    const srv = http.createServer(handleRequest);

    srv.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        logger.warn({ port }, 'Port in use, trying next');
        resolve(startServer(attempt + 1));
      } else {
        reject(err);
      }
    });

    srv.listen(port, '127.0.0.1', () => {
      server = srv;
      currentPort = port;
      writePortFile(port);
      logger.info({ port }, 'HTTP server listening');
      resolve({ server: srv, port });
    });
  });
}

// -- Request handling --

/**
 * Main HTTP request handler. Routes to endpoint handlers.
 */
async function handleRequest(req, res) {
  try {
    const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
    const { pathname } = parsedUrl;
    const method = req.method.toUpperCase();

    // Common headers
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');

    // CORS preflight
    if (method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.writeHead(204);
      res.end();
      return;
    }

    // Route
    if (pathname === '/health' && method === 'GET') {
      sendJSON(res, 200, handleHealth(currentPort));
    } else if (pathname === '/tabs' && method === 'GET') {
      await handleGetTabs(req, res);
    } else if (pathname === '/switch' && method === 'POST') {
      await handleSwitchTab(req, res);
    } else {
      sendJSON(res, 404, { ok: false, error: 'Not found' });
    }
  } catch (err) {
    logger.error({ err: err.message, stack: err.stack }, 'HTTP request error');
    sendJSON(res, 500, { ok: false, error: 'Internal server error. Check logs at ~/.raycast-firefox/logs/' });
  }
}

/**
 * GET /tabs - List all open Firefox tabs.
 */
async function handleGetTabs(req, res) {
  try {
    const data = await sendRequest('list-tabs', {});
    sendJSON(res, 200, {
      ok: true,
      data,
      meta: {
        count: data.tabs ? data.tabs.length : 0,
        timestamp: Date.now(),
      },
    });
  } catch (err) {
    sendJSON(res, 502, {
      ok: false,
      error: err.message,
      meta: { timestamp: Date.now() },
    });
  }
}

/**
 * POST /switch - Switch to a specific tab.
 */
async function handleSwitchTab(req, res) {
  let body;
  try {
    body = await parseBody(req);
  } catch (err) {
    sendJSON(res, 400, { ok: false, error: 'Invalid JSON body' });
    return;
  }

  if (!body.tabId && body.tabId !== 0) {
    sendJSON(res, 400, { ok: false, error: 'tabId is required' });
    return;
  }

  try {
    const data = await sendRequest('switch-tab', {
      tabId: body.tabId,
      windowId: body.windowId,
    });

    // Raise Firefox to foreground on macOS — only the focused window, not all windows.
    // NSApplicationActivateIgnoringOtherApps (2) without NSApplicationActivateAllWindows (1)
    // brings only the key/main window forward, matching alt-tab behavior.
    if (process.platform === 'darwin') {
      execFile('osascript', ['-l', 'JavaScript', '-e', `
        ObjC.import("AppKit");
        var apps = $.NSRunningApplication.runningApplicationsWithBundleIdentifier("org.mozilla.firefox");
        if (apps.count > 0) apps.objectAtIndex(0).activateWithOptions(2);
      `], (err) => {
        if (err) logger.warn({ err: err.message }, 'Failed to activate Firefox window');
      });
    }

    sendJSON(res, 200, {
      ok: true,
      data,
      meta: { timestamp: Date.now() },
    });
  } catch (err) {
    sendJSON(res, 502, {
      ok: false,
      error: err.message,
      meta: { timestamp: Date.now() },
    });
  }
}

/**
 * Parse the JSON body from an HTTP request.
 */
function parseBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
        resolve(body);
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

/**
 * Send a JSON response.
 */
function sendJSON(res, statusCode, body) {
  res.writeHead(statusCode);
  res.end(JSON.stringify(body));
}

module.exports = { ensureServer };
