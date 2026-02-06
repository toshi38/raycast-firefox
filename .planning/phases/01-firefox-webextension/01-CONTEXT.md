# Phase 1: Firefox WebExtension - Context

**Gathered:** 2026-02-06
**Status:** Ready for planning

<domain>
## Phase Boundary

A companion Firefox browser extension (Manifest V2) that exposes tab data via the `browser.tabs` API and communicates with a Native Messaging Host over a persistent native messaging port. This phase delivers the Firefox-side component only — the native messaging host and Raycast extension are separate phases.

</domain>

<decisions>
## Implementation Decisions

### Message Protocol
- Persistent native messaging port via `browser.runtime.connectNative()` (not one-shot messages)
- Three commands in v1: `list-tabs`, `switch-tab`, `close-tab`
- Wrapped response format: `{"ok": true, "data": [...]}` / `{"ok": false, "error": "message"}`
- Pagination support with large default page size (~500) so it's effectively "all at once" for most users, but the mechanism exists for extreme tab counts

### Tab Data Scope
- Include tabs from private browsing windows
- Per-tab data: id, windowId, title, URL, favIconUrl, active state, pinned state, container/contextual identity info
- Return all available tabs immediately — don't wait for "Loading..." tabs to finish loading
- Container info included in data model (user plans to adopt Firefox containers)

### Distribution
- Self-hosted signed XPI initially (GitHub releases), AMO submission later
- Extension ID: `raycast-firefox@lau.engineering`
- No toolbar icon — extension is invisible in normal use
- Accessible via about:addons for management
- Hidden debug page for troubleshooting connection status and recent messages

### Lifecycle
- Lazy connection: connect to native messaging host on first request, not on Firefox startup
- Auto-reconnect on disconnection: silently retry on next request if the port drops
- Return whatever tab data is available immediately (don't block on session restore)

### Claude's Discretion
- Communication pattern choice (request-response vs event-driven push)
- Exact JSON message schema field names and structure
- Debug page design and content
- Extension icon design (for about:addons listing)
- Reconnection retry strategy (timing, backoff)

</decisions>

<specifics>
## Specific Ideas

- User has ~200 open tabs currently — this is the baseline for testing
- User expects that having better tab switching will reduce duplicate tabs over time
- Debug page should show connection status and recent message log — useful for users who need to troubleshoot

</specifics>

<deferred>
## Deferred Ideas

- AMO (addons.mozilla.org) publication — future, after initial self-hosted release works
- Toolbar icon with connection status indicator — not needed for v1, reconsider if users report confusion

</deferred>

---

*Phase: 01-firefox-webextension*
*Context gathered: 2026-02-06*
