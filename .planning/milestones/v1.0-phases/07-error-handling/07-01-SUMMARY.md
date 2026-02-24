---
phase: 07-error-handling
plan: 01
subsystem: error-handling
tags: [error-classification, retry, exponential-backoff, toast, pgrep, node-fetch, undici]

# Dependency graph
requires:
  - phase: 02-native-messaging
    provides: HTTP bridge with 502 error responses for disconnected extension
  - phase: 03-raycast-tab-list
    provides: fetchAllTabs function and port discovery
provides:
  - FailureMode enum with 4 failure modes
  - classifyError function mapping raw errors to typed failure modes
  - isFirefoxRunning helper using pgrep for macOS process detection
  - fetchWithRetry wrapper with 3-retry exponential backoff (1s/2s/4s)
  - showActionError toast helper with Launch Firefox recovery action
affects: [07-02-error-handling, 08-setup-automation]

# Tech tracking
tech-stack:
  added: []
  patterns: [error-classification-decision-tree, exponential-backoff-retry, toast-with-recovery-action]

key-files:
  created:
    - raycast-extension/src/lib/errors.ts
  modified: []

key-decisions:
  - "Three-branch error classification: ECONNREFUSED+pgrep for Firefox/host detection, HTTP error message for extension issues, unknown fallback"
  - "Combined HostNotRunning message covers both extension-not-installed and host-not-registered since both produce ECONNREFUSED when Firefox is running"
  - "execFile('open', ['-a', 'Firefox']) for Launch Firefox recovery action (avoids opening unwanted new tab)"

patterns-established:
  - "Error classification decision tree: check error.cause.code on TypeError for connection-level failures, then error.message for HTTP-level failures"
  - "Shared error utilities in lib/errors.ts imported by commands and future phases"

# Metrics
duration: 1min
completed: 2026-02-13
---

# Phase 7 Plan 1: Error Utilities Summary

**Shared error classification module with ECONNREFUSED/pgrep decision tree, 3-retry exponential backoff, and failure toast with Launch Firefox recovery**

## Performance

- **Duration:** 1 min
- **Started:** 2026-02-13T19:51:00Z
- **Completed:** 2026-02-13T19:52:07Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- FailureMode enum with 4 typed failure modes (FirefoxNotRunning, ExtensionNotInstalled, HostNotRunning, Unknown)
- classifyError decision tree inspecting error.cause.code for ECONNREFUSED + pgrep subprocess for Firefox process detection
- fetchWithRetry generic wrapper with configurable retries and exponential backoff (default 1s/2s/4s)
- showActionError toast helper with "Launch Firefox" primary action for FirefoxNotRunning mode

## Task Commits

Each task was committed atomically:

1. **Task 1: Create lib/errors.ts with error classification and utilities** - `ac8a689` (feat)

## Files Created/Modified
- `raycast-extension/src/lib/errors.ts` - Shared error utilities: FailureMode enum, ClassifiedError interface, isFirefoxRunning, classifyError, fetchWithRetry, showActionError

## Decisions Made
- Three-branch error classification: ECONNREFUSED with pgrep sub-check for Firefox vs host, HTTP message matching for extension issues, unknown fallback
- Combined HostNotRunning message covers both "extension not installed" and "host not registered" since both produce ECONNREFUSED when Firefox is running (per RESEARCH.md insight)
- Used execFile("open", ["-a", "Firefox"]) for Launch Firefox recovery action rather than Raycast open() to avoid opening unwanted new tabs
- Friendly tone in all error messages per user decision (e.g., "Launch Firefox to see your tabs here" not "ECONNREFUSED: connection refused")

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- lib/errors.ts ready for import by Plan 07-02 (search-tabs.tsx integration with EmptyView and action error handling)
- All 6 exports available: FailureMode, ClassifiedError, classifyError, isFirefoxRunning, fetchWithRetry, showActionError
- Phase 8 (Setup Automation) can import the same module for setup flow error handling

## Self-Check: PASSED

- FOUND: raycast-extension/src/lib/errors.ts
- FOUND: commit ac8a689

---
*Phase: 07-error-handling*
*Completed: 2026-02-13*
