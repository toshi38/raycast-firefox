# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-06)

**Core value:** Quickly find and switch to any open Firefox tab without leaving the keyboard
**Current focus:** Phase 5 complete (Tab List Polish) -- Ready for Phase 6 (Tab Close Action)

## Current Position

Phase: 5 of 8 (Tab List Polish)
Plan: 3 of 3 in current phase
Status: Complete
Last activity: 2026-02-09 -- Completed Phase 5 (all 3 plans)

Progress: [███████████████████░░░] 11/22 (50%)

## Performance Metrics

**Velocity:**
- Total plans completed: 11
- Average duration: 6min
- Total execution time: 1.0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 Firefox WebExtension | 2/2 | 7min | 3.5min |
| 02 Native Messaging Bridge | 3/3 | 20min | 6.7min |
| 03 Raycast Tab List | 2/2 | 5min | 2.5min |
| 04 Tab Switching | 1/1 | 15min | 15min |
| 05 Tab List Polish | 3/3 | 20min | 6.7min |

**Recent Trend:**
- Last 5 plans: 03-02 (2min), 04-01 (15min), 05-01 (3min), 05-02 (1min), 05-03 (15min)
- Trend: 05-03 took longer due to 3 bug fixes discovered during human verification

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
- 03-02: Raycast fuzzy filter space-token behavior is expected (splits on spaces, matches independently)
- 04-01: Close-first pattern: closeMainWindow before fetch POST for perceived instant switching
- 04-01: getFavicon added in Phase 4 rather than deferring to Phase 5
- 04-01: Offset-based pagination to handle size-aware trimming changing effective page sizes
- 05-01: DJB2 hash for deterministic domain-to-color mapping across 14-color palette
- 05-01: getAvatarIcon with gradient:false for cleaner single-color letter avatars
- 05-01: Full URL added to keywords array so search matches protocol and query params despite cleaned subtitle
- 05-01: Accessory order: Pin, Active, Container, Window (most important rightmost near eye focus)
- 05-02: SHA-256 hash of favicon URL as disk cache filename for safe filesystem keys
- 05-02: Memory cache Map with 500-entry limit, FIFO eviction
- 05-02: Native fetch with AbortSignal.timeout(5000) for favicon fetching (Node 18+)
- 05-03: Firefox provides favicons as data: URIs -- use directly, skip native host proxy
- 05-03: Map Firefox container color names to Raycast Color enum (colorCode property is null)
- 05-03: Surrogate pair detection for emoji tab titles to avoid getAvatarIcon crash

### Pending Todos

None yet.

### Blockers/Concerns

- Native Messaging Host port selection (26394) not yet validated across machines
- AMO review timing unknown (submit Firefox extension early when ready)

## Session Continuity

Last session: 2026-02-09
Stopped at: Phase 5 complete. All 3 plans executed and verified. Ready for Phase 6.
Resume file: None
