---
phase: 09-native-host-bundling
plan: 01
subsystem: infra
tags: [esbuild, pino, bundling, logging, cjs]

# Dependency graph
requires:
  - phase: none
    provides: existing native-host with pino-roll logging
provides:
  - Single-file native host bundle via esbuild (dist/host.bundle.js)
  - Sync pino.destination logging (no worker threads)
  - Startup-time log rotation (5MB threshold, 5 rotated files)
  - npm run build command producing distributable bundle
affects: [10-installer-setup-command, 11-ci-cd-pipeline, 12-amo-submission]

# Tech tracking
tech-stack:
  added: [esbuild]
  patterns: [sync-pino-destination, startup-log-rotation, esbuild-cjs-bundle]

key-files:
  created:
    - native-host/src/log-rotation.js
    - native-host/esbuild.config.js
  modified:
    - native-host/src/logger.js
    - native-host/package.json
    - .gitignore

key-decisions:
  - "Sync pino.destination replaces pino-roll worker threads for bundle compatibility"
  - "Log rotation runs at startup only (not per-write) for simplicity"
  - "Bundle kept unminified (160KB) for debuggability"

patterns-established:
  - "esbuild CJS bundling: platform node, format cjs, target node18, no minify"
  - "Sync logging: pino.destination({ sync: true }) for bundled environments"
  - "Build copies run.sh to dist/ for co-location with bundle"

requirements-completed: [BUND-01, BUND-02]

# Metrics
duration: 2min
completed: 2026-02-27
---

# Phase 9 Plan 1: Sync Logging and esbuild Bundle Summary

**Replaced pino-roll worker-thread logging with sync pino.destination and configured esbuild to produce a 160KB single-file native host bundle with all npm dependencies inlined**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-27T13:52:49Z
- **Completed:** 2026-02-27T13:55:12Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Eliminated pino-roll dependency and replaced with sync pino.destination -- no worker threads means bundle-compatible logging
- Created startup-time log rotation module (5MB threshold, 5 rotated files)
- Configured esbuild to produce dist/host.bundle.js (160KB) with all npm deps inlined
- Build copies run.sh to dist/ for co-location, enabling single-directory distribution

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace pino-roll with sync logging and add log rotation** - `502d1b9` (feat)
2. **Task 2: Create esbuild build configuration and produce bundle** - `5c1276c` (feat)

## Files Created/Modified
- `native-host/src/log-rotation.js` - Startup-time log rotation with size-based threshold
- `native-host/src/logger.js` - Rewritten to use pino.destination({ sync: true }) instead of pino.transport
- `native-host/esbuild.config.js` - Build configuration producing single-file CJS bundle
- `native-host/package.json` - Removed pino-roll, added esbuild devDep, added build script
- `native-host/package-lock.json` - Updated lockfile
- `.gitignore` - Added native-host/dist/

## Decisions Made
- Used sync pino.destination instead of pino.transport to eliminate worker threads that break in bundled files
- Log rotation runs only at startup (not per-write) -- sufficient for low-volume native host logging
- Bundle kept unminified at 160KB for debuggability -- 17KB dead code from thread-stream accepted as harmless
- No shebang in bundle banner -- run.sh wrapper invokes node explicitly

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Bundle and wrapper script ready for Phase 10 (installer/setup command)
- dist/ directory contains everything needed for distribution: host.bundle.js + run.sh
- All Phase 9 plans (01 + 02) now complete

## Self-Check: PASSED

All 5 created/modified files verified present. Both task commits (502d1b9, 5c1276c) verified in git log.

---
*Phase: 09-native-host-bundling*
*Completed: 2026-02-27*
