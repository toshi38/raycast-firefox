# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-06)

**Core value:** Quickly find and switch to any open Firefox tab without leaving the keyboard
**Current focus:** Phase 3 - Raycast Tab List

## Current Position

Phase: 3 of 8 (Raycast Tab List)
Plan: 1 of 2 in current phase
Status: In progress
Last activity: 2026-02-07 -- Completed 03-01-PLAN.md (scaffold extension + search tabs command)

Progress: [███████░░░░░░░░░░░░░░░░] 6/23 (26%)

## Performance Metrics

**Velocity:**
- Total plans completed: 6
- Average duration: 5min
- Total execution time: 0.5 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 Firefox WebExtension | 2/2 | 7min | 3.5min |
| 02 Native Messaging Bridge | 3/3 | 20min | 6.7min |
| 03 Raycast Tab List | 1/2 | 3min | 3min |

**Recent Trend:**
- Last 5 plans: 02-01 (2min), 02-02 (3min), 02-03 (15min), 03-01 (3min)
- Trend: 03-01 fast -- straightforward scaffold + implementation

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Roadmap: Use Manifest V2 for WebExtension (MV3 Event Pages complicate native messaging)
- Roadmap: Native Messaging Host is Node.js (not compiled binary -- Raycast Store compatibility)
- Roadmap: Fixed localhost port for HTTP bridge (dynamic port discovery deferred unless conflicts found)
- 01-01→02-03: Eager native port connection (reversed from lazy; extension connects on load)
- 01-01: Auto-reconnect via port nulling on disconnect
- 01-01: Container info degrades gracefully to null if contextualIdentities disabled
- 01-01: Pagination default pageSize=500
- 01-02: No manifest change needed for debug page (MV2 extension pages auto-accessible)
- 01-02: web-ext lint warning for data_collection_permissions acceptable (Firefox 140+ feature)
- 02-01: Protocol decoder accepts logger as optional parameter (avoids circular dependencies)
- 02-01: host.js exports sendNativeMessage/isNativeConnected for bridge module
- 02-01: Signal handlers log but do not exit -- lifecycle module handles cleanup
- 02-02: HTTP server starts lazily on first native message, not on host launch
- 02-02: Bridge uses crypto.randomUUID() for request IDs
- 02-02: Port file written atomically via temp file + rename
- 02-02: Host survives stdin EOF and continues serving HTTP with error messages
- 02-03: Protocol inbound limit raised to 1MB (matching Firefox's native messaging limit)
- 02-03: Size-aware pagination trims responses to fit under 512KB
- 02-03: macOS tab switch uses NSRunningApplication for single-window focus (not all windows)
- 03-01: Use .eslintrc.json instead of eslint.config.js (ESLint 8 compat with @raycast/eslint-config)
- 03-01: Port discovery at module level to avoid re-reading on every render
- 03-01: URL keywords include hostname, hostname parts, and path segments for comprehensive search

### Pending Todos

None yet.

### Blockers/Concerns

- Native Messaging Host port selection (26394) not yet validated across machines
- AMO review timing unknown (submit Firefox extension early when ready)

## Session Continuity

Last session: 2026-02-07
Stopped at: Completed 03-01-PLAN.md. Phase 3 plan 2 (error states/loading UX) next.
Resume file: None
