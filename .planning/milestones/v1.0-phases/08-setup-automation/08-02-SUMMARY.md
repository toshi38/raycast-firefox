---
phase: 08-setup-automation
plan: 02
subsystem: ui
tags: [raycast, error-recovery, launchCommand, setup-bridge, error-classification]

# Dependency graph
requires:
  - phase: 08-01
    provides: Setup Firefox Bridge command (setup-bridge) and setup utility module
provides:
  - Error recovery action wired from HostNotRunning state to setup command via launchCommand
  - Fixed error classification for port-file-missing when Firefox is running
  - Build-time asset for native-host path resolution (project-root.txt)
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns: [launchCommand cross-command navigation, build-time asset injection via prebuild/predev scripts]

key-files:
  created:
    - raycast-extension/assets/project-root.txt
  modified:
    - raycast-extension/src/search-tabs.tsx
    - raycast-extension/src/lib/errors.ts
    - raycast-extension/src/lib/setup.ts
    - raycast-extension/package.json

key-decisions:
  - "Raycast copies extensions to ~/.config/raycast/ so __dirname walk does not work; use build-time project-root.txt asset instead"
  - "port-file-missing with Firefox running should classify as HostNotRunning (not FirefoxNotRunning) by checking isFirefoxRunning() first"

patterns-established:
  - "Build-time asset pattern: prebuild/predev scripts write project-root.txt for runtime path resolution"
  - "Cross-command navigation: launchCommand({ name: 'setup-bridge', type: LaunchType.UserInitiated }) for error recovery"

requirements-completed: [COMM-04]

# Metrics
duration: 15min
completed: 2026-02-23
---

# Phase 8 Plan 2: Wire Setup Into Error Recovery Summary

**HostNotRunning error action launches setup command via launchCommand, with fixes for path resolution and error classification**

## Performance

- **Duration:** 15 min
- **Started:** 2026-02-23T19:30:00Z
- **Completed:** 2026-02-23T19:49:39Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Replaced placeholder "Setup Not Available Yet" toast in search-tabs.tsx with launchCommand to setup-bridge command
- Fixed native-host path resolution to use build-time asset (project-root.txt) instead of __dirname walk, which fails when Raycast copies the extension to ~/.config/raycast/
- Fixed error classification so port-file-missing with Firefox running correctly classifies as HostNotRunning instead of FirefoxNotRunning
- End-to-end verification confirmed: error recovery flow, direct setup, idempotency, and chain verification all working

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire HostNotRunning action to setup command** - `1ce36b3` (feat)
2. **Task 2: Human verification of setup command end-to-end** - checkpoint approved, no commit

Additional fixes during testing:

3. **Fix: Resolve native-host path via build-time asset** - `a19c0f1` (fix, Rule 1 - Bug)
4. **Fix: Classify port-file-missing with Firefox running as HostNotRunning** - `5614d3d` (fix, Rule 1 - Bug)

## Files Created/Modified
- `raycast-extension/src/search-tabs.tsx` - Replaced placeholder toast with launchCommand to setup-bridge; added launchCommand/LaunchType imports
- `raycast-extension/src/lib/errors.ts` - Fixed error classification for port-file-missing when Firefox is running (checks isFirefoxRunning first)
- `raycast-extension/src/lib/setup.ts` - Fixed path resolution to use build-time project-root.txt asset instead of __dirname walk
- `raycast-extension/package.json` - Added prebuild/predev scripts to write project-root.txt
- `raycast-extension/assets/project-root.txt` - Build-time asset containing project root path

## Decisions Made
- Raycast copies extensions to `~/.config/raycast/` at runtime, so `__dirname` walk to find `native-host/run.sh` does not work in production. Fixed by writing `project-root.txt` asset at build time via prebuild/predev package.json scripts.
- `port-file-missing` error when Firefox IS running should be classified as `HostNotRunning` (native host not registered/started), not `FirefoxNotRunning`. Added `isFirefoxRunning()` check before classifying.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed native-host path resolution for Raycast production mode**
- **Found during:** Task 2 (human verification / testing)
- **Issue:** `resolveNativeHostPath()` walked up from `__dirname` to find `native-host/run.sh`, but Raycast copies extensions to `~/.config/raycast/` where the native-host directory does not exist
- **Fix:** Added prebuild/predev scripts to write `project-root.txt` asset at build time; `resolveNativeHostPath()` reads this asset to locate the project root
- **Files modified:** raycast-extension/src/lib/setup.ts, raycast-extension/package.json, raycast-extension/assets/project-root.txt
- **Verification:** Setup command successfully finds and references native-host/run.sh in production mode
- **Committed in:** `a19c0f1`

**2. [Rule 1 - Bug] Fixed error classification for port-file-missing with Firefox running**
- **Found during:** Task 2 (human verification / testing)
- **Issue:** When port file is missing but Firefox IS running, `classifyError` returned `FirefoxNotRunning` instead of `HostNotRunning` -- the port-file-missing branch did not check if Firefox was actually running
- **Fix:** Added `isFirefoxRunning()` check in the port-file-missing classification branch; if Firefox is running, classify as `HostNotRunning` so the "Set Up Native Host" action appears
- **Files modified:** raycast-extension/src/lib/errors.ts
- **Verification:** Error recovery flow correctly shows "Set Up Native Host" when port file missing but Firefox is running
- **Committed in:** `5614d3d`

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both fixes were necessary for the end-to-end flow to work correctly. The path resolution bug would have broken setup in all production installs. The error classification bug would have shown incorrect recovery actions. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviations above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 8 is the final phase. All v1 requirements are complete.
- The full flow works end-to-end: Firefox WebExtension -> Native Messaging Host -> Raycast tab search/switch/close with error recovery and automated setup.

## Self-Check: PASSED

All files verified present. All commit hashes verified in git log.

---
*Phase: 08-setup-automation*
*Completed: 2026-02-23*
