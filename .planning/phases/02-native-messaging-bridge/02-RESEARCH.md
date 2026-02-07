# Phase 2: Native Messaging Bridge - Research

**Researched:** 2026-02-07
**Domain:** Node.js Native Messaging Host, localhost HTTP server, length-prefixed binary protocol over stdin/stdout
**Confidence:** HIGH

## Summary

Phase 2 delivers a Node.js process that serves two roles simultaneously: (1) a Native Messaging Host that Firefox launches and communicates with via length-prefixed JSON over stdin/stdout, and (2) a localhost HTTP server that Raycast calls. The host bridges these two interfaces, translating HTTP requests into native messages and returning responses.

The Firefox native messaging protocol is well-documented and straightforward: each message is a 4-byte unsigned 32-bit integer (native/little-endian on macOS) followed by UTF-8 JSON. The protocol is fully supported by Node.js Buffer APIs. The HTTP server can use Node.js built-in `http` module with no framework needed -- the API surface is tiny (2-3 routes). Logging must go to files (not stdout/stderr) because stdout is reserved for the native messaging protocol and stderr is redirected to Firefox's browser console.

The Phase 1 WebExtension is already built with native app name `raycast_firefox`, message format `{id, command, params}`, and response format `{id, ok, data}` / `{id, ok, error}`. The native messaging host manifest must be installed at `~/Library/Application Support/Mozilla/NativeMessagingHosts/raycast_firefox.json` pointing to the host executable.

**Primary recommendation:** Use Node.js built-in `http` module (no Express), `pino` + `pino-roll` for file-based log rotation, hand-roll the length-prefixed binary protocol (it is ~30 lines of code), and use `crypto.randomUUID()` for request IDs. Use a shell wrapper script to reliably locate the `node` binary.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### HTTP server design
- Port range strategy: try 26394 first, then 26395, 26396, etc. if occupied
- Port discovery via file: host writes current port to a known path (e.g., `~/.raycast-firefox/port`)
- Envelope response format: `{ok: true, data: [...], meta: {count, timestamp}}` (not bare arrays)
- 2-second timeout waiting for WebExtension response before returning error to caller

#### Process lifecycle
- HTTP server starts lazily on first HTTP request (not immediately on host launch)
- Host stays alive when native messaging connection drops (Firefox closes) -- returns errors to Raycast until Firefox reconnects
- Never auto-exits -- runs until killed manually or system restarts
- New instance kills old process via PID file (not port check, since port can shift), then starts fresh
- Raycast can surface "Firefox not running" with option to open Firefox (error handling in Phase 7)

#### Protocol handling
- Message size limit: 512KB (lower than Firefox's 1MB default) -- fail gracefully if exceeded
- Request ID correlation: each message gets a unique ID, response must include same ID -- allows concurrent requests
- Version handshake on connect: exchange version info, warn on mismatch but still work
- Malformed messages: log the error and forward an error response to Raycast so the user knows debugging is needed and where to find logs

#### Logging & diagnostics
- Log location: `~/.raycast-firefox/logs/`
- Default verbosity: errors + key events (startup, shutdown, connection changes) -- no per-request logging
- `/health` endpoint: returns host uptime, Firefox connection status, port, version
- Auto-rotate logs: keep last N files, cap size to prevent disk bloat

### Claude's Discretion
- Exact port range size (how many ports to try)
- Log rotation parameters (file count, max size)
- PID file location and locking mechanism
- Exact health endpoint response shape
- Request ID format (UUID, incrementing integer, etc.)

### Deferred Ideas (OUT OF SCOPE)
- Historical tabs: keep a cache of previously-seen tabs so Raycast can show/open them even when Firefox is disconnected -- future phase
- "Open Firefox" action from Raycast when Firefox is not running -- Phase 7 (Error Handling)
</user_constraints>

## Standard Stack

### Core

| Library/Tool | Version | Purpose | Why Standard |
|-------------|---------|---------|--------------|
| Node.js built-in `http` | (built-in) | Localhost HTTP server | Only 2-3 routes needed; Express/Fastify adds unnecessary weight. Built-in `http` is 4x faster than Express at medium concurrency. Zero dependencies. |
| Node.js built-in `crypto` | (built-in) | `crypto.randomUUID()` for request IDs | Available since Node.js 14.17.0. RFC 4122 v4 UUIDs. 4x faster than nanoid, 12x faster than uuid package. Zero dependencies. |
| Node.js built-in `fs` | (built-in) | PID file, port file management | Standard for file I/O. Use `fs.writeFileSync` for atomic-ish writes, `fs.mkdirSync` with `{recursive: true}` for directory creation. |
| `pino` | 9.x | Structured JSON logging | The fastest Node.js logger. Uses worker threads for file transports (no main-thread blocking). JSON output is parseable. |
| `pino-roll` | latest | Log file rotation | Official Pino transport for size-based and time-based rotation. Supports `limit.count` to cap retained files. Runs in worker thread. |

### Supporting

| Library/Tool | Version | Purpose | When to Use |
|-------------|---------|---------|-------------|
| `pino-pretty` | latest | Human-readable log output during development | Dev only -- pipe logs through `pino-pretty` for debugging. Not a runtime dependency. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|-----------|-----------|----------|
| Built-in `http` | Express | Adds ~2MB of dependencies for routing we don't need. Only 2-3 routes total. |
| Built-in `http` | Fastify | Better than Express but still overkill. Our JSON body parsing is trivial. |
| `pino` + `pino-roll` | `winston` | Winston is slower, larger, and has more complex API. Pino's worker-thread model is better for a long-running daemon. |
| `pino` + `pino-roll` | Custom `fs.appendFile` | Tempting for simplicity but you'd hand-roll rotation logic, handle race conditions, manage file handles. Not worth it. |
| Hand-rolled protocol | `web-ext-native-msg` | The `web-ext-native-msg` package (v8.0.14) handles encode/decode but is a large package with setup/manifest generation we don't need. The protocol is ~30 lines of code. |
| Hand-rolled protocol | `chrome-native-messaging` | Transform streams approach. Only 11 commits, no recent activity, Chrome-focused. Protocol is simple enough to own. |
| `crypto.randomUUID()` | `uuid` package | No need for external package; built-in is faster and zero-dependency. |

**Installation:**
```bash
npm install pino pino-roll
npm install --save-dev pino-pretty
```

## Architecture Patterns

### Recommended Project Structure
```
native-host/
├── package.json            # Node.js package manifest
├── host.js                 # Entry point (shebang script launched by Firefox)
├── run.sh                  # Shell wrapper to find node and exec host.js
├── src/
│   ├── protocol.js         # Length-prefixed binary encode/decode for stdin/stdout
│   ├── server.js           # HTTP server (lazy startup, routing, JSON responses)
│   ├── bridge.js           # Request-response correlation (HTTP <-> native message)
│   ├── lifecycle.js         # PID file, port file, process management
│   ├── logger.js           # Pino configuration with pino-roll transport
│   └── health.js           # /health endpoint handler
├── manifest/
│   └── raycast_firefox.json # Native messaging host manifest template
└── install.sh              # Script to install manifest to correct macOS path
```

### Pattern 1: Length-Prefixed Binary Protocol (stdin/stdout)

**What:** Read and write messages using Firefox's native messaging binary protocol.
**When to use:** All communication between Firefox and the native host.

```javascript
// Source: MDN Native Messaging docs + Node.js Buffer API
// Reading messages from stdin
const pendingData = [];
let pendingLength = 0;
let expectedLength = 0;

process.stdin.on('data', (chunk) => {
  pendingData.push(chunk);
  pendingLength += chunk.length;

  while (true) {
    // Need at least 4 bytes for the length prefix
    if (expectedLength === 0 && pendingLength >= 4) {
      const buf = Buffer.concat(pendingData);
      pendingData.length = 0;
      expectedLength = buf.readUInt32LE(0);

      // Check size limit (512KB)
      if (expectedLength > 512 * 1024) {
        logger.error({ size: expectedLength }, 'Message exceeds 512KB limit');
        // Reset state, skip this message
        expectedLength = 0;
        pendingLength = 0;
        continue;
      }

      const remaining = buf.slice(4);
      if (remaining.length > 0) {
        pendingData.push(remaining);
        pendingLength = remaining.length;
      } else {
        pendingLength = 0;
      }
    }

    // Have full message
    if (expectedLength > 0 && pendingLength >= expectedLength) {
      const buf = Buffer.concat(pendingData);
      pendingData.length = 0;
      const messageBytes = buf.slice(0, expectedLength);
      const remaining = buf.slice(expectedLength);

      expectedLength = 0;
      pendingLength = remaining.length;
      if (remaining.length > 0) {
        pendingData.push(remaining);
      }

      const message = JSON.parse(messageBytes.toString('utf-8'));
      handleNativeMessage(message);
    } else {
      break;
    }
  }
});

// Writing messages to stdout
function sendNativeMessage(message) {
  const json = JSON.stringify(message);
  const bytes = Buffer.from(json, 'utf-8');

  if (bytes.length > 1024 * 1024) {
    throw new Error(`Message too large: ${bytes.length} bytes (max 1MB)`);
  }

  const header = Buffer.alloc(4);
  header.writeUInt32LE(bytes.length, 0);
  process.stdout.write(header);
  process.stdout.write(bytes);
}
```

### Pattern 2: Request-Response Correlation via Pending Promise Map

**What:** Map HTTP requests to native messages using request IDs, resolve when response arrives.
**When to use:** Every HTTP request that needs data from the WebExtension.

```javascript
// Source: Standard pattern for request/response multiplexing
const pendingRequests = new Map(); // id -> { resolve, reject, timer }

function sendRequest(command, params = {}) {
  const id = crypto.randomUUID();

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingRequests.delete(id);
      reject(new Error('WebExtension response timeout (2s)'));
    }, 2000);

    pendingRequests.set(id, { resolve, reject, timer });
    sendNativeMessage({ id, command, params });
  });
}

function handleNativeMessage(message) {
  const { id } = message;
  const pending = pendingRequests.get(id);
  if (!pending) {
    logger.warn({ id }, 'Received response for unknown request ID');
    return;
  }

  clearTimeout(pending.timer);
  pendingRequests.delete(id);

  if (message.ok) {
    pending.resolve(message.data);
  } else {
    pending.reject(new Error(message.error));
  }
}
```

### Pattern 3: Lazy HTTP Server with Port Retry

**What:** Start HTTP server only when first needed, try sequential ports on EADDRINUSE.
**When to use:** HTTP server initialization.

```javascript
// Source: Node.js http/net documentation
const http = require('http');
const BASE_PORT = 26394;
const MAX_PORT_ATTEMPTS = 10;

function startServer(attempt = 0) {
  return new Promise((resolve, reject) => {
    if (attempt >= MAX_PORT_ATTEMPTS) {
      reject(new Error(`Could not bind to any port in range ${BASE_PORT}-${BASE_PORT + MAX_PORT_ATTEMPTS - 1}`));
      return;
    }

    const port = BASE_PORT + attempt;
    const server = http.createServer(handleRequest);

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        logger.warn({ port }, 'Port in use, trying next');
        resolve(startServer(attempt + 1));
      } else {
        reject(err);
      }
    });

    server.listen(port, '127.0.0.1', () => {
      logger.info({ port }, 'HTTP server listening');
      writePortFile(port);
      resolve({ server, port });
    });
  });
}
```

### Pattern 4: PID File with Stale Detection

**What:** Write PID file on startup, kill old process if PID file exists, detect stale PIDs.
**When to use:** Process lifecycle management.

```javascript
// Source: Node.js process API docs
const PID_FILE = path.join(os.homedir(), '.raycast-firefox', 'host.pid');

function killOldProcess() {
  try {
    const oldPid = parseInt(fs.readFileSync(PID_FILE, 'utf-8').trim(), 10);
    if (isNaN(oldPid)) return;

    // Signal 0 tests if process exists without killing it
    try {
      process.kill(oldPid, 0);
      // Process exists -- kill it
      logger.info({ pid: oldPid }, 'Killing old host process');
      process.kill(oldPid, 'SIGTERM');
      // Brief wait for graceful shutdown
    } catch (err) {
      if (err.code === 'ESRCH') {
        // Process doesn't exist -- stale PID file
        logger.info({ pid: oldPid }, 'Stale PID file, old process already gone');
      }
    }
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    // No PID file exists -- first run
  }
}

function writePidFile() {
  fs.mkdirSync(path.dirname(PID_FILE), { recursive: true });
  fs.writeFileSync(PID_FILE, String(process.pid));
}

function cleanupPidFile() {
  try { fs.unlinkSync(PID_FILE); } catch {}
}

// Register cleanup
process.on('SIGTERM', () => { cleanupPidFile(); process.exit(0); });
process.on('SIGINT', () => { cleanupPidFile(); process.exit(0); });
process.on('exit', () => { cleanupPidFile(); });
```

### Pattern 5: Shell Wrapper for Node.js Path Resolution

**What:** A shell script that locates the `node` binary and executes the host.
**When to use:** The native messaging manifest `path` field points to this wrapper, not directly to the .js file.

```bash
#!/bin/bash
# run.sh - Wrapper to find node and launch the native messaging host
DIR="$(cd "$(dirname "$0")" && pwd)"

# Try common node locations
if command -v node >/dev/null 2>&1; then
  exec node "$DIR/host.js" "$@"
elif [ -x "$HOME/.nvm/current/bin/node" ]; then
  exec "$HOME/.nvm/current/bin/node" "$DIR/host.js" "$@"
elif [ -x "/usr/local/bin/node" ]; then
  exec /usr/local/bin/node "$DIR/host.js" "$@"
elif [ -x "/opt/homebrew/bin/node" ]; then
  exec /opt/homebrew/bin/node "$DIR/host.js" "$@"
else
  echo "ERROR: node not found" >&2
  exit 1
fi
```

### Anti-Patterns to Avoid

- **Writing anything to stdout besides protocol messages:** stdout is exclusively for the native messaging binary protocol. Any `console.log()` call will corrupt the message stream and crash the connection. ALL logging must go to files.
- **Writing to stderr for logging:** stderr is redirected to Firefox's browser console. While technically usable for debugging, it is noisy and unreliable for structured logging. Use file-based logging via pino.
- **Using `console.log`/`console.error` anywhere:** Both write to stdout/stderr which conflict with the native messaging protocol. Override or disable console methods.
- **Setting encoding on stdin:** Do NOT call `process.stdin.setEncoding()` -- this converts Buffers to strings, breaking binary protocol parsing. Keep stdin in raw Buffer mode.
- **Using `sendNativeMessage` (one-shot) instead of `connectNative` (persistent):** One-shot launches a new process per message. The extension already uses `connectNative` for a persistent port. The host must stay alive and continue reading stdin.
- **Auto-exiting when Firefox disconnects:** The host must survive Firefox closing. Firefox signals disconnect by closing stdin (EOF). The host should detect this, mark the connection as down, and continue serving HTTP requests with appropriate error responses.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Log rotation | Custom file rotation logic | `pino-roll` | File rotation has race conditions, size tracking, cleanup timing, and cross-process concerns. pino-roll handles all of this in a worker thread. |
| UUID generation | Custom ID scheme or counter | `crypto.randomUUID()` | Built-in, RFC-compliant, fast. Counter-based IDs can collide across process restarts. |
| JSON logging format | Custom log formatting | `pino` | Structured JSON logging with levels, timestamps, child loggers, serializers. Reinventing this is wasteful. |

**Key insight:** The native messaging binary protocol itself IS simple enough to hand-roll (~30 lines). But logging infrastructure is not -- file I/O, rotation, and structured formatting have too many edge cases.

## Common Pitfalls

### Pitfall 1: stdout Corruption
**What goes wrong:** Any write to stdout that is not a properly length-prefixed native message will corrupt the protocol stream. Firefox will fail to parse the next message and may disconnect the native port.
**Why it happens:** Developers use `console.log()` for debugging, or a library writes to stdout.
**How to avoid:** Override `console.log` and `console.error` to redirect to pino file logger. Never use `process.stdout.write()` except in the protocol encoder. Audit all dependencies for stdout writes.
**Warning signs:** "Error decoding native message" in Firefox browser console. Native port disconnects unexpectedly.

### Pitfall 2: stdin EOF Mishandling
**What goes wrong:** When Firefox disconnects (closes the native port, closes Firefox, or crashes), stdin emits an 'end' or 'close' event. If the host exits on stdin close, it violates the "never auto-exit" requirement.
**Why it happens:** Default behavior for many stdin-reading programs is to exit on EOF.
**How to avoid:** Handle the 'end'/'close' event on stdin by marking the native connection as disconnected, NOT by calling `process.exit()`. Continue serving HTTP requests with error responses.
**Warning signs:** Host process disappearing when Firefox restarts.

### Pitfall 3: Partial Buffer Reads
**What goes wrong:** The 'data' event on stdin does NOT guarantee message-aligned chunks. A single message may arrive across multiple 'data' events, or multiple messages may arrive in one chunk.
**Why it happens:** Node.js streams deliver data in arbitrary-sized chunks depending on OS buffering.
**How to avoid:** Accumulate incoming data in a buffer. Parse the 4-byte length prefix, then wait until the full message body has been accumulated before parsing JSON.
**Warning signs:** JSON parse errors. "Unexpected end of JSON input." Missing messages.

### Pitfall 4: Node.js Memory Growth
**What goes wrong:** Long-running native messaging hosts in Node.js can see RSS grow over time due to V8 heap growth from rapid object creation/destruction.
**Why it happens:** V8 grows the JS heap when the program creates a lot of garbage (per Node.js issue #43654).
**How to avoid:** Use `on('data')` with careful buffer management. Avoid creating unnecessary intermediate objects. Set `--max-old-space-size` if memory becomes a concern. Monitor with `/health` endpoint.
**Warning signs:** RSS growing continuously without plateau.

### Pitfall 5: Node.js Binary Not Found
**What goes wrong:** Firefox launches the native messaging host, but the `node` binary is not in PATH. The host fails to start silently.
**Why it happens:** When Firefox launches the native messaging host, it does NOT inherit the user's shell PATH. Tools like nvm, fnm, or Homebrew may install node in non-standard locations that are only added to PATH by shell profile scripts.
**How to avoid:** Use a shell wrapper script (`run.sh`) that probes common node installation paths. The native messaging manifest points to the wrapper, not directly to the .js file.
**Warning signs:** Extension shows "disconnected" permanently. No log files created. Firefox browser console shows "Error creating native messaging host process."

### Pitfall 6: Port File Race Condition
**What goes wrong:** Raycast reads the port file while the host is in the middle of writing it, getting a partial or empty read.
**Why it happens:** `fs.writeFileSync` is not truly atomic on most filesystems.
**How to avoid:** Write to a temporary file in the same directory, then rename (which IS atomic on POSIX). Or write port + newline and have readers verify the content is a valid integer.
**Warning signs:** Raycast connecting to wrong port or getting ECONNREFUSED intermittently.

### Pitfall 7: PID File Pointing to Wrong Process
**What goes wrong:** A stale PID file contains a PID that has been reused by the OS for a different process. Killing it terminates an unrelated process.
**Why it happens:** PIDs are recycled by the OS. If the old host crashed without cleanup, the PID file persists.
**How to avoid:** After reading the PID file, verify the process is actually a node process (or check process start time). Alternatively, accept the small risk since PID reuse across short timeframes is rare on macOS.
**Warning signs:** Random processes dying when the native host starts.

## Code Examples

### Native Messaging Host Manifest (macOS)

```json
// File: ~/Library/Application Support/Mozilla/NativeMessagingHosts/raycast_firefox.json
// Source: MDN Native Manifests documentation
{
  "name": "raycast_firefox",
  "description": "Raycast Firefox tab management bridge",
  "path": "/absolute/path/to/native-host/run.sh",
  "type": "stdio",
  "allowed_extensions": ["raycast-firefox@lau.engineering"]
}
```

**Critical details:**
- `name` must match `NATIVE_APP_NAME` in background.js (`raycast_firefox`)
- `path` must be absolute on macOS
- `allowed_extensions` must include the extension ID from manifest.json
- File location on macOS: `~/Library/Application Support/Mozilla/NativeMessagingHosts/raycast_firefox.json`

### Minimal HTTP Router (No Framework)

```javascript
// Source: Node.js http module documentation
const http = require('http');
const { URL } = require('url');

function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;
  const method = req.method;

  // CORS headers for localhost
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (method === 'GET' && pathname === '/health') {
    return handleHealth(req, res);
  }

  if (method === 'GET' && pathname === '/tabs') {
    return handleGetTabs(req, res);
  }

  if (method === 'POST' && pathname === '/switch') {
    return handleSwitchTab(req, res);
  }

  sendResponse(res, 404, { ok: false, error: 'Not found' });
}

function sendResponse(res, statusCode, body) {
  res.writeHead(statusCode);
  res.end(JSON.stringify(body));
}

// Parse JSON body from POST request
function parseBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
        resolve(body);
      } catch (err) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}
```

### Pino Logger Configuration with File Rotation

```javascript
// Source: Context7 - pinojs/pino, mcollina/pino-roll
const pino = require('pino');
const path = require('path');
const os = require('os');

const LOG_DIR = path.join(os.homedir(), '.raycast-firefox', 'logs');

const transport = pino.transport({
  target: 'pino-roll',
  options: {
    file: path.join(LOG_DIR, 'host.log'),
    size: '5m',              // Rotate at 5MB
    frequency: 'daily',     // Also rotate daily
    mkdir: true,             // Create directory if missing
    limit: {
      count: 5,             // Keep 5 rotated files
    },
  },
});

const logger = pino({
  level: 'info',  // errors + key events, no debug/trace
  formatters: {
    level: (label) => ({ level: label }),
  },
}, transport);

// Override console to prevent accidental stdout writes
console.log = (...args) => logger.info({ console: true }, args.join(' '));
console.error = (...args) => logger.error({ console: true }, args.join(' '));
console.warn = (...args) => logger.warn({ console: true }, args.join(' '));
```

### Health Endpoint Response

```javascript
// Recommended health endpoint shape
function handleHealth(req, res) {
  const health = {
    ok: true,
    data: {
      uptime: process.uptime(),
      firefoxConnected: isNativePortConnected(),
      port: currentPort,
      version: require('./package.json').version,
      pid: process.pid,
      memoryMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
    },
    meta: {
      timestamp: Date.now(),
    },
  };
  sendResponse(res, 200, health);
}
```

### Version Handshake

```javascript
// Sent to WebExtension immediately after native port connects (stdin starts)
function sendVersionHandshake() {
  sendNativeMessage({
    id: crypto.randomUUID(),
    type: 'handshake',
    version: require('./package.json').version,
    protocol: 1,
  });
}
```

## Discretionary Recommendations

For areas marked "Claude's Discretion" in CONTEXT.md:

### Port range size: 10 ports (26394-26403)
**Rationale:** 10 ports is generous for a single-user desktop app. Port conflicts are unlikely (26394 is not a well-known port). If 10 ports are all occupied, something is seriously wrong.

### Log rotation: 5 files, 5MB each (25MB max)
**Rationale:** 5MB per file is enough for days of error-level + key-event logging. 5 files = ~25MB max disk usage. For a desktop app, this is minimal. Daily rotation plus size-based rotation ensures no single file grows unbounded.

### PID file: `~/.raycast-firefox/host.pid`
**Rationale:** Same directory as port file, keeping all runtime state together. Use signal 0 (`process.kill(pid, 0)`) for stale detection. Write PID file with `fs.writeFileSync`. Clean up on SIGTERM/SIGINT/exit.

### Health endpoint response shape: shown in Code Examples above
**Rationale:** Follows the same `{ok, data, meta}` envelope as all other endpoints. Includes uptime, connection status, port, version, PID, and memory -- enough for debugging without being excessive.

### Request ID format: `crypto.randomUUID()` (UUID v4)
**Rationale:** Built-in, no dependencies. Unique across process restarts (unlike incrementing integers). Human-readable in logs. The WebExtension already echoes back whatever `id` it receives, so format is flexible.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `web-ext-native-msg` for protocol handling | Hand-roll 30 lines of Buffer code | Always viable | Avoids pulling in a large package (v8.0.14 includes manifest setup utilities we don't need) |
| `uuid` npm package | `crypto.randomUUID()` | Node.js 14.17.0 (2021) | Zero-dependency UUID generation, 4x faster |
| Winston for logging | Pino with worker-thread transports | Pino 7+ (2021) | 5x faster logging, non-blocking file I/O via worker threads |
| Express for HTTP routing | Built-in `http` module | Always viable for tiny APIs | Zero dependencies, 4x throughput, trivial API surface |

**Deprecated/outdated:**
- `chrome-native-messaging` npm: Only 11 commits, Chrome-focused, no recent activity. Works but unmaintained.
- `@vrbo/pino-rotating-file`: Deprecated in favor of `pino-roll`.

## Integration with Phase 1

### Extension Message Protocol (already built)

The Phase 1 WebExtension (`extension/background.js`) uses:
- **Native app name:** `raycast_firefox`
- **Inbound message format:** `{ id: string, command: string, params?: object }`
- **Outbound success:** `{ id: string, ok: true, data: object }`
- **Outbound error:** `{ id: string, ok: false, error: string }`
- **Commands:** `list-tabs`, `switch-tab`, `close-tab`
- **Connection:** `browser.runtime.connectNative("raycast_firefox")` -- persistent port

### Native Messaging Manifest

Must be installed at:
```
~/Library/Application Support/Mozilla/NativeMessagingHosts/raycast_firefox.json
```

### Extension ID

`raycast-firefox@lau.engineering` (from `extension/manifest.json` `browser_specific_settings.gecko.id`)

## Open Questions

1. **Version handshake direction**
   - What we know: The context specifies a version handshake on connect with warn-on-mismatch behavior.
   - What's unclear: Should the host send a handshake message to the extension, or should the extension initiate it? The current extension code (Phase 1) does not implement a handshake handler.
   - Recommendation: The native host should send a `handshake` message to the extension on stdin connect. Phase 1 may need a small update to handle `type: 'handshake'` messages (or this can be added as part of Phase 2 with a minor extension update).

2. **Graceful shutdown timing**
   - What we know: New instance kills old process via PID file with SIGTERM.
   - What's unclear: How long to wait for the old process to die before starting the new one. If the old process has pending HTTP requests, should we wait for them to complete?
   - Recommendation: Send SIGTERM, wait 1 second, check if dead, send SIGKILL if not. Pending requests will fail -- acceptable for a desktop tool.

3. **Install script scope**
   - What we know: The native messaging manifest must be installed at a specific macOS path.
   - What's unclear: Should the install script be run manually, or integrated into npm postinstall?
   - Recommendation: Provide a standalone `install.sh` script that creates the manifest with the correct absolute path. Manual execution is fine for v1. Can be automated in the Raycast extension setup flow (Phase 3+).

## Sources

### Primary (HIGH confidence)
- MDN Native Messaging documentation: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Native_messaging -- Protocol specification, manifest format, host lifecycle, message size limits
- MDN Native Manifests documentation: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Native_manifests -- macOS manifest location, required fields
- Context7 `/pinojs/pino` -- File transport, pino.destination, transport configuration
- Context7 `/mcollina/pino-roll` -- Size/frequency rotation, limit.count, full production configuration
- Node.js Buffer API documentation: https://nodejs.org/api/buffer.html -- readUInt32LE, writeUInt32LE
- Node.js HTTP module documentation: https://nodejs.org/api/http.html -- createServer, listen, error handling
- Node.js Process API documentation: https://nodejs.org/api/process.html -- kill, pid, stdin, signals
- Phase 1 source code: `extension/background.js`, `extension/manifest.json` -- Message format, native app name, extension ID

### Secondary (MEDIUM confidence)
- GitHub guest271314/native-messaging-nodejs: https://github.com/guest271314/native-messaging-nodejs -- Node.js native messaging implementation reference
- GitHub asamuzaK/webExtNativeMsg (web-ext-native-msg): https://github.com/asamuzaK/webExtNativeMsg -- v8.0.14 encode/decode API, actively maintained
- SigNoz Pino Logger Guide: https://signoz.io/guides/pino-logger/ -- Pino setup patterns, transport configuration
- Node.js issue #43654: https://github.com/nodejs/node/issues/43654 -- Native messaging host RSS memory growth (resolved)

### Tertiary (LOW confidence)
- GitHub andy-portmen/native-client: https://github.com/andy-portmen/native-client -- Shell wrapper approach for node path resolution. Useful pattern but old codebase.
- WebSearch results on `#!/usr/bin/env node` for native messaging -- Multiple sources suggest explicit node path is more reliable than env shebang when browser launches the process.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- All recommended libraries (pino, pino-roll) verified via Context7 with current documentation. Built-in Node.js APIs verified against official docs.
- Architecture: HIGH -- Native messaging protocol fully documented by MDN. Request-response correlation is a standard pattern. HTTP server design is trivial.
- Pitfalls: HIGH -- Multiple verified sources confirm stdout/stderr conflicts, stdin EOF handling, partial buffer reads, and node path resolution issues. Memory issue documented in Node.js issue tracker.
- Integration: HIGH -- Phase 1 source code directly inspected. Message format, native app name, and extension ID confirmed from actual code.

**Research date:** 2026-02-07
**Valid until:** 2026-03-09 (30 days -- stable domain, no fast-moving dependencies)
