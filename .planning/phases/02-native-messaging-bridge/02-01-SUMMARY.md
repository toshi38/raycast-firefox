---
phase: 02-native-messaging-bridge
plan: 01
subsystem: native-messaging
tags: [nodejs, pino, pino-roll, native-messaging, binary-protocol, stdin, stdout]

# Dependency graph
requires:
  - phase: 01-firefox-webextension
    provides: Extension with native app name raycast_firefox and gecko ID raycast-firefox@lau.engineering
provides:
  - native-host project scaffold with pino/pino-roll dependencies
  - Shell wrapper (run.sh) for node binary resolution across install methods
  - Native messaging manifest template with correct app name and extension ID
  - Pino-based structured JSON logger writing to ~/.raycast-firefox/logs/ with rotation
  - Binary protocol encode/decode for Firefox native messaging (length-prefixed JSON)
  - host.js entry point with stdin reading, console override, and signal handling
affects: [02-02, 02-03, 03-raycast-extension]

# Tech tracking
tech-stack:
  added: [pino@9.14.0, pino-roll@1.3.0, pino-pretty@13 (dev)]
  patterns: [length-prefixed-binary-protocol, console-override-to-file-logger, shell-wrapper-node-resolution]

key-files:
  created:
    - native-host/package.json
    - native-host/host.js
    - native-host/run.sh
    - native-host/src/logger.js
    - native-host/src/protocol.js
    - native-host/manifest/raycast_firefox.json
  modified:
    - .gitignore

key-decisions:
  - "Pino-roll names log files as host.log.1, host.log.2, etc. (rotation naming convention)"
  - "Protocol decoder accepts optional logger parameter to avoid circular dependencies"
  - "host.js exports sendNativeMessage and isNativeConnected for use by bridge module"

patterns-established:
  - "Console override: console.log/error/warn redirect to pino file logger to protect stdout"
  - "Protocol module is dependency-free (no logger import) -- logger passed as parameter"
  - "Signal handlers log but do not exit -- lifecycle module in Plan 02 handles cleanup"
  - "stdin stays in raw Buffer mode (never call setEncoding)"

# Metrics
duration: 2min
completed: 2026-02-07
---

# Phase 02 Plan 01: Native Host Scaffold Summary

**Node.js native-host project with pino file logging, length-prefixed binary protocol encode/decode, and shell wrapper for Firefox-launched node resolution**

## Performance

- **Duration:** 2 min 17s
- **Started:** 2026-02-07T06:51:25Z
- **Completed:** 2026-02-07T06:53:42Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Native-host project scaffold with pino/pino-roll installed and shell wrapper for multi-path node resolution
- Binary protocol module handling encode/decode with partial reads, multi-message chunks, and 512KB size limit
- host.js entry point that overrides console methods, reads stdin in raw Buffer mode, and survives disconnect

## Task Commits

Each task was committed atomically:

1. **Task 1: Create native-host project scaffold with shell wrapper and manifest** - `87cbd5f` (feat)
2. **Task 2: Create logger module, protocol module, and host.js entry point** - `f987457` (feat)

## Files Created/Modified

- `native-host/package.json` - Node.js package with pino/pino-roll dependencies
- `native-host/package-lock.json` - Lockfile for reproducible installs
- `native-host/run.sh` - Shell wrapper probing PATH, nvm, homebrew for node binary
- `native-host/manifest/raycast_firefox.json` - Native messaging manifest template with placeholder path
- `native-host/src/logger.js` - Pino logger with pino-roll file rotation (5MB, daily, 5 files)
- `native-host/src/protocol.js` - Binary encode/decode for native messaging length-prefixed format
- `native-host/host.js` - Entry point: logging init, console override, stdin reading, signal handlers
- `.gitignore` - Added native-host/node_modules/

## Decisions Made

- Protocol decoder accepts logger as optional parameter (avoids circular dependency between host.js and protocol.js)
- host.js exports sendNativeMessage and isNativeConnected for bridge module consumption in Plan 02
- Signal handlers (SIGTERM/SIGINT) log but do not exit -- lifecycle module in Plan 02 will handle PID cleanup
- onMessage handler is a stub that logs received messages -- bridge module in Plan 02 handles routing

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Logger, protocol, and host.js are ready for Plan 02 (bridge module, HTTP server, lifecycle)
- Bridge module can require host.js to get sendNativeMessage/isNativeConnected
- Protocol module is tested for round-trip, partial reads, and multi-message chunks
- No blockers for Plan 02-02

## Self-Check: PASSED

---
*Phase: 02-native-messaging-bridge*
*Completed: 2026-02-07*
