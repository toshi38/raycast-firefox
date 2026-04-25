---
phase: 12-raycast-install-flow
plan: 01
subsystem: infra
tags: [github-releases, sha256, native-host, installer, toast-ux, raycast-api]

requires:
  - phase: 10-cicd-pipeline
    provides: GitHub Releases with host.bundle.js, run.sh, SHA256SUMS.txt assets
  - phase: 09-distribution-bundle
    provides: Production path ~/.raycast-firefox/bin/run.sh and dual-mode resolution
provides:
  - Installer library (lib/installer.ts) with download/verify/install pipeline
  - Updated setup command with animated toast progress and post-install guidance
  - Node.js symlink creation at ~/.raycast-firefox/node
  - SHA256 verification of downloaded release assets
affects: [13-raycast-store]

tech-stack:
  added: []
  patterns: [download-verify-install pipeline, atomic file installation via temp dir, GitHub Releases API for native-host tag filtering]

key-files:
  created:
    - raycast-extension/src/lib/installer.ts
  modified:
    - raycast-extension/src/setup-bridge.tsx

key-decisions:
  - "Use /releases endpoint (not /releases/latest) to find first native-host@ tagged release"
  - "Atomic install: temp dir in environment.supportPath, verify all checksums, then move to final dir"
  - "version.txt written last as install-complete marker"
  - "Always re-download and overwrite -- no version comparison or skip logic"
  - "Four-state post-install guidance based on chain verification and Firefox running state"

patterns-established:
  - "Installer as pure function library with onProgress callback for UI decoupling"
  - "Toast-based multi-step progress with Try Again action on failure"
  - "AMO link action only shown on partial success states"

requirements-completed: [INST-01, INST-02, INST-03, INST-04, INST-05, INST-07, INST-08]

duration: 3min
completed: 2026-03-14
---

# Phase 12 Plan 01: Installer Library and Setup Command Integration Summary

**GitHub Releases download-verify-install pipeline in lib/installer.ts with SHA256 verification, atomic installation, and four-state post-install toast guidance in setup-bridge.tsx**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-14T11:14:29Z
- **Completed:** 2026-03-14T11:18:27Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Created installer library with full download/verify/install pipeline from GitHub Releases
- SHA256 verification of host.bundle.js and run.sh against SHA256SUMS.txt
- Atomic install pattern: download to temp dir, verify checksums, move to final ~/.raycast-firefox/bin/
- Node.js symlink at ~/.raycast-firefox/node pointing to process.execPath
- Setup command shows animated toast with step-by-step progress messages
- Four-state post-install guidance: full success (HUD), Firefox not running, needs restart, extension not connected
- Error toasts include "Try Again" action that re-launches the setup command
- AMO install link action only appears when chain verification is partial

## Task Commits

Code changes were committed as part of a prior session that executed plans out of order:

1. **Task 1: Create installer library (lib/installer.ts)** - `9a61f84` (feat, included in plan 12-02 commit)
2. **Task 2: Integrate installer into setup-bridge.tsx with toast UX** - `9a55006` (docs, included in plan 12-02 metadata commit)

**Plan metadata:** see final commit (docs: complete plan)

## Files Created/Modified
- `raycast-extension/src/lib/installer.ts` - Download, SHA256 verify, atomic install, and Node.js symlink logic
- `raycast-extension/src/setup-bridge.tsx` - Updated setup command with installer integration, animated toast progress, and four-state post-install guidance

## Decisions Made
- Used /releases endpoint instead of /releases/latest to find first release tagged with "native-host@" prefix, avoiding false matches when latest release is an extension@ tag
- Atomic install uses environment.supportPath for temp directory (falls back to OS tmpdir)
- version.txt is written last as an install-complete marker -- if it's missing, install was interrupted
- Always re-download and overwrite all files on every setup run (no version comparison or skip logic) -- download is ~167KB so speed is not a concern
- Post-install guidance uses isFirefoxRunning() from errors.ts to distinguish "Firefox not running" from "host needs restart" states

## Deviations from Plan

None - plan executed exactly as written. Code changes match all plan specifications.

## Issues Encountered
- A prior session committed the installer.ts and setup-bridge.tsx changes under plan 12-02 commit hashes instead of separate plan 12-01 commits. The code is correct and complete; only the commit attribution is mixed. This summary documents the actual state.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Installer pipeline fully functional -- setup command downloads, verifies, and installs native host
- Phase 12 is complete (both plans done) -- ready for Phase 13 (Raycast Store Submission)
- The "Install Firefox Extension" action links to the AMO listing (LINK-03 partially addressed)
- Changeset from plan 12-02 will bump native-host to 1.1.1 on next release

## Self-Check: PASSED

All artifacts verified:
- raycast-extension/src/lib/installer.ts: FOUND
- raycast-extension/src/setup-bridge.tsx: FOUND
- 12-01-SUMMARY.md: FOUND
- Commit 9a61f84: FOUND
- Commit 9a55006: FOUND

---
*Phase: 12-raycast-install-flow*
*Completed: 2026-03-14*
