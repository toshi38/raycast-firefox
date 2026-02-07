---
phase: 03-raycast-tab-list
plan: 01
subsystem: raycast-extension
tags: [raycast, react, typescript, useFetch, list-ui]
depends_on:
  requires: [02-02]
  provides: [raycast-extension-scaffold, search-tabs-command]
  affects: [03-02, 04-01]
tech_stack:
  added: ["@raycast/api@1.104.5", "@raycast/utils@2.2.2", "typescript@5.x"]
  patterns: [useFetch-hook, port-discovery, url-keyword-extraction]
key_files:
  created:
    - raycast-extension/package.json
    - raycast-extension/tsconfig.json
    - raycast-extension/.eslintrc.json
    - raycast-extension/.gitignore
    - raycast-extension/assets/icon.png
    - raycast-extension/src/search-tabs.tsx
  modified: []
decisions:
  - id: 03-01-D1
    decision: "Use .eslintrc.json instead of eslint.config.js (flat config incompatible with @raycast/eslint-config + ESLint 8)"
  - id: 03-01-D2
    decision: "Port discovery at module level (not in component) to avoid re-reading file on every render"
  - id: 03-01-D3
    decision: "URL keywords include full hostname, hostname parts, and path segments for comprehensive search"
metrics:
  duration: 3min
  completed: 2026-02-07
---

# Phase 3 Plan 1: Scaffold Raycast Extension and Search Tabs Command

**One-liner:** Raycast extension with useFetch-powered tab list, URL keyword search, and port discovery from native host bridge

## What Was Done

### Task 1: Scaffold Raycast Extension Project (a6aaee8)

Created the `raycast-extension/` directory with all required configuration:

- **package.json** -- Raycast extension manifest with `search-tabs` command, `@raycast/api` and `@raycast/utils` dependencies
- **tsconfig.json** -- TypeScript targeting ES2022, CommonJS modules, React JSX
- **.eslintrc.json** -- Raycast ESLint config (legacy format for ESLint 8 compatibility)
- **.gitignore** -- Excludes node_modules, dist, raycast-env.d.ts
- **assets/icon.png** -- 512x512 orange circle placeholder icon (generated via Python)
- Installed all npm dependencies (220 packages)

### Task 2: Implement Search Firefox Tabs Command (56d5e11)

Created `raycast-extension/src/search-tabs.tsx` (101 lines) implementing:

1. **Tab/TabsResponse interfaces** -- Typed to match the native host HTTP API response shape from Phase 2
2. **getPort()** -- Reads `~/.raycast-firefox/port` via `readFileSync`, falls back to 26394 on error, called once at module level
3. **urlKeywords(url)** -- Extracts hostname, hostname parts (split by `.`), and pathname segments for Raycast keyword search indexing
4. **SearchTabs component** (default export):
   - `useFetch<TabsResponse>` from `@raycast/utils` fetching `http://127.0.0.1:${port}/tabs`
   - `keepPreviousData: true` to prevent flickering between fetches
   - `<List>` with `searchBarPlaceholder` and built-in Raycast fuzzy filtering
   - `<List.Item>` per tab with title, URL subtitle, and URL-derived keywords

## Task Commits

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Scaffold Raycast extension project | a6aaee8 | package.json, tsconfig.json, .eslintrc.json, .gitignore, icon.png |
| 2 | Implement Search Firefox Tabs command | 56d5e11 | src/search-tabs.tsx, .eslintrc.json |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Replaced eslint.config.js with .eslintrc.json**

- **Found during:** Task 2 (lint verification)
- **Issue:** Plan specified `eslint.config.js` using ESLint flat config format (`import { defineConfig } from "eslint/config"`), but `@raycast/eslint-config` is built for ESLint 8 which does not support flat config. The `eslint/config` subpath is not exported in ESLint 8.
- **Fix:** Replaced with `.eslintrc.json` using `{ "extends": ["@raycast"] }` legacy format
- **Files modified:** Deleted `eslint.config.js`, created `.eslintrc.json`
- **Commit:** 56d5e11

## Decisions Made

| ID | Decision | Rationale |
|----|----------|-----------|
| 03-01-D1 | Use .eslintrc.json instead of eslint.config.js | @raycast/eslint-config requires ESLint 8 legacy config format |
| 03-01-D2 | Port discovery at module level via `const port = getPort()` | Avoids re-reading port file on every React render cycle |
| 03-01-D3 | URL keywords: hostname + parts + path segments | Enables matching "github", "com", "repo-name" individually in Raycast fuzzy search |

## Verification Results

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | PASS -- no type errors |
| `ray lint` (ESLint) | PASS |
| `ray lint` (Prettier) | PASS |
| `ray lint` (author) | Expected fail -- "stelau" not registered on Raycast Store (local dev only) |
| List.Item present | PASS -- 2 occurrences |
| keywords wired | PASS -- `keywords={urlKeywords(tab.url)}` |
| subtitle wired | PASS -- `subtitle={tab.url}` |
| useFetch wired | PASS -- `useFetch<TabsResponse>(\`http://127.0.0.1:${port}/tabs\`)` |
| readFileSync port | PASS -- reads `~/.raycast-firefox/port` |

## Success Criteria Status

- [x] raycast-extension/ directory exists with valid package.json, installed dependencies, and TypeScript config
- [x] search-tabs.tsx implements SearchTabs component with useFetch, List, List.Item
- [x] Each tab displays title (as title) and URL (as subtitle) -- satisfies TABS-02
- [x] Each tab has URL-derived keywords for fuzzy search -- satisfies TABS-01
- [x] Port discovery reads from ~/.raycast-firefox/port with fallback to 26394
- [x] TypeScript compiles without errors
- [x] No custom filtering logic -- uses Raycast built-in fuzzy filter

## Next Phase Readiness

- **03-02 (Error States and Loading UX):** Ready to proceed. The base component exists and can be extended with error handling, empty states, and loading indicators.
- **04-01 (Tab Switching Actions):** Ready to add ActionPanel to List.Item for tab switching via POST /switch endpoint.

## Self-Check: PASSED
