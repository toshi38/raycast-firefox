---
phase: 11-firefox-amo-submission
plan: 01
subsystem: extension
tags: [firefox, amo, web-ext, manifest, license]

# Dependency graph
requires:
  - phase: 09-native-host-bundling
    provides: bundled native host for distribution
  - phase: 10-ci-cd-pipeline
    provides: release workflow with GitHub Release assets
provides:
  - AMO-compliant manifest with name and data_collection_permissions
  - Clean extension zip build via web-ext
  - MIT LICENSE and GitHub README for AMO listing
  - Extension zip attached as GitHub Release asset
affects: [11-02-amo-submission, 12-raycast-install-flow, 13-raycast-store]

# Tech tracking
tech-stack:
  added: [web-ext@9.4.0]
  patterns: [web-ext-config.cjs for build exclusions]

key-files:
  created:
    - extension/web-ext-config.cjs
    - LICENSE
    - README.md
  modified:
    - extension/manifest.json
    - extension/package.json
    - package-lock.json
    - .github/workflows/release.yml

key-decisions:
  - "web-ext-config.cjs (CommonJS) used for ignoreFiles since web-ext requires CJS config format"
  - "Extension zip glob pattern in release.yml for version-agnostic asset attachment"

patterns-established:
  - "web-ext-config.cjs: centralized ignore list for build artifact cleanliness"

requirements-completed: [AMO-02, AMO-03, AMO-04]

# Metrics
duration: 3min
completed: 2026-03-09
---

# Phase 11 Plan 01: AMO Submission Prep Summary

**AMO-compliant manifest with renamed extension, data collection declaration, clean zip build, and MIT LICENSE/README for listing**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-09T13:57:32Z
- **Completed:** 2026-03-09T14:00:13Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Extension manifest renamed to "Raycast Tab Manager for Firefox" and data_collection_permissions declared as required: ["none"]
- web-ext upgraded to ^9.4.0 with clean zip build excluding package.json and non-extension files
- MIT LICENSE and user-facing README with setup instructions, permissions, and privacy sections
- Release workflow updated to build extension zip and attach as GitHub Release asset

## Task Commits

Each task was committed atomically:

1. **Task 1: Update manifest and upgrade web-ext** - `14bf3db` (feat)
2. **Task 2: Add MIT LICENSE and GitHub README** - `37b023b` (feat)

## Files Created/Modified
- `extension/manifest.json` - Renamed extension, added data_collection_permissions
- `extension/package.json` - Upgraded web-ext to ^9.4.0
- `extension/web-ext-config.cjs` - Ignore list excluding package.json and non-extension files from zip
- `package-lock.json` - Updated lockfile for web-ext upgrade
- `.github/workflows/release.yml` - Added extension zip build step and release asset glob
- `LICENSE` - MIT license, copyright 2026 Stephen Lau
- `README.md` - User-facing README with setup instructions for AMO listing

## Decisions Made
- Used web-ext-config.cjs (CommonJS format) for ignoreFiles since web-ext requires CJS config, not JSON
- Extension zip attached to GitHub Release via glob pattern `raycast_tab_manager_for_firefox-*.zip` for version-agnostic matching

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Created web-ext-config.cjs to exclude package.json from zip**
- **Found during:** Task 1 (zip inspection)
- **Issue:** web-ext build included package.json in the zip, which should not be shipped to AMO
- **Fix:** Created web-ext-config.cjs with ignoreFiles list (initially tried .json format, corrected to CJS per web-ext requirements)
- **Files modified:** extension/web-ext-config.cjs
- **Verification:** Rebuilt zip contains only manifest.json, background.js, debug.html, debug.js, icons/
- **Committed in:** 14bf3db (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Auto-fix necessary for clean zip artifact. No scope creep.

## Issues Encountered
None beyond the web-ext config format discovery documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Extension zip is ready for manual AMO upload (Plan 11-02)
- LICENSE and README provide the required repo documentation for AMO listing links
- Release workflow will automatically include extension zip in future GitHub Releases

## Self-Check: PASSED

All 7 files verified present. Both task commits (14bf3db, 37b023b) confirmed in git log.

---
*Phase: 11-firefox-amo-submission*
*Completed: 2026-03-09*
