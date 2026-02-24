# Phase 7: Error Handling - Context

**Gathered:** 2026-02-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Graceful, actionable error messages when something in the communication chain is broken: Firefox not running, WebExtension not installed, or native messaging host not registered. Covers the tab search command and switch/close actions. Build reusable error utilities that Phase 8 (Setup Automation) can also consume.

</domain>

<decisions>
## Implementation Decisions

### Error detection strategy
- Detect on fetch failure only — no separate health check endpoint
- Infer failure mode from error type: connection refused = host not running, host up but no data = extension issue, no Firefox process = Firefox not running
- All actions get error handling with specific messages (tab list, switch, close)
- Tab list fetch: auto-retry with backoff (2-3 retries, e.g., 1s/2s/4s) then show error
- Switch/close actions: fail immediately, no retries — show specific error toast
- During retry period: show loading indicator with hint text ("Connecting to Firefox...")

### Error presentation
- Tab list failures: Raycast EmptyView — distinct per failure mode (different icon, title, description for each)
- Switch/close failures: Raycast toast notifications with failure style
- Tone: friendly and helpful — "Firefox isn't running — launch it and try again" style
- Each failure mode gets its own EmptyView with tailored message and recovery action

### Recovery actions
- Firefox not running: action button launches Firefox via `open -a Firefox`
- WebExtension not installed: action button opens the AMO install page (or local install guide URL)
- Native host not registered: action button triggers the Phase 8 setup command (or placeholder)
- After recovery action: auto re-fetch tabs (wait a moment, then automatically retry)

### Degraded states
- No stale/cached data — if extension can't respond, show error EmptyView (clean and honest)
- If tabs loaded but switch/close fails mid-session: keep tab list visible, show toast error
- No proactive Firefox crash detection — detect on next user interaction only
- Build shared error detection/presentation utilities reusable by Phase 8

### Claude's Discretion
- Specific retry timing and backoff intervals
- EmptyView icons per failure mode
- How long to wait after recovery action before auto re-fetch
- How to detect "extension not installed" vs "extension not responding" if distinguishable

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 07-error-handling*
*Context gathered: 2026-02-10*
