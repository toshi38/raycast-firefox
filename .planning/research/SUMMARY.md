# Project Research Summary

**Project:** raycast-firefox
**Domain:** Browser Extension / Desktop Integration
**Researched:** 2026-02-06
**Confidence:** HIGH

## Executive Summary

This project aims to build a Raycast extension that brings Firefox tab control to the macOS quick-launcher. The core challenge is that Firefox, unlike Safari and Chrome, has essentially no AppleScript support, making it impossible to use the standard browser-control pattern that other Raycast extensions rely on. The research conclusively points to a **companion WebExtension + Native Messaging architecture** as the only viable approach for real-time tab listing and switching.

The recommended implementation uses three components: (1) a Raycast extension providing the UI, (2) a Firefox WebExtension that accesses Firefox's tabs via the `browser.tabs` API, and (3) a Native Messaging host that bridges the two via localhost HTTP. This architecture unlocks full tab control (list, search, switch, close) and is extensible to bookmarks and history in v2. The primary risk is user setup friction — requiring installation of both the Raycast extension and a companion Firefox add-on — but this is unavoidable given Firefox's limited external automation capabilities.

The critical path is proving the Native Messaging bridge works reliably. Once this communication layer is validated, all other features (fuzzy search UI, tab actions, bookmark/history reading) are straightforward. The roadmap should prioritize a minimal proof-of-concept for the communication layer before building out the full feature set.

## Key Findings

### Recommended Stack

The stack divides into three sub-projects, each with distinct requirements:

**Raycast Extension (TypeScript/React):**
- `@raycast/api` 1.104.5 + `@raycast/utils` 2.2.2 (required by platform)
- Node.js >=22.14.0, TypeScript ~5.9.x (required by Raycast)
- Uses Raycast's built-in fuzzy filtering (no additional search libraries needed initially)
- `better-sqlite3` 12.6.2 for v2 bookmark/history features (reading Firefox's `places.sqlite`)

**Firefox WebExtension (JavaScript):**
- Manifest V2 (Firefox still fully supports MV2, and MV3's Event Pages complicate native messaging)
- `@types/webextension-polyfill` 0.12.4 for TypeScript types (Firefox natively supports `browser.*` API, no runtime polyfill needed)
- `web-ext` 9.2.0 for development, linting, and packaging

**Native Messaging Host (Node.js):**
- Simple Node.js script (not a compiled binary — Raycast Store won't accept arbitrary native executables)
- Implements Firefox's native messaging protocol (4-byte length-prefixed JSON over stdin/stdout)
- Runs an HTTP server on localhost for Raycast extension to communicate with
- Launched by Firefox when the WebExtension loads

**Key decision rationale:** This hybrid approach is the only way to achieve bidirectional communication between Raycast and Firefox. Reading Firefox's session files (`recovery.jsonlz4`) gives tab data but no way to switch tabs. AppleScript cannot enumerate or control Firefox tabs. The WebExtension provides the "eyes and hands" inside Firefox, while the Native Messaging host acts as the bridge.

### Expected Features

**Must have (table stakes):**
- Search open tabs by title and URL with fuzzy matching
- Switch to selected tab (activate window + focus tab)
- Show favicons and URL for each tab
- Copy current tab URL
- Open new tab with URL

These are present in every major browser Raycast extension (Safari, Chrome, Arc) and define the minimum viable product. Without tab switching, the extension is useless. Without fuzzy search and favicons, it's unpolished compared to existing extensions.

**Should have (competitive differentiators):**
- Close tab from Raycast
- Copy URL as Markdown link
- Multiple window support (show which window each tab is in)
- Open new private window

These features exist in some browser extensions and would make raycast-firefox clearly superior to the existing limited Firefox extensions (which can only read SQLite data for bookmarks/history, not control tabs).

**Defer (v2+):**
- Bookmark search (via SQLite read of `places.sqlite`)
- History search (via SQLite read)
- Tab groups / Firefox containers support
- Recently closed tabs
- Reading list / Pocket integration

These are valuable but not essential for launch. Bookmark and history search can be added later as independent commands that read Firefox's databases directly (no WebExtension needed for read-only SQLite access).

**Anti-features (deliberately excluded):**
- Modifying bookmarks (all extensions are read-only)
- Clearing history (too destructive)
- Full browser automation (out of scope)
- Cross-browser support (focus on Firefox excellence)

### Architecture Approach

The architecture consists of three components with clear boundaries:

**1. Raycast Extension (UI Layer):**
- Renders `<List>` of tabs with search, handles user actions
- Communicates with Native Messaging Host via HTTP fetch to localhost
- Uses `useCachedPromise` to cache tab data between invocations
- Never talks directly to Firefox — all communication goes through the host

**2. Firefox WebExtension (Firefox API Layer):**
- Background script with persistent connection to Native Messaging Host (Manifest V2 ensures it stays alive)
- Queries tabs via `browser.tabs.query({})` for listing
- Switches tabs via `browser.tabs.update(tabId, {active: true})` + `browser.windows.update(windowId, {focused: true})`
- Listens for native messages, responds with tab data or action confirmations
- Minimal permissions: `tabs`, `nativeMessaging` (no content scripts or host permissions needed)

**3. Native Messaging Host (Bridge Layer):**
- Node.js script registered with Firefox via native messaging manifest at `~/Library/Application Support/Mozilla/NativeMessagingHosts/<name>.json`
- Launched by Firefox when the WebExtension calls `browser.runtime.connectNative()`
- Implements Firefox's native messaging protocol on stdin/stdout (length-prefixed JSON)
- Runs an HTTP server on localhost (e.g., port 26394) for Raycast to communicate with
- Relays messages between HTTP requests (from Raycast) and native messaging (from Firefox)

**Data flow for "search tabs, select, switch":**
1. User invokes Raycast command → Raycast extension fetches `http://localhost:26394/tabs`
2. Native host receives HTTP GET, sends native message to WebExtension
3. WebExtension calls `browser.tabs.query({})`, responds with JSON array
4. Native host returns JSON to Raycast via HTTP response
5. Raycast renders list, user selects a tab
6. Raycast POSTs to `http://localhost:26394/switch` with `{tabId, windowId}`
7. WebExtension receives message, calls `browser.tabs.update()` + `browser.windows.update()`
8. Firefox brings tab to front

**Why this architecture:** It's the only approach that satisfies all requirements (real-time tab data, bidirectional communication, tab switching, extensibility to bookmarks/history, local-only/privacy-preserving). It's based on proven patterns used by similar tools (KeePassXC-Browser, browserpass, Tridactyl all use WebExtension + Native Messaging).

### Critical Pitfalls

**1. Choosing the Wrong Communication Method**
Firefox has no AppleScript support for tab enumeration or control (unlike Safari/Chrome). Reading `recovery.jsonlz4` gives stale data (updated every ~15 seconds) and no way to switch tabs. The Native Messaging approach is the only viable solution, but must be validated with a spike before committing.

**Prevention:** Build a minimal proof-of-concept for the entire communication chain (WebExtension → Native Host → HTTP) before implementing features. Validate with realistic tab counts (200+).

**2. Native Messaging Host Registration Failures**
The native messaging manifest must be in the exact location (`~/Library/Application Support/Mozilla/NativeMessagingHosts/<name>.json`), with exact JSON structure, absolute paths (no `~` or relative paths), and matching extension IDs. Firefox silently ignores misconfigured manifests.

**Prevention:** Provide an installer script that validates and registers the manifest. Test registration explicitly on both Intel and Apple Silicon Macs. Provide clear error messages in the Raycast extension if the host is unreachable.

**3. Firefox Manifest V3 Background Script Suspension**
Firefox's Manifest V3 uses Event Pages that can be suspended after 30 seconds of inactivity, dropping the native messaging connection. This would cause intermittent failures after idle periods.

**Prevention:** Use Manifest V2 for the Firefox WebExtension. Firefox has committed to long-term MV2 support (unlike Chrome). MV2's persistent background scripts keep the native messaging connection alive while Firefox is running.

**4. User Setup Friction**
Requiring users to install both a Raycast extension and a Firefox add-on (plus native messaging host registration) creates significant setup friction. This is a Store review concern and a user adoption barrier.

**Prevention:** Submit the companion Firefox extension to addons.mozilla.org (AMO) for one-click installation. Provide a setup command in the Raycast extension that automates native messaging host installation. Use Raycast's onboarding to guide first-run setup. Write extremely clear README documentation (required for Store submission).

**5. Not Handling "Firefox Not Running" State**
The extension will fail cryptically if Firefox isn't running (no tabs available, host can't connect). Users expect graceful degradation.

**Prevention:** Check if Firefox is running before attempting communication (e.g., `pgrep -x Firefox`). Use Raycast's `<List.EmptyView>` to show "Firefox is not running. Please start Firefox and try again" with an action to launch Firefox. Test this scenario explicitly.

## Implications for Roadmap

Based on research, the critical dependency is the communication layer. All features depend on it working reliably. The roadmap should follow a risk-reduction strategy: prove the hard part first, then build features.

### Suggested Phase Structure

**Phase 1: Proof-of-Concept (Communication Layer Spike)**
**Rationale:** This is the highest technical risk. Native Messaging is unfamiliar territory, and the three-component architecture needs validation before committing. This phase answers "can this even work?"

**Delivers:** A minimal working demonstration of the full communication chain:
- Firefox WebExtension that calls `browser.tabs.query()` and responds to native messages
- Native Messaging Host that bridges stdin/stdout to a localhost HTTP server
- Simple test client (or curl commands) that can fetch tab data via HTTP

**Success criteria:** Retrieving tab data from Firefox and printing it. Tab switching doesn't need to be implemented yet.

**Duration estimate:** 2-3 days

**Addresses pitfalls:** 1.1 (communication method validation), 1.2 (host registration), 1.3 (protocol framing), 1.4 (MV2 vs MV3 decision)

**Research needs:** None (already covered by STACK.md and ARCHITECTURE.md). Standard implementation.

---

**Phase 2: Minimal Raycast Extension (Tab List + Switch)**
**Rationale:** With the communication layer proven, build the Raycast UI to consume it. Focus on core user value: list tabs, search, switch to selected tab.

**Delivers:**
- Raycast extension scaffolded with `create-raycast-extension`
- "Search Firefox Tabs" command that displays a list of tabs
- Fuzzy search over tab titles and URLs (using Raycast's built-in filtering)
- "Switch to Tab" action that activates the selected tab
- Basic error handling (Firefox not running, host unreachable)

**Success criteria:** User can invoke Raycast, type to filter tabs, press Enter, and Firefox brings the selected tab to the front.

**Duration estimate:** 3-4 days

**Features implemented:** T1 (search tabs), T2 (switch), T3 (fuzzy matching), T5 (show URL)

**Addresses pitfalls:** 2.1 (async operations), 2.2 (use built-in filtering), 2.5 (Firefox not running state)

**Research needs:** None. Standard Raycast extension patterns.

---

**Phase 3: Polish and Core Actions (Favicons, Copy URL, Close Tab)**
**Rationale:** The MVP works. Now add the polish that makes it feel like a real product and competitive with other browser extensions.

**Delivers:**
- Favicons displayed for each tab (using `favIconUrl` from `browser.tabs`)
- Action menu: Copy URL, Copy as Markdown link, Close tab
- Better loading states and error messages
- Window grouping (show which window each tab is in, if user has multiple windows)

**Success criteria:** Extension feels polished and complete for the tab-switching use case. Matches feature parity with Chrome/Safari Raycast extensions.

**Duration estimate:** 2-3 days

**Features implemented:** T4 (favicons), T7 (copy URL), D1 (close tab), D4 (markdown link), D5 (window support)

**Addresses pitfalls:** 4.2 (focus and tab switching), 2.4 (preferences for configuration)

**Research needs:** None. Straightforward additions.

---

**Phase 4: Packaging and Installation Experience**
**Rationale:** The extension works for the developer. Now make it installable for end users. This is critical for Store submission and user adoption.

**Delivers:**
- Installer script for native messaging host (`install.sh` that registers the manifest)
- First-run detection and setup guidance in the Raycast extension
- Clear error messages with troubleshooting steps
- Firefox companion extension submitted to AMO (addons.mozilla.org)
- README with step-by-step installation instructions
- Raycast Store metadata (icons, screenshots, description)

**Success criteria:** A new user can install the extension following the README and have it working within 2-3 minutes. All Store requirements met.

**Duration estimate:** 2-3 days

**Addresses pitfalls:** 3.1 (self-contained setup), 3.2 (Store metadata), 3.4 (naming), 5.3 (AMO review)

**Research needs:** None, but AMO submission should happen early (manual review takes days).

---

**Phase 5 (v2): Bookmark and History Search**
**Rationale:** These are valuable features but independent of the tab-switching core. They use a different data source (SQLite) and can be added later without changing the communication layer.

**Delivers:**
- New Raycast commands: "Search Firefox Bookmarks", "Search Firefox History"
- SQLite reading using `better-sqlite3` and `@raycast/utils` `useSQL` hook
- Profile path discovery (parsing `profiles.ini`)
- Querying `places.sqlite` for bookmarks and history
- Reading `favicons.sqlite` for bookmark favicons

**Success criteria:** Users can search bookmarks and history as separate Raycast commands, opening URLs in Firefox.

**Duration estimate:** 3-4 days

**Features implemented:** D2 (bookmark search), D3 (history search)

**Addresses pitfalls:** 1.6 (profile discovery), 4.1 (file access permissions)

**Research needs:** None for bookmarks/history (proven pattern). Consider `/gsd:research-phase` if adding container tabs support later (less documented).

---

### Phase Ordering Rationale

**Why Phase 1 first:** The communication layer is the entire technical risk. If it doesn't work, nothing else matters. This is a spike to de-risk the project.

**Why Phase 2 before polish:** Validate the end-to-end user experience (search → switch) with a minimal UI before investing in polish. This ensures the core value is present.

**Why Phase 3 before packaging:** Polish improves the experience, but packaging is externally blocked (AMO review can take a week). Better to submit to AMO early and work on polish while waiting.

**Why Phase 5 is v2:** Bookmarks/history are valuable but orthogonal to tab switching. The SQLite reading approach is proven (existing Firefox Raycast extensions already do this). It's a safe addition after the core is stable.

**Dependencies:** Phases 1-3 must be sequential (each builds on the previous). Phase 4 can start in parallel with Phase 3 (AMO submission doesn't require the Raycast extension to be polished). Phase 5 is independent and can be built anytime after Phase 2.

### Research Flags

**Phases with standard patterns (skip research-phase):**
- **Phase 1:** Native Messaging protocol is well-documented. ARCHITECTURE.md covers it thoroughly.
- **Phase 2:** Raycast extension patterns are standard. Official docs and examples cover this.
- **Phase 3:** Favicon handling, action menus, and window grouping are straightforward React UI updates.
- **Phase 4:** Installer scripting and Store submission are operational, not research tasks.
- **Phase 5:** SQLite reading is proven (existing extensions do this). `better-sqlite3` + `useSQL` is documented.

**Phases that might need deeper research (if scope expands):**
- **Container Tabs (not planned for v1):** Firefox's container tabs API is less documented. Would need `/gsd:research-phase` if adding this.
- **Multiple Firefox Profiles (not planned for v1):** Supporting multiple profiles simultaneously adds complexity. Would need research on profile detection and host registration per-profile.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH (95%) | All components are proven, well-documented technologies. Raycast, WebExtensions, and Node.js are mature platforms. |
| Features | HIGH (90%) | Feature analysis based on 5+ existing browser Raycast extensions. Clear patterns for what users expect. |
| Architecture | HIGH (90%) | Native Messaging approach is used by similar tools (KeePassXC-Browser, browserpass). The three-component design is the industry standard for browser-external integration. |
| Pitfalls | HIGH (85%) | Based on domain expertise with Raycast extensions, Firefox WebExtensions, and macOS development. All identified pitfalls have proven mitigations. |

**Overall confidence:** HIGH (90%)

The architecture is proven, the stack is mature, and the feature set is well-understood. The main unknowns are operational (AMO review timing, Raycast Store review feedback, user setup friction) rather than technical.

### Gaps to Address

**1. Native Messaging Host Port Selection**
The research suggests using a fixed localhost port (e.g., 26394) for simplicity, but doesn't validate whether this port is free or conflicts with other services.

**Mitigation:** Test the chosen port on multiple machines. Consider dynamic port selection with a discovery file (the host writes its port to a known location that the Raycast extension reads). This is more robust but adds complexity.

**When to resolve:** Phase 1 (during spike). Test with the fixed port first; only add dynamic discovery if conflicts are encountered.

---

**2. Firefox Developer Edition / Nightly Support**
The research focuses on standard Firefox. Developer Edition and Nightly use different profile directories and may have different extension signing requirements.

**Mitigation:** Explicitly scope v1 to stable Firefox on macOS. Add support for Developer Edition / Nightly as a v2 feature if users request it.

**When to resolve:** Not blocking for v1. Address during Phase 4 if it's a common user request.

---

**3. Private Browsing Window Access**
Firefox WebExtensions may not have access to private browsing tabs by default (requires `<all_urls>` permission or user opt-in).

**Mitigation:** Research during Phase 3. The WebExtension may need to request private browsing access via `browser.extension.isAllowedIncognitoAccess()` and guide users to enable it in `about:addons`.

**When to resolve:** Phase 3 (when implementing window support). Test with private windows explicitly.

---

**4. Favicon Loading from Firefox Cache**
Favicons are returned by `browser.tabs` as URLs (e.g., `https://github.com/favicon.ico` or `data:` URIs). Raycast may need to fetch these.

**Mitigation:** If favicons are `data:` URIs, they can be used directly. If they're HTTP URLs, the Raycast extension needs to fetch and cache them. Test during Phase 3.

**When to resolve:** Phase 3 (favicon implementation).

## Sources

### Primary (HIGH confidence)
- Mozilla WebExtensions API documentation (developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions)
- Raycast API documentation and official extension examples (raycast.com/developers)
- Firefox Native Messaging protocol spec (developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Native_messaging)
- npm registry (verified package versions for @raycast/api, better-sqlite3, web-ext)

### Secondary (MEDIUM confidence)
- Existing Raycast browser extensions source code (raycast/extensions GitHub repo: Safari, Chrome, Arc, Brave extensions)
- Existing Firefox Raycast extensions (nicholasxjy's "Search Firefox", kud's "Firefox") for understanding current state
- KeePassXC-Browser and browserpass architecture (similar WebExtension + Native Messaging pattern)

### Tertiary (LOW confidence, validated during research)
- Firefox `recovery.jsonlz4` format (undocumented, inferred from community implementations)
- Firefox AppleScript support (tested and confirmed to be essentially non-existent for tab control)
- macOS TCC (Transparency, Consent, and Control) file access constraints for Raycast extensions (inferred, needs validation in Phase 1)

---

*Research completed: 2026-02-06*
*Ready for roadmap: yes*
