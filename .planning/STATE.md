# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-06)

**Core value:** Quickly find and switch to any open Firefox tab without leaving the keyboard
**Current focus:** Phase 7 in progress (Error Handling) -- Plan 1 of 2 complete

## Current Position

Phase: 7 of 8 (Error Handling)
Plan: 1 of 2 in current phase
Status: In Progress
Last activity: 2026-02-13 - Completed 07-01: Error utilities module (lib/errors.ts)

Progress: [█████████████████████░░] 13/22 (59%)

## Performance Metrics

**Velocity:**
- Total plans completed: 13
- Average duration: 5.5min
- Total execution time: 1.1 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 Firefox WebExtension | 2/2 | 7min | 3.5min |
| 02 Native Messaging Bridge | 3/3 | 20min | 6.7min |
| 03 Raycast Tab List | 2/2 | 5min | 2.5min |
| 04 Tab Switching | 1/1 | 15min | 15min |
| 05 Tab List Polish | 3/3 | 20min | 6.7min |
| 06 Tab Close Action | 1/1 | 5min | 5min |
| 07 Error Handling | 1/2 | 1min | 1min |

**Recent Trend:**
- Last 5 plans: 05-02 (1min), 05-03 (15min), 06-01 (5min), 07-01 (1min)
- Trend: 07-01 was fast -- single focused utility module with clear spec

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
- 06-01: No osascript in handleCloseTab -- Firefox stays in background when closing tabs
- 06-01: Optimistic removal via MutatePromise with default revalidation
- 06-01: Action.Style.Destructive + Keyboard.Shortcut.Common.Remove (Ctrl+X) for close action
- 06-01: No confirmation dialog for tab close (matches Firefox behavior)
- 07-01: Three-branch error classification: ECONNREFUSED+pgrep for Firefox/host, HTTP message for extension, unknown fallback
- 07-01: Combined HostNotRunning message covers both extension-not-installed and host-not-registered (indistinguishable via ECONNREFUSED)
- 07-01: execFile("open", ["-a", "Firefox"]) for Launch Firefox recovery (avoids unwanted new tab)

### Pending Todos

None yet.

### Blockers/Concerns

- Native Messaging Host port selection (26394) not yet validated across machines
- AMO review timing unknown (submit Firefox extension early when ready)

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 1 | Fix invalid settings in .claude/settings.local.json | 2026-02-13 | e1eb1e9 | [1-fix-invalid-settings-in-claude-settings-](./quick/1-fix-invalid-settings-in-claude-settings-/) |

## Session Continuity

Last session: 2026-02-13
Stopped at: Completed 07-01-PLAN.md (error utilities module). Ready for 07-02 (search-tabs integration).
Resume file: None
