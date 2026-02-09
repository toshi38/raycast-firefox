---
phase: 04-tab-switching
plan: 01
subsystem: ui
tags: [raycast, actionpanel, favicon, tab-switching, pagination]

# Dependency graph
requires:
  - phase: 03-raycast-tab-list
    provides: "Search Firefox Tabs command with List.Item rendering"
  - phase: 02-native-messaging-bridge
    provides: "POST /switch HTTP endpoint"
provides:
  - "ActionPanel with Switch to Tab action on every List.Item"
  - "getFavicon website icons on every tab"
  - "Offset-based pagination for complete tab fetching"
affects: [05-tab-list-polish, 06-tab-close-action]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Close-first pattern: closeMainWindow before async HTTP"
    - "Offset-based pagination for size-trimmed native messaging responses"

key-files:
  created: []
  modified:
    - "raycast-extension/src/search-tabs.tsx"
    - "native-host/src/server.js"
    - "extension/background.js"

key-decisions:
  - "Close-first pattern: closeMainWindow called before fetch POST for perceived instant switching"
  - "getFavicon added in Phase 4 rather than deferring to Phase 5 (one-line UX win)"
  - "Offset-based pagination to handle size-aware trimming changing effective page sizes"

patterns-established:
  - "Close-first pattern for Raycast actions that switch to another app"
  - "usePromise with fetchAllTabs for paginated tab loading"

# Metrics
duration: 15min
completed: 2026-02-08
---

# Phase 4 Plan 1: Add Switch to Tab Action Summary

**ActionPanel with close-first tab switching, getFavicon icons, and offset-based pagination for all 160+ tabs**

## Performance

- **Duration:** 15 min
- **Started:** 2026-02-08
- **Completed:** 2026-02-08
- **Tasks:** 1 auto + 1 human checkpoint
- **Files modified:** 3

## Accomplishments
- Primary "Switch to Tab" action on every List.Item (Enter key triggers switch)
- Close-first pattern: Raycast closes instantly, then POST /switch fires in background
- getFavicon website icons on every tab for visual polish
- showHUD error handling for failed switches and connection errors
- Fixed pagination: offset-based fetching ensures all tabs appear (not just first ~120)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add ActionPanel with Switch to Tab action** - `637cbad` (feat)
2. **Fix: Fetch all tab pages** - `94d5ef2` (fix, deviation)
3. **Fix: Offset-based pagination** - `e2acf44` (fix, deviation)

## Files Created/Modified
- `raycast-extension/src/search-tabs.tsx` - Added switchTab function, ActionPanel, getFavicon, fetchAllTabs with offset pagination
- `native-host/src/server.js` - Pass page/pageSize/offset query params through to WebExtension
- `extension/background.js` - Accept offset param for direct start index in pagination

## Decisions Made
- Close-first pattern: closeMainWindow before fetch POST for perceived instant switching
- getFavicon added now rather than waiting for Phase 5 (trivial addition, immediate UX benefit)
- Offset-based pagination chosen over page-based to handle size-aware trimming correctly

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript strict mode type assertion**
- **Found during:** Task 1 (switchTab function)
- **Issue:** `response.json()` returns `unknown` in strict mode
- **Fix:** Added type assertion `as { error?: string }` with nullish coalescing
- **Files modified:** raycast-extension/src/search-tabs.tsx
- **Committed in:** 637cbad (part of task commit)

**2. [Rule 1 - Bug] Pagination returning incomplete tab list**
- **Found during:** Human verification (YouTube tab not found in search)
- **Issue:** Size-aware trimming reduced 160 tabs to 120 on page 1; page 2 never fetched
- **Fix:** Added multi-page fetching with offset parameter across all three layers
- **Files modified:** raycast-extension/src/search-tabs.tsx, native-host/src/server.js, extension/background.js
- **Committed in:** 94d5ef2, e2acf44

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both fixes necessary for correct operation. Pagination fix touched 2 files outside plan scope (server.js, background.js) but was required for complete tab visibility.

## Issues Encountered
None beyond the deviations above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Tab switching fully verified across single-window, multi-window, and search-then-switch flows
- Favicons already showing via getFavicon (Phase 5 can refine with Firefox's favIconUrl)
- All 160+ tabs searchable and switchable
- Ready for Phase 5 (Tab List Polish) or Phase 6 (Tab Close Action)

---
*Phase: 04-tab-switching*
*Completed: 2026-02-08*
