# Stack Research: Raycast Firefox Extension

*Researched: 2026-02-06*
*Versions verified via npm registry*

---

## 1. Firefox Communication Mechanism (Critical Architectural Decision)

This is the make-or-break decision. There are four viable approaches to getting open tab data from Firefox into a Raycast extension. Each is evaluated below.

### Option A: Companion WebExtension + Native Messaging (RECOMMENDED)

**How it works:** A small Firefox WebExtension uses the `browser.tabs` API to query open tabs, then communicates with a Native Messaging host (a small local process) that the Raycast extension can read from.

| Aspect | Detail |
|--------|--------|
| **Confidence** | HIGH (95%) |
| **Pros** | Full, real-time access to tabs (title, URL, favicons, window IDs). The `browser.tabs` API is stable, well-documented, and the official way to interact with Firefox tabs. Native Messaging keeps everything local (no network). This is how professional Firefox integrations work. |
| **Cons** | Requires the user to install a companion Firefox extension. Requires a Native Messaging host binary/script registered with Firefox. Two-component system adds installation complexity. |
| **Data access** | All open tabs (title, URL, active state, window ID, favicon URL, pinned state, muted state). Can also listen for tab events in real-time. |
| **Latency** | Low. The WebExtension can respond in <50ms. Native Messaging adds minimal overhead. |
| **Reliability** | Very high. `browser.tabs` is a core WebExtensions API, stable since Firefox 54+. |

**Architecture:**
1. Firefox WebExtension: Listens for connections from Native Messaging host, responds with tab data via `browser.tabs.query({})` and can activate tabs via `browser.tabs.update(tabId, {active: true})` + `browser.windows.update(windowId, {focused: true})`.
2. Native Messaging Host: A small Node.js script or compiled binary registered in Firefox's native messaging manifest. Communicates with the WebExtension via stdin/stdout using Firefox's Native Messaging protocol (length-prefixed JSON).
3. Raycast Extension: Launches the native messaging host (or communicates via a local file/socket) to request and receive tab data.

**Alternative communication bridge (simpler):** Instead of Native Messaging (which requires the host to be launched by Firefox), the WebExtension can write tab data to a known local file (e.g., `~/.config/raycast-firefox/tabs.json`) and the Raycast extension reads that file. The WebExtension updates the file on every tab change event. This avoids the Native Messaging complexity entirely.

### Option B: Read Firefox Session Store File (sessionstore-backups/recovery.jsonlz4)

**How it works:** Firefox writes its session state to disk in `recovery.jsonlz4` (LZ4-compressed JSON). The Raycast extension reads and decompresses this file directly.

| Aspect | Detail |
|--------|--------|
| **Confidence** | MEDIUM (70%) |
| **Pros** | Zero additional installation. No companion extension needed. Read-only, so cannot break Firefox state. |
| **Cons** | File is only written periodically (every ~15 seconds by default, configurable via `browser.sessionstore.interval`). Uses Mozilla's custom LZ4 format (mozlz4) with a magic header, not standard LZ4 — needs custom decompression. File may be locked while Firefox writes. Cannot switch tabs — only read tab list. Tab switching would still require AppleScript/JXA. |
| **Data access** | All open tabs (title, URL, window info, tab groups). Also includes recently closed tabs and session history for each tab. No favicon data. |
| **Latency** | 0-15 seconds stale. The file reflects Firefox state as of the last write. |
| **Reliability** | Medium. The file format is internal and undocumented. It has been stable for years but Mozilla makes no guarantees. The mozlz4 format adds a complication. |

**File location:** `~/Library/Application Support/Firefox/Profiles/<profile>/sessionstore-backups/recovery.jsonlz4`

**mozlz4 format:** The file starts with `mozLz40\0` (8 bytes magic), followed by a 4-byte little-endian uncompressed size, then standard LZ4 block-compressed data. Libraries like `lz4js@0.2.0` can handle the LZ4 decompression after stripping the header.

### Option C: AppleScript / JXA (JavaScript for Automation)

**How it works:** Use macOS automation to send commands to Firefox.

| Aspect | Detail |
|--------|--------|
| **Confidence** | LOW (30%) |
| **Pros** | No companion extension needed. Native macOS integration. |
| **Cons** | Firefox has extremely limited AppleScript support. Unlike Safari, Firefox does NOT expose its tab model via AppleScript. You can only: `activate` (bring to front), `open location` (open a URL). You CANNOT list tabs, get tab titles/URLs, or switch to a specific tab. This is a hard blocker for the core feature. |
| **Data access** | Almost none. Cannot enumerate tabs. Cannot get tab titles or URLs. |
| **Verdict** | **NOT VIABLE as the primary communication mechanism.** However, AppleScript/JXA IS useful as a supplementary tool for bringing Firefox to the foreground after identifying the target tab via another method. |

### Option D: Read Firefox SQLite Databases (places.sqlite)

**How it works:** Firefox stores bookmarks, history, and other data in SQLite databases within the profile directory.

| Aspect | Detail |
|--------|--------|
| **Confidence** | MEDIUM (65%) for bookmarks/history, NOT VIABLE for open tabs |
| **Pros** | Direct file access, no companion extension needed. Good for bookmarks (`moz_bookmarks` + `moz_places` tables) and history (`moz_historyvisits` + `moz_places`). |
| **Cons** | `places.sqlite` does NOT contain open tab information. Open tabs live in the session store (Option B) or in Firefox's in-memory state (Option A). The database is locked by Firefox while running (WAL mode, but can still read with `PRAGMA journal_mode`). |
| **Data access** | Bookmarks (title, URL, folder, date added). History (URL, title, visit count, last visit). Favicons (in `favicons.sqlite`). **No open tab data.** |
| **Verdict** | **NOT VIABLE for core tab switching feature.** Excellent for v2 bookmark search and history search features. |

### RECOMMENDATION: Hybrid Approach

**v1 (Tab Switching):** Use **Option A** (Companion WebExtension) with the **file-based bridge** variant:
- A minimal Firefox WebExtension that writes tab data to `~/.config/raycast-firefox/tabs.json` on every tab event (`tabs.onCreated`, `tabs.onRemoved`, `tabs.onUpdated`, `tabs.onActivated`).
- The Raycast extension reads this JSON file.
- Tab switching: The WebExtension also listens on a known local file or uses Native Messaging for commands. Alternatively, use a simple localhost HTTP server in the WebExtension (via `fetch` to a local endpoint) — but the simplest approach is: the Raycast extension writes a command to a file, and the WebExtension polls it (or uses Native Messaging for the reverse channel).

**Simpler v1 alternative:** Use **Option B** (Session Store) for reading tabs + **AppleScript** for activating Firefox + **keyboard simulation** for tab switching (Cmd+number or Ctrl+Tab). This avoids the companion extension but has 15-second staleness and fragile tab switching.

**Best v1 path (simplest that works well):**
1. Companion WebExtension with Native Messaging host.
2. WebExtension exposes `browser.tabs.query()` results via Native Messaging.
3. Raycast extension spawns the native messaging host process, sends a "get tabs" request, receives JSON response.
4. For tab switching: Raycast extension sends "activate tab ID X" command; the WebExtension calls `browser.tabs.update()` + `browser.windows.update()`.

**v2 (Bookmarks, History):** Add **Option D** (SQLite) reading for bookmarks and history. These are static data that benefit from direct database access without needing the WebExtension.

**Confidence: HIGH (90%)** — This hybrid approach is used by similar projects (e.g., the Raycast Arc/Chrome extensions use a similar pattern, and tools like Browserosaurus and Tab Finder use companion extensions).

---

## 2. Raycast Extension Stack

### Core Framework (Non-negotiable — Required by Raycast)

| Component | Version | Rationale |
|-----------|---------|-----------|
| **@raycast/api** | `1.104.5` | The Raycast extension framework. Provides React components (`List`, `Detail`, `Action`, `ActionPanel`), hooks, and the extension lifecycle. This IS the Raycast SDK. |
| **@raycast/utils** | `2.2.2` | Official utility hooks (`usePromise`, `useCachedPromise`, `useFetch`, `useExec`, `useSQL`). The `useCachedPromise` hook is particularly relevant for caching tab data between invocations. |
| **React** | `19.0.0` | Bundled with `@raycast/api`. Raycast uses React for rendering extension UI. You do not install React separately — it comes as a dependency of `@raycast/api`. |
| **TypeScript** | `~5.9.x` | Required. Raycast extensions must be TypeScript. Use the version that ships with Raycast's toolchain (currently expects TS 5.x). |
| **Node.js** | `>=22.14.0` | Required by `@raycast/api` engine constraint. |

**Confidence: VERY HIGH (99%)** — These are required by the Raycast platform, not choices.

### Scaffolding

| Tool | Usage |
|------|-------|
| `npx create-raycast-extension` | Official scaffolding tool. Generates the extension with proper `package.json`, `tsconfig.json`, and directory structure. Use the "List" template as the starting point (our core UI is a searchable list of tabs). |

### Linting & Formatting

| Component | Version | Rationale |
|-----------|---------|-----------|
| **@raycast/eslint-config** | `2.1.1` | Official Raycast ESLint configuration. Required for Raycast Store publication. Extends recommended React and TypeScript rules. |
| **ESLint** | `9.x` | Required by `@raycast/eslint-config`. |
| **Prettier** | `3.x` | Standard code formatting. Raycast extensions conventionally use Prettier. |

**Confidence: HIGH (95%)**

### Fuzzy Search

| Component | Version | Rationale |
|-----------|---------|-----------|
| **Raycast built-in filtering** | N/A | Raycast's `<List>` component has built-in filtering (`filtering={true}` prop or `onSearchTextChange`). For the v1 tab list, this may be sufficient. Raycast's built-in fuzzy matching is good and requires zero additional dependencies. |
| **fuse.js** | `7.1.0` | If custom fuzzy matching is needed (e.g., weighting URL vs title differently), Fuse.js is the standard choice. Lightweight, no native dependencies, configurable scoring. |

**Recommendation:** Start with Raycast's built-in filtering. Only add Fuse.js if the built-in filtering is insufficient for matching across both tab title and URL simultaneously.

**Confidence: HIGH (90%)**

---

## 3. Companion Firefox WebExtension Stack

The WebExtension is a separate sub-project within the same repo.

| Component | Version | Rationale |
|-----------|---------|-----------|
| **Manifest V2** | N/A | Use Manifest V2 for Firefox, NOT Manifest V3. As of 2026, Firefox's Manifest V3 support is incomplete (background service workers are still limited). MV2 with `"background": {"scripts": [...]}` is the stable, reliable choice for Firefox. Chrome has deprecated MV2, but Firefox has not and has stated they will support it indefinitely. |
| **WebExtensions API** | Firefox 115+ ESR | Target Firefox 115+ (current ESR baseline). Use `browser.tabs`, `browser.windows`, `browser.runtime` (for native messaging). |
| **web-ext** | `9.2.0` | Mozilla's official CLI for developing, linting, and packaging Firefox extensions. Use for `web-ext lint`, `web-ext run` (launches Firefox with the extension loaded), and `web-ext build` (creates `.xpi` for distribution). |
| **TypeScript** | `~5.9.x` | Same as the Raycast extension. Provides type safety for the WebExtension code. |
| **@types/webextension-polyfill** | `0.12.4` | Provides TypeScript type definitions for the `browser.*` WebExtensions API. Install as a dev dependency for type-checking only. We do NOT need the `webextension-polyfill` runtime package because Firefox natively supports the `browser.*` promise-based API; the `@types` package is used solely for TypeScript intellisense and compilation. |
| **webextension-polyfill (runtime)** | Not needed | Firefox natively supports the `browser.*` promise-based API with promises. The polyfill is only needed for Chrome compatibility, which is out of scope. |

**Confidence: HIGH (90%)** for MV2 choice, HIGH (90%) for type approach.

### Native Messaging Host

| Component | Detail |
|-----------|--------|
| **Runtime** | Node.js script (since Node.js >=22.14 is already required by Raycast). Alternatively, a small compiled binary (e.g., Go or Rust) for zero-dependency distribution, but Node.js is simpler for this project. |
| **Protocol** | Firefox Native Messaging uses stdin/stdout. Messages are length-prefixed (4-byte native-endian uint32 prefix followed by JSON). The Node.js host reads from `process.stdin`, writes to `process.stdout`. |
| **Registration** | A JSON manifest file placed at `~/Library/Application Support/Mozilla/NativeMessagingHosts/<name>.json` that points to the host executable and lists allowed extension IDs. |

---

## 4. v2 Feature Stack (Bookmarks & History)

| Component | Version | Rationale |
|-----------|---------|-----------|
| **better-sqlite3** | `12.6.2` | For reading Firefox's `places.sqlite` (bookmarks, history) and `favicons.sqlite`. Fast, synchronous, native SQLite binding. The `@raycast/utils` package provides a `useSQL` hook specifically designed for this pattern. |
| **Fallback: sql.js** | `1.13.0` | Pure WASM SQLite implementation. Use ONLY if `better-sqlite3` has native compilation issues in Raycast's environment. Prefer `better-sqlite3` for performance. |

**Confidence: HIGH (85%)** — `better-sqlite3` is the standard choice and is used by other Raycast extensions that read browser databases.

---

## 5. Session Store Reading (Alternative/Supplementary)

If using Option B for any purpose:

| Component | Version | Rationale |
|-----------|---------|-----------|
| **lz4js** | `0.2.0` | For decompressing Firefox's mozlz4 format. After stripping the 12-byte mozlz4 header (`mozLz40\0` + 4-byte size), the remaining data is standard LZ4 block format that `lz4js` can decompress. |

**Confidence: MEDIUM (70%)** — mozlz4 parsing is straightforward but the format is undocumented.

---

## 6. Project Structure

```
raycast-firefox/
  .planning/               # Project planning docs
  extension/               # Raycast extension (TypeScript + React)
    src/
      search-tabs.tsx       # Main command: list + search + switch tabs
      lib/
        firefox.ts          # Firefox communication layer
        native-messaging.ts # Native Messaging protocol implementation
        tabs.ts             # Tab data types and parsing
    package.json
    tsconfig.json
  firefox-extension/       # Companion Firefox WebExtension
    manifest.json           # MV2 manifest
    background.js           # Background script: tab tracking + native messaging
    icons/
  native-host/             # Native Messaging host
    raycast_firefox.js      # Node.js native messaging host script
    manifest.json           # Native messaging host manifest (for Firefox registration)
    install.sh              # Script to register the native messaging host
  package.json              # Root workspace (optional, for shared tooling)
```

---

## 7. What NOT to Use

| Technology | Why Not |
|------------|---------|
| **Manifest V3 for Firefox** | Firefox's MV3 implementation is still maturing. Background service workers have limitations. MV2 is fully supported and Firefox has committed to long-term MV2 support. |
| **AppleScript for tab enumeration** | Firefox exposes almost nothing via AppleScript. Cannot list tabs, get URLs, or switch tabs. Only useful for `activate` (bring Firefox to front). |
| **Chrome DevTools Protocol / Remote Debugging** | Firefox supports a remote debugging protocol, but it requires `--remote-debugging-port` flag, is designed for developer tools, is unstable across versions, and is massive overkill for tab listing. |
| **Selenium / Puppeteer / Playwright** | Browser automation frameworks are extremely heavyweight, require a WebDriver binary, and are designed for testing, not for reading tab state from a user's running browser. |
| **WebSocket-based communication** | Adds unnecessary complexity. A local file or Native Messaging is simpler and more reliable for this use case. |
| **Electron or standalone app wrapper** | We're building a Raycast extension, not a standalone app. Raycast provides the UI layer. |
| **webextension-polyfill** | Only needed for cross-browser extensions targeting Chrome. Firefox natively supports the `browser.*` API with promises. Adding the polyfill adds bundle size for zero benefit. |
| **Fuse.js (initially)** | Raycast has excellent built-in list filtering. Adding Fuse.js before trying the built-in approach adds unnecessary dependency and complexity. |

---

## 8. Key Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| User reluctance to install companion Firefox extension | Medium | High (blocks core feature) | Provide clear installation instructions. Consider publishing to Firefox Add-ons (AMO) for trust. Alternatively, offer a degraded mode using session store reading (Option B) that works without the companion extension but has stale data. |
| Native Messaging host registration complexity | Medium | Medium | Provide an `install.sh` script that creates the manifest file in the correct location. Document manual steps as fallback. |
| Firefox mozlz4 format changes | Low | Medium (only affects Option B) | The format has been stable since Firefox 56 (2017). Pin the magic header check and fail gracefully with a clear error if format changes. |
| Raycast extension store review process | Low | Low | Follow Raycast's extension guidelines from the start. Use `@raycast/eslint-config`. Test with `ray lint`. |
| `better-sqlite3` native compilation in Raycast environment | Low | Medium | Raycast extensions run in Node.js, so native modules should work. If not, fall back to `sql.js` (WASM). |

---

## 9. Summary of Decisions

| Decision | Choice | Confidence |
|----------|--------|------------|
| Firefox communication (v1) | Companion WebExtension + Native Messaging | HIGH (90%) |
| WebExtension manifest version | Manifest V2 | HIGH (95%) |
| Tab switching mechanism | `browser.tabs.update()` + `browser.windows.update()` via WebExtension | HIGH (95%) |
| Raycast framework | `@raycast/api` 1.104.x + `@raycast/utils` 2.2.x | VERY HIGH (99%) |
| Fuzzy search | Raycast built-in filtering first, Fuse.js 7.x if needed | HIGH (90%) |
| Bookmarks/History (v2) | `better-sqlite3` 12.x reading `places.sqlite` | HIGH (85%) |
| TypeScript version | 5.9.x (matching Raycast toolchain) | HIGH (95%) |
| Node.js version | >=22.14.0 (required by @raycast/api) | VERY HIGH (99%) |
| Linting | @raycast/eslint-config 2.1.x | HIGH (95%) |

---

*This research informs the ROADMAP.md. The Firefox communication mechanism (companion WebExtension + Native Messaging) is the critical path — it must be prototyped and validated before building out the full Raycast extension UI.*
