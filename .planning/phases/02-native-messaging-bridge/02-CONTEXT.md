# Phase 2: Native Messaging Bridge - Context

**Gathered:** 2026-02-07
**Status:** Ready for planning

<domain>
## Phase Boundary

A Node.js Native Messaging Host that bridges Firefox's native messaging protocol (length-prefixed JSON over stdin/stdout) to a localhost HTTP server. Raycast calls HTTP endpoints; the host translates to native messages and returns responses. The WebExtension (Phase 1) is already built. The Raycast extension (Phase 3+) is a future consumer.

</domain>

<decisions>
## Implementation Decisions

### HTTP server design
- Port range strategy: try 26394 first, then 26395, 26396, etc. if occupied
- Port discovery via file: host writes current port to a known path (e.g., `~/.raycast-firefox/port`)
- Envelope response format: `{ok: true, data: [...], meta: {count, timestamp}}` (not bare arrays)
- 2-second timeout waiting for WebExtension response before returning error to caller

### Process lifecycle
- HTTP server starts lazily on first HTTP request (not immediately on host launch)
- Host stays alive when native messaging connection drops (Firefox closes) — returns errors to Raycast until Firefox reconnects
- Never auto-exits — runs until killed manually or system restarts
- New instance kills old process via PID file (not port check, since port can shift), then starts fresh
- Raycast can surface "Firefox not running" with option to open Firefox (error handling in Phase 7)

### Protocol handling
- Message size limit: 512KB (lower than Firefox's 1MB default) — fail gracefully if exceeded
- Request ID correlation: each message gets a unique ID, response must include same ID — allows concurrent requests
- Version handshake on connect: exchange version info, warn on mismatch but still work
- Malformed messages: log the error and forward an error response to Raycast so the user knows debugging is needed and where to find logs

### Logging & diagnostics
- Log location: `~/.raycast-firefox/logs/`
- Default verbosity: errors + key events (startup, shutdown, connection changes) — no per-request logging
- `/health` endpoint: returns host uptime, Firefox connection status, port, version
- Auto-rotate logs: keep last N files, cap size to prevent disk bloat

### Claude's Discretion
- Exact port range size (how many ports to try)
- Log rotation parameters (file count, max size)
- PID file location and locking mechanism
- Exact health endpoint response shape
- Request ID format (UUID, incrementing integer, etc.)

</decisions>

<specifics>
## Specific Ideas

- Errors from the host should be surfaced through Raycast UI so users know something went wrong and where to find logs for debugging
- Port file and PID file should live under `~/.raycast-firefox/` as a shared config directory

</specifics>

<deferred>
## Deferred Ideas

- Historical tabs: keep a cache of previously-seen tabs so Raycast can show/open them even when Firefox is disconnected — future phase
- "Open Firefox" action from Raycast when Firefox is not running — Phase 7 (Error Handling)

</deferred>

---

*Phase: 02-native-messaging-bridge*
*Context gathered: 2026-02-07*
