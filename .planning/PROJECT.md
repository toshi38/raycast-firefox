# Raycast Firefox

## What This Is

A Raycast extension for controlling Firefox from the keyboard. Fuzzy search across all open tabs by title and URL, instant tab switching, tab closing, and automated setup — all without leaving Raycast.

## Core Value

Quickly find and switch to any open Firefox tab without leaving the keyboard.

## Requirements

### Validated

- ✓ Fuzzy search open Firefox tabs by title and URL — v1.0
- ✓ Switch to a selected tab (bring Firefox to front, activate the tab) — v1.0
- ✓ Communication layer between Raycast extension and Firefox — v1.0
- ✓ Close a tab from Raycast without switching to it — v1.0
- ✓ Active tab indicator and favicons — v1.0
- ✓ Error recovery with actionable messages — v1.0
- ✓ Automated native messaging host setup — v1.0

### Active

(None — define with `/gsd:new-milestone`)

### Out of Scope

- Bookmark search — v2 candidate, not needed for core tab switching
- History search — v2 candidate
- Tab content search (full-text) — extremely complex; requires indexing page content
- Bookmark modification (add/delete/edit) — high risk, low value for a quick-launch tool
- History clearing — destructive action; too dangerous for quick-launch
- Browser automation (forms, clicks) — that's Puppeteer/Playwright territory
- Cross-device sync — privacy constraint; all data stays local
- Move tabs between windows — complex edge cases
- Auto tab management (close stale, auto-group) — opinionated behavior users don't expect
- Other browsers — Firefox-only focus
- Firefox mobile — macOS desktop only

## Context

Shipped v1.0 with ~2,400 LOC across three components:
- **extension/** — Firefox WebExtension (MV2): background.js with tab query, switch, close, and debug handlers
- **native-host/** — Node.js Native Messaging Host: binary protocol, HTTP bridge, favicon cache, lifecycle management
- **raycast-extension/** — Raycast extension (TypeScript/React): tab list, actions, error handling, setup command

Tech stack: TypeScript + React (Raycast), JavaScript (WebExtension + Native Host), Node.js.
macOS only (Raycast is macOS-exclusive). All communication stays local (localhost HTTP + native messaging).

Known tech debt from v1.0 audit: getPort() duplication, ERRH-02 string coupling, unused windowId forwarding, stale project-root.txt for other developers. All minor — see `milestones/v1.0-MILESTONE-AUDIT.md`.

## Constraints

- **Platform**: macOS only — Raycast is macOS-exclusive
- **Browser**: Firefox only — no need to abstract for multi-browser support
- **Stack**: TypeScript + React — required by Raycast extension framework
- **Privacy**: Must not require sending browsing data to external services — all communication stays local

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Manifest V2 for WebExtension | MV3 Event Pages complicate native messaging | ✓ Good — persistent background page works perfectly |
| Node.js Native Messaging Host | Raycast Store compatibility (no compiled binary) | ✓ Good — simple deployment |
| Fixed localhost port (26394) | Avoid dynamic port discovery complexity | ✓ Good — no conflicts found in practice |
| Eager native port connection | Extension connects on load, not lazily | ✓ Good — eliminates first-request latency |
| HTTP bridge (not WebSocket) | Simpler for request-response pattern | ✓ Good — stateless, easy to debug |
| Close-first pattern for tab switch | closeMainWindow before async HTTP for perceived speed | ✓ Good — feels instant |
| Firefox data URIs for favicons | Skip native host proxy for most favicons | ✓ Good — simplified architecture |
| Three-branch error classification | ECONNREFUSED+pgrep, HTTP message, unknown fallback | ✓ Good — covers all failure modes |
| Build-time project-root.txt asset | Raycast copies extensions, breaking __dirname walk | ✓ Good — reliable path resolution |
| Size-aware pagination (512KB limit) | Firefox native messaging has 1MB limit | ✓ Good — handles 500+ tabs |

---
*Last updated: 2026-02-24 after v1.0 milestone*
