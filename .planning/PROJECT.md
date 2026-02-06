# Raycast Firefox

## What This Is

A Raycast extension that lets you control Firefox from Raycast. Starting with fast fuzzy search across open tabs (by title and URL) and instant switching, with a roadmap toward bookmark search, tab management, and history search.

## Core Value

Quickly find and switch to any open Firefox tab without leaving the keyboard.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Fuzzy search open Firefox tabs by title and URL
- [ ] Switch to a selected tab (bring Firefox to front, activate the tab)
- [ ] Communication layer between Raycast extension and Firefox

### Out of Scope

- Bookmark search — v2 feature, not needed for core tab switching
- Close/manage tabs (close, move between windows) — v2 feature
- History search — v2 feature
- Other browsers — Firefox only
- Firefox mobile — macOS desktop only

## Context

- First Raycast extension for the developer — will need to scaffold from scratch
- Raycast extensions are built with React + TypeScript using the Raycast API
- Firefox does not have native AppleScript support like Safari, so a communication mechanism needs to be researched (likely native messaging via a companion Firefox extension, or reading Firefox's internal state)
- macOS only (Raycast is macOS-exclusive)
- Personal use initially, may publish to Raycast Store later — code quality should support that path

## Constraints

- **Platform**: macOS only — Raycast is macOS-exclusive
- **Browser**: Firefox only — no need to abstract for multi-browser support
- **Stack**: TypeScript + React — required by Raycast extension framework
- **Privacy**: Must not require sending browsing data to external services — all communication stays local

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Firefox communication method | Core architectural decision — determines what's possible | — Pending (needs research) |
| v1 scope is tab switching only | Focus on one thing done well before expanding | — Pending |

---
*Last updated: 2026-02-06 after initialization*
