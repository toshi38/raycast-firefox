---
phase: 07-error-handling
plan: 02
subsystem: error-handling
tags: [error-emptyview, retry, port-file-watcher, fs-watch, recovery-actions, toast-errors]

# Dependency graph
requires:
  - phase: 07-01-error-handling
    provides: FailureMode enum, classifyError, fetchWithRetry, showActionError utilities
  - phase: 03-raycast-tab-list
    provides: fetchAllTabs, usePromise-based tab list component
  - phase: 04-tab-switching
    provides: switchTab with closeMainWindow pattern
  - phase: 06-tab-close
    provides: closeTab with optimistic mutate pattern
provides:
  - Error-aware tab list with EmptyView states for all failure modes
  - Per-failure-mode recovery actions (Launch Firefox, Install WebExtension, Set Up Host)
  - Classified error toasts for switch and close action failures
  - Push-based port file watcher for instant Firefox connect/disconnect detection
  - Fast-fail on missing port file (skips retry, avoids pgrep race condition)
  - Native host port file cleanup on stdin EOF/error
affects: [08-setup-automation]

# Tech tracking
tech-stack:
  added: []
  patterns: [port-file-watcher, push-based-state-detection, fast-fail-before-retry, callback-based-error-classification]

key-files:
  created: []
  modified:
    - raycast-extension/src/search-tabs.tsx
    - raycast-extension/src/lib/errors.ts
    - native-host/host.js

key-decisions:
  - "Always-rendered List.EmptyView with dynamic content instead of conditional ErrorEmptyView component (fixes Raycast rendering issue)"
  - "Push-based port file watcher via fs.watch instead of polling for instant state transitions"
  - "Native host removes port file on stdin EOF/error to signal Raycast immediately"
  - "Fast-fail on missing port file skips fetchWithRetry entirely with port-file-missing error"
  - "port-file-missing classification avoids pgrep race condition during Firefox shutdown"
  - "Icon.Plug for ExtensionNotInstalled (Icon.Puzzle does not exist in Raycast API)"
  - "Toast.Style.Failure for Set Up Native Host placeholder (not Animated which spins forever)"

patterns-established:
  - "Port file as state signal: presence/absence indicates host availability, watched via fs.watch"
  - "Error classification in callbacks (onError/onData) not render path -- avoids execFileSync on render thread"
  - "Fast-fail pattern: check precondition before expensive retry loop"

# Metrics
duration: 5min
completed: 2026-02-14
---

# Phase 7 Plan 2: Error Handling Integration Summary

**Error-aware tab list with per-failure-mode EmptyView, port file watcher for instant disconnect detection, and classified error toasts for switch/close actions**

## Performance

- **Duration:** ~5 min (execution) + overnight checkpoint verification
- **Started:** 2026-02-13T19:54:22Z
- **Completed:** 2026-02-14T06:22:54Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments
- ErrorEmptyView with per-failure-mode icons, titles, descriptions, and recovery actions (Launch Firefox, Install WebExtension, Set Up Host, Retry)
- fetchAllTabs wrapped with fetchWithRetry for 3 retries with exponential backoff (1s/2s/4s)
- switchTab and closeTab use showActionError for classified failure toasts instead of generic messages
- Push-based port file watcher (fs.watch) for instant Firefox connect/disconnect detection
- Fast-fail on missing port file skips retries entirely, avoids pgrep race condition
- Native host cleans up port file on stdin EOF/error for immediate Raycast signal

## Task Commits

Each task was committed atomically:

1. **Task 1: Add retry + error handling to fetchAllTabs and wire ErrorEmptyView** - `cb78428` (feat)
2. **Task 2: Replace generic error handling in switchTab and closeTab with showActionError** - `619b6b7` (feat)
3. **Task 3: Post-verification refinements (port file watcher, rendering fixes, pgrep race fix)** - `e497207` (fix)

## Files Created/Modified
- `raycast-extension/src/search-tabs.tsx` - Error-aware tab list with always-rendered List.EmptyView, port file watcher, fast-fail on missing port, classified error callbacks
- `raycast-extension/src/lib/errors.ts` - Added port-file-missing classification to avoid pgrep race condition
- `native-host/host.js` - Port file cleanup on stdin EOF and stdin error for instant disconnect signaling

## Decisions Made
- Always-rendered List.EmptyView with dynamic content instead of conditional ErrorEmptyView component -- fixes Raycast rendering issue where conditional EmptyView was not displayed
- Push-based port file watcher via fs.watch on ~/.raycast-firefox/ directory instead of polling -- detects both host start (port created) and Firefox disconnect (port removed) instantly
- Native host removes port file on stdin EOF/error -- signals Raycast immediately rather than waiting for HTTP timeout
- Fast-fail on missing port file skips fetchWithRetry entirely -- no point retrying when no host is listening
- port-file-missing error gets its own classifyError branch returning FirefoxNotRunning without calling isFirefoxRunning() -- avoids race condition where Firefox process lingers briefly during shutdown
- Used Icon.Plug for ExtensionNotInstalled (Icon.Puzzle does not exist in Raycast API)
- Changed "Set Up Native Host" toast from Toast.Style.Animated (spins forever with no resolution) to Toast.Style.Failure with informational message

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Icon.Puzzle does not exist in Raycast API**
- **Found during:** Task 1
- **Issue:** Plan specified Icon.Puzzle for ExtensionNotInstalled but this icon does not exist in the Raycast API types
- **Fix:** Used Icon.Plug instead, which is semantically appropriate for "extension/connection"
- **Files modified:** raycast-extension/src/search-tabs.tsx
- **Verification:** TypeScript compiles cleanly
- **Committed in:** cb78428

**2. [Rule 1 - Bug] ErrorEmptyView not rendering as conditional component**
- **Found during:** Task 3 (checkpoint verification)
- **Issue:** Conditional `{classifiedError && <ErrorEmptyView>}` did not render in Raycast -- List.EmptyView must be always present
- **Fix:** Replaced conditional component with always-rendered List.EmptyView with dynamic icon/title/description/actions based on classifiedError state
- **Files modified:** raycast-extension/src/search-tabs.tsx
- **Committed in:** e497207

**3. [Rule 1 - Bug] classifyError calling execFileSync on render path**
- **Found during:** Task 3 (checkpoint verification)
- **Issue:** classifyError calls isFirefoxRunning() which uses execFileSync (synchronous subprocess) -- calling this during render would block the UI
- **Fix:** Moved error classification into usePromise onError/onData callbacks using useState, keeping it off the render path
- **Files modified:** raycast-extension/src/search-tabs.tsx
- **Committed in:** e497207

**4. [Rule 1 - Bug] pgrep race condition during Firefox shutdown**
- **Found during:** Task 3 (checkpoint verification)
- **Issue:** When Firefox quits, the process may linger briefly. If Raycast checks isFirefoxRunning() during this window, pgrep returns true even though Firefox is shutting down
- **Fix:** Added port-file-missing fast path in classifyError that returns FirefoxNotRunning without calling isFirefoxRunning(), plus fast-fail in usePromise that skips retries when port file is absent
- **Files modified:** raycast-extension/src/lib/errors.ts, raycast-extension/src/search-tabs.tsx
- **Committed in:** e497207

**5. [Rule 2 - Missing Critical] No disconnect detection mechanism**
- **Found during:** Task 3 (checkpoint verification)
- **Issue:** No way for Raycast to detect Firefox disconnect until next manual interaction -- user would see stale "loading" or stale error state
- **Fix:** Added fs.watch on ~/.raycast-firefox/ directory for push-based port file detection, plus native host port file cleanup on stdin EOF/error
- **Files modified:** raycast-extension/src/search-tabs.tsx, native-host/host.js
- **Committed in:** e497207

**6. [Rule 1 - Bug] Set Up Native Host toast spins forever**
- **Found during:** Task 3 (checkpoint verification)
- **Issue:** Toast.Style.Animated has no resolution -- it shows a spinning indicator indefinitely
- **Fix:** Changed to Toast.Style.Failure with descriptive message about manual setup
- **Files modified:** raycast-extension/src/search-tabs.tsx
- **Committed in:** e497207

---

**Total deviations:** 6 auto-fixed (5 bugs, 1 missing critical)
**Impact on plan:** All fixes were necessary for correct rendering, race condition avoidance, and responsive state detection. The port file watcher and host cleanup were the most significant additions -- they enable instant state transitions without polling. No scope creep beyond what was needed for correct operation.

## Issues Encountered
None beyond the deviations documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Full error handling pipeline is complete: classification, retry, EmptyView, action toasts, and disconnect detection
- Phase 8 (Setup Automation) can use the same lib/errors.ts utilities and port file conventions
- Port file watcher pattern establishes the convention for state signaling between native host and Raycast

## Self-Check: PASSED

- FOUND: raycast-extension/src/search-tabs.tsx
- FOUND: raycast-extension/src/lib/errors.ts
- FOUND: native-host/host.js
- FOUND: .planning/phases/07-error-handling/07-02-SUMMARY.md
- FOUND: commit cb78428
- FOUND: commit 619b6b7
- FOUND: commit e497207

---
*Phase: 07-error-handling*
*Completed: 2026-02-14*
