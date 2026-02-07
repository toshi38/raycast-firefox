---
phase: 02-native-messaging-bridge
plan: 02
subsystem: native-messaging
tags: [nodejs, http, lifecycle, pid, bridge, request-response, uuid, install]

# Dependency graph
requires:
  - phase: 02-native-messaging-bridge
    plan: 01
    provides: host.js entry point, protocol encode/decode, pino logger, run.sh wrapper
provides:
  - PID file management with old-process killing under ~/.raycast-firefox/
  - Request-response bridge correlating HTTP requests to native messages via UUID
  - Lazy HTTP server on ports 26394-26403 with /health, /tabs, /switch endpoints
  - Envelope response format {ok, data, meta} on all endpoints
  - Version handshake sent to WebExtension on native connection
  - install.sh for macOS Firefox NativeMessagingHosts manifest
affects: [02-03, 03-raycast-extension]

# Tech tracking
tech-stack:
  added: []
  patterns: [lazy-server-startup, request-response-correlation, pid-file-lifecycle, atomic-file-write, port-retry]

key-files:
  created:
    - native-host/src/lifecycle.js
    - native-host/src/bridge.js
    - native-host/src/server.js
    - native-host/src/health.js
    - native-host/install.sh
  modified:
    - native-host/host.js

key-decisions:
  - "HTTP server starts lazily on first native message, not on host launch"
  - "Bridge uses crypto.randomUUID() for request IDs"
  - "Port file written atomically via temp file + rename"
  - "Host survives stdin EOF and continues serving HTTP requests"
  - "Version handshake sent immediately on startup"

patterns-established:
  - "Lazy HTTP server: started on first native message from Firefox, not on host launch"
  - "Request-response correlation: UUID-keyed pending promise map with 2s timeout"
  - "PID lifecycle: kill old process, write new PID, cleanup on exit"
  - "Atomic port file: write temp then rename (POSIX atomic)"
  - "Envelope format: all HTTP responses use {ok, data, meta} shape"

# Metrics
duration: 3min
completed: 2026-02-07
---

# Phase 02 Plan 02: Native Host Bridge and HTTP Server Summary

**Complete native messaging host with PID lifecycle, request-response bridge, lazy HTTP server on ports 26394-26403, /tabs + /switch + /health endpoints, version handshake, and macOS install script**

## Performance

- **Duration:** 3 min 19s
- **Started:** 2026-02-07T06:57:49Z
- **Completed:** 2026-02-07T07:01:08Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Lifecycle module managing PID and port files under ~/.raycast-firefox/ with atomic writes and old-process killing via SIGTERM/SIGKILL
- Request-response bridge correlating HTTP requests to native messages via UUID request IDs with 2-second timeout
- Lazy HTTP server starting only on first native message from Firefox, binding to 127.0.0.1 on ports 26394-26403 with sequential port retry
- Three endpoints: GET /health (uptime, connection status, memory), GET /tabs (proxied to WebExtension), POST /switch (tab switching with tabId validation)
- install.sh that writes native messaging manifest to ~/Library/Application Support/Mozilla/NativeMessagingHosts/ with correct absolute path

## Task Commits

Each task was committed atomically:

1. **Task 1: Create lifecycle management and request-response bridge** - `9940144` (feat)
2. **Task 2: Create HTTP server with endpoints, wire host.js, and add install script** - `be5dffe` (feat)

## Files Created/Modified

- `native-host/src/lifecycle.js` - PID/port file management: killOldProcess, writePidFile, cleanupPidFile, writePortFile (atomic), cleanupPortFile
- `native-host/src/bridge.js` - Request-response correlation via UUID pending promise map with 2s timeout, version handshake
- `native-host/src/server.js` - Lazy HTTP server on ports 26394-26403 with /health, /tabs, /switch routes and CORS support
- `native-host/src/health.js` - Health endpoint handler returning uptime, firefoxConnected, port, version, pid, memoryMB
- `native-host/host.js` - Rewired to integrate lifecycle, bridge, and lazy server startup on first native message
- `native-host/install.sh` - macOS install script writing native messaging manifest with absolute path to run.sh

## Decisions Made

- HTTP server starts lazily on first native message from Firefox, not on host launch (clean signal to Raycast that host is ready)
- Bridge uses crypto.randomUUID() for request IDs (built-in, no dependency needed)
- Port file written atomically via temp file + rename (POSIX atomic rename)
- Host survives stdin EOF and continues serving HTTP requests with appropriate error messages
- Version handshake sent immediately on startup via bridge.sendVersionHandshake()
- CORS headers set on all responses for potential browser-based debugging

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

Run `bash native-host/install.sh` to register the native messaging manifest with Firefox on macOS.

## Next Phase Readiness

- All native host modules are complete and wired together
- Ready for Plan 02-03 (integration tests or remaining tasks)
- Raycast extension (Phase 03) can now target http://127.0.0.1:26394 for tab operations
- No blockers

## Self-Check: PASSED
