---
phase: 13-raycast-store-submission
plan: 01
subsystem: ui
tags: [raycast, store, metadata, icon, amo, changelog, readme]

# Dependency graph
requires:
  - phase: 11-firefox-amo-submission
    provides: AMO listing URL for cross-linking
  - phase: 12-raycast-install-flow
    provides: Setup command and installer library
provides:
  - Centralized AMO_URL constant for all extension consumers
  - Store-ready README.md with setup instructions
  - 512x512 custom fox icon for Raycast Store listing
  - MIT LICENSE in extension directory
  - Raycast Store format CHANGELOG.md
  - Correct author and platforms metadata in package.json
affects: [13-02-PLAN]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shared constants module (lib/constants.ts) for cross-component URLs"

key-files:
  created:
    - raycast-extension/src/lib/constants.ts
    - raycast-extension/README.md
    - raycast-extension/LICENSE
  modified:
    - raycast-extension/src/search-tabs.tsx
    - raycast-extension/src/setup-bridge.tsx
    - raycast-extension/package.json
    - raycast-extension/CHANGELOG.md
    - raycast-extension/assets/icon.png

key-decisions:
  - "Author field set to stephen_lau matching Raycast account username"
  - "AMO_URL centralized in lib/constants.ts imported by both search-tabs and setup-bridge"
  - "prebuild/predev scripts removed (break in raycast/extensions monorepo context)"
  - "Icon accepted as-is (fox design on dark background works for both themes)"

patterns-established:
  - "Shared constants: extension-wide URLs and config live in src/lib/constants.ts"

requirements-completed: [STORE-02, STORE-03, STORE-05, STORE-06, STORE-08, LINK-02, LINK-03]

# Metrics
duration: 5min
completed: 2026-03-14
---

# Phase 13 Plan 01: Code Changes and Metadata Summary

**Centralized AMO URL constant, 512x512 fox icon, store-ready README/LICENSE/CHANGELOG, and correct author metadata for Raycast Store submission**

## Performance

- **Duration:** 5 min (across two sessions with checkpoint)
- **Started:** 2026-03-14T20:50:00Z
- **Completed:** 2026-03-14T21:10:00Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Centralized AMO URL in `lib/constants.ts` imported by both `search-tabs.tsx` and `setup-bridge.tsx`, eliminating the hardcoded wrong URL
- Replaced placeholder orange icon with 512x512 fox design cropped and resized from source image
- Created store-focused README.md with setup instructions linking to AMO listing
- Added MIT LICENSE, reformatted CHANGELOG.md to Raycast Store format
- Updated package.json with `platforms: ["macOS"]` and correct `author: "stephen_lau"`

## Task Commits

Each task was committed atomically:

1. **Task 1: Code changes and metadata files** - `ba9ca76` (feat)
2. **Task 2: Confirm Raycast username and icon rendering** - `317e8e0` (fix)

## Files Created/Modified
- `raycast-extension/src/lib/constants.ts` - Centralized AMO_URL constant
- `raycast-extension/src/search-tabs.tsx` - Import AMO_URL, fix action title casing
- `raycast-extension/src/setup-bridge.tsx` - Import AMO_URL, remove local declaration
- `raycast-extension/package.json` - Add platforms, update author, remove prebuild/predev
- `raycast-extension/assets/icon.png` - 512x512 fox icon replacing placeholder
- `raycast-extension/README.md` - Store-focused setup guide with AMO link
- `raycast-extension/LICENSE` - MIT license copied from repo root
- `raycast-extension/CHANGELOG.md` - Raycast Store format changelog

## Decisions Made
- **Author field**: Set to `stephen_lau` (matches Raycast account, required for `ray lint` validation)
- **AMO URL centralization**: Single `constants.ts` module replaces both the hardcoded wrong URL in search-tabs and the local const in setup-bridge
- **prebuild/predev removal**: These scripts wrote `project-root.txt` which breaks in the raycast/extensions monorepo context; Phase 9/12 production path resolution does not need this file
- **Icon accepted as-is**: Fox design from source image works for both light and dark themes without needing a `@dark` variant

## Deviations from Plan

None - plan executed exactly as written. The checkpoint for username/icon confirmation was part of the planned flow.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All code changes and metadata files are in place
- Plan 13-02 can proceed with: lint fixes, package-lock generation, screenshot setup, and Store validation
- The correct author field (`stephen_lau`) should now pass `ray lint` validation

## Self-Check: PASSED

All files verified present. All commits verified in history.

---
*Phase: 13-raycast-store-submission*
*Completed: 2026-03-14*
