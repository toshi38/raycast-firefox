# Architecture Research: Raycast Firefox Extension

## 1. How Existing Raycast Browser Extensions Work

### Safari Extension (raycast/extensions — `extensions/safari`)

**Components:**
- **Raycast extension (TypeScript/React)** — provides the UI (list views, search, actions)
- **Swift helper binary** — compiled Swift executable bundled with the extension, invoked via Node.js child process
- **AppleScript (via Swift)** — the Swift binary uses macOS NSAppleScript / osascript to talk to Safari

**Data flow for "list tabs, select, switch":**
1. User invokes the Raycast command (e.g., "Search Safari Tabs")
2. Raycast extension calls the bundled Swift binary via Node.js child process APIs
3. Swift binary runs AppleScript: `tell application "Safari" to get {name, URL} of every tab of every window`
4. Swift binary serializes result as JSON to stdout
5. Raycast extension parses JSON, renders a List with tab titles and URLs
6. User selects a tab; Raycast extension calls Swift binary again with a "switch" command
7. Swift binary runs AppleScript: `tell application "Safari" to set current tab of window X to tab Y` and `activate`
8. Safari comes to front with the correct tab

**Why this works for Safari:** Safari has first-class AppleScript support as a macOS-native application. It exposes a scriptable interface (Safari.sdef) with objects for windows, tabs, and their properties.

### Chrome/Arc/Brave Extensions (raycast/extensions — various)

**Components:**
- **Raycast extension (TypeScript/React)** — UI layer
- **AppleScript via osascript** — Chrome family browsers also expose AppleScript dictionaries

**Data flow:**
1. Raycast extension spawns osascript with AppleScript to query Chrome
2. AppleScript returns tab data (title, URL, window index, tab index)
3. Raycast extension parses and displays
4. On selection, another AppleScript call activates the window and sets the active tab index

**Why this works for Chrome:** Google Chrome (and Chromium-based browsers) ship with AppleScript support on macOS. They expose window, tab, active tab index, URL, title in their scripting dictionaries.

### Key Observation

Both Safari and Chrome Raycast extensions rely on **AppleScript** as the communication bridge. This is the simplest, most reliable approach because:
- No extra installation required (no companion browser extension)
- No persistent background process
- Synchronous request-response model
- Well-understood, stable API

---

## 2. The Firefox Problem

**Firefox does NOT have an AppleScript dictionary.** Unlike Safari and Chrome, Firefox on macOS does not expose a scriptable interface. Running `tell application "Firefox" to get name of every tab of every window` fails.

This means we cannot use the same simple approach as Safari/Chrome extensions.

### Available Communication Approaches for Firefox

#### Approach A: Native Messaging (Browser Extension + Native Messaging Host)

**Components:**
1. **Raycast extension** (TypeScript/React) — UI layer
2. **Firefox WebExtension** (companion add-on) — runs inside Firefox, has access to browser.tabs API
3. **Native Messaging Host** (executable on disk) — registered with Firefox, can exchange messages with the WebExtension
4. **IPC mechanism** — connects the Raycast extension to the Native Messaging Host (e.g., Unix domain socket, HTTP localhost, or file-based)

**Data flow:**
```
Raycast Extension  <--IPC-->  Native Messaging Host  <--stdin/stdout-->  Firefox WebExtension
     (Node.js)                  (Python/Node/Swift)                        (JavaScript)
```

1. User invokes Raycast command "Search Firefox Tabs"
2. Raycast extension connects to Native Messaging Host via IPC (e.g., HTTP on localhost or Unix socket)
3. Native Messaging Host sends a request to the Firefox WebExtension via native messaging (stdin/stdout)
4. WebExtension calls `browser.tabs.query({})` — returns all tabs with title, URL, windowId, id
5. WebExtension sends JSON response back to Native Messaging Host via the native messaging port
6. Native Messaging Host forwards to Raycast extension
7. User selects a tab; Raycast extension sends "switch" request through the same path
8. WebExtension calls `browser.tabs.update(tabId, {active: true})` + `browser.windows.update(windowId, {focused: true})`
9. Firefox brings the tab to front

**Pros:**
- Full access to Firefox WebExtension APIs (tabs, bookmarks, history, etc.)
- Official, supported, stable API
- Works with any Firefox feature the WebExtension API exposes
- Future-proof for v2 features (bookmarks, history, tab management)

**Cons:**
- Requires user to install a companion Firefox extension
- Requires a native messaging host manifest registered in Firefox config
- More moving parts (3 components instead of 1)
- Setup friction for first-time users

#### Approach B: Firefox Remote Debugging Protocol (CDP-like)

**Components:**
1. **Raycast extension** (TypeScript/React)
2. **Firefox with remote debugging enabled** — via --start-debugger-server or devtools.debugger.remote-enabled

**Data flow:**
```
Raycast Extension  <--WebSocket-->  Firefox Remote Debugging Server
     (Node.js)                        (localhost:6000)
```

1. Firefox must be started/configured with remote debugging enabled
2. Raycast extension connects via WebSocket to localhost:6000
3. Sends protocol commands to list tabs, navigate, etc.
4. Receives responses

**Pros:**
- No companion extension needed
- Direct programmatic access

**Cons:**
- Requires user to enable remote debugging (security concern, non-trivial setup)
- The protocol is underdocumented and not stable
- Firefox Remote Debugging Protocol (RDP) is NOT the same as Chrome DevTools Protocol (CDP) — fewer tools/libraries
- Remote debugging exposes powerful capabilities (security risk)
- May require Firefox restart with flags
- Poor UX for end users

#### Approach C: Read Firefox Session Data Directly

**Components:**
1. **Raycast extension** (TypeScript/React)
2. **Firefox profile directory** — contains sessionstore-backups/recovery.jsonlz4

**Data flow:**
```
Raycast Extension  --reads-->  ~/Library/Application Support/Firefox/Profiles/<profile>/sessionstore-backups/recovery.jsonlz4
```

1. Raycast extension locates Firefox profile directory
2. Reads recovery.jsonlz4 (LZ4-compressed JSON of the current session)
3. Decompresses and parses to extract window/tab data (URLs, titles)
4. Displays in Raycast

For switching:
- Cannot directly switch tabs via file read (one-way: read-only)
- Would need to combine with `open -a Firefox` + URL scheme or AppleScript activate (imprecise)

**Pros:**
- Zero installation — no companion extension, no native messaging host
- Fast read of current state
- Works even if Firefox APIs change

**Cons:**
- **Read-only** — cannot switch tabs, only list them
- File format is undocumented, may change between Firefox versions
- LZ4 decompression needs a library (mozLz4 format, not standard LZ4)
- Session file is updated periodically (every ~15 seconds), so data can be stale
- Tab switching would require a hacky workaround (opening the URL in a new tab rather than switching)
- Breaks the "switch to tab" core requirement

#### Approach D: Hybrid — Session File (read) + AppleScript activate + URL Scheme

**Components:**
1. **Raycast extension** (TypeScript/React)
2. **Firefox profile directory** (for reading tab data)
3. **open command or AppleScript** (for activating Firefox)

**Data flow:**
1. Read tabs from recovery.jsonlz4
2. On selection, use `open "firefox://..."` or `open -a Firefox URL` to navigate
3. This opens or focuses the URL — but may open a NEW tab instead of switching to the existing one

**Pros:**
- No companion extension needed
- Simpler than native messaging

**Cons:**
- Cannot reliably switch to an existing tab (may open a duplicate)
- Stale data (session file lag)
- Fragile

---

## 3. Recommended Approach

### Primary: Approach A — Native Messaging (WebExtension + Native Messaging Host)

This is the only approach that satisfies all requirements:
- List tabs accurately and in real-time
- Switch to a specific existing tab (not open a duplicate)
- Extensible to bookmarks, history, tab management in v2
- Uses official, stable Firefox WebExtension APIs
- All local, privacy-preserving

### Fallback: Approach C+D as a read-only MVP

If the goal is to ship something minimal first, reading session data provides a quick "list tabs" feature. But tab switching will be unreliable. This could serve as a Phase 0 prototype but should not be the long-term architecture.

---

## 4. Component Boundaries

### Component 1: Raycast Extension (TypeScript/React)

**Responsibility:** UI rendering, user interaction, fuzzy search filtering
**Boundary:** Communicates with Native Messaging Host via IPC; never talks to Firefox directly
**Key files:**
- `src/search-tabs.tsx` — main command, renders List of tabs
- `src/lib/firefox-client.ts` — IPC client to communicate with the native messaging host
- `package.json` — Raycast extension manifest

### Component 2: Firefox WebExtension (JavaScript)

**Responsibility:** Access Firefox internal state via browser.tabs, browser.bookmarks, browser.history APIs
**Boundary:** Communicates only with the Native Messaging Host via native messaging (browser.runtime.connectNative / browser.runtime.sendNativeMessage)
**Key files:**
- `firefox-extension/manifest.json` — WebExtension manifest (v2 or v3)
- `firefox-extension/background.js` — background script that listens for native messages and queries Firefox APIs

### Component 3: Native Messaging Host (Node.js or Python)

**Responsibility:** Bridge between the Raycast extension and the Firefox WebExtension
**Boundary:**
- Upstream: Listens on localhost HTTP (or Unix socket) for requests from the Raycast extension
- Downstream: Communicates with Firefox WebExtension via stdin/stdout native messaging protocol
**Key files:**
- `native-host/server.js` — HTTP server or socket listener
- `native-host/manifest.json` — Native messaging host manifest (registered with Firefox)
- `native-host/install.sh` — Installation script to register the native messaging host

### IPC Between Raycast Extension and Native Messaging Host

**Options (ranked by simplicity):**

1. **HTTP on localhost** — Raycast extension does fetch to http://localhost:PORT/tabs. Simple, well-understood, easy to debug. The native host runs as a persistent background process.

2. **Unix domain socket** — Similar to HTTP but uses a file-based socket. Slightly more secure (not exposed on network). Requires socket path convention.

3. **Direct stdin/stdout invocation** — Raycast extension spawns the native host process each time. Simpler lifecycle but slower (process startup per request). The native host would need to wake up the Firefox WebExtension each time.

**Recommendation:** HTTP on localhost is the most practical for Raycast extensions (Raycast's Node.js runtime supports fetch natively, and it aligns with how other Raycast extensions communicate with local services).

---

## 5. Data Flow: "List Tabs, Select, Switch"

```
+---------------+     HTTP GET       +--------------------+    stdin/stdout     +-----------------------+
|   Raycast     |  /tabs             |  Native Messaging  |   native msg       |  Firefox WebExtension |
|  Extension    | ------------------>|      Host           | ------------------>|   (background.js)     |
|  (React UI)   |                    |  (localhost:PORT)   |                    |                       |
|               |                    |                     |   browser.tabs     |                       |
|               |                    |                     |   .query({})       |                       |
|               |                    |                     |<------------------|  Firefox Browser       |
|               |  JSON [{tab}...]   |                     |   JSON response    |                       |
|               |<------------------|                     |                    |                       |
|               |                    |                     |                    |                       |
|  User picks   |  HTTP POST         |                     |   native msg       |                       |
|  a tab        |  /switch           |                     |                    |                       |
|               |  {tabId, windowId} |                     |   browser.tabs     |                       |
|               | ------------------>|                     | ------------------>|  .update(tabId,       |
|               |                    |                     |                    |   {active:true})      |
|               |                    |                     |                    |  browser.windows      |
|               |  200 OK            |                     |                    |  .update(windowId,    |
|               |<------------------|                     |<------------------|   {focused:true})     |
+---------------+                    +--------------------+                    +-----------------------+
```

### Message Format (proposed)

**Request: List tabs**
```
GET http://localhost:26394/tabs
Response:
{
    "tabs": [
      {
        "id": 42,
        "windowId": 1,
        "title": "GitHub - raycast/extensions",
        "url": "https://github.com/raycast/extensions",
        "active": true,
        "favIconUrl": "https://github.com/favicon.ico"
      }
    ]
  }
```

**Request: Switch to tab**
```
POST http://localhost:26394/switch
Body: { "tabId": 42, "windowId": 1 }
Response: { "ok": true }
```

---

## 6. Alternative: Simplified Architecture (No Persistent Host)

A lighter variant removes the persistent HTTP server by having the Raycast extension invoke the native messaging host as a one-shot process.

```
Raycast Extension  --spawn-->  native-host-cli  --stdin/stdout-->  Firefox WebExtension
```

**Problem:** Native messaging hosts are launched BY Firefox in response to browser.runtime.connectNative(). The Raycast extension cannot directly invoke the native messaging channel. The WebExtension initiates the connection, not the external process.

**This means** the data flow must be:
- The WebExtension establishes a persistent native messaging port on startup
- The native host runs persistently (launched by Firefox when the extension loads)
- The Raycast extension communicates with the native host via IPC (HTTP/socket/file)

OR alternatively:
- The WebExtension periodically dumps tab data to a known file location
- The Raycast extension reads that file
- For write operations (switch tab), the WebExtension polls a "command" file or socket

### Revised Simpler Architecture: File-based IPC

```
Firefox WebExtension  --writes-->  /tmp/raycast-firefox-tabs.json  <--reads--  Raycast Extension
Raycast Extension  --writes-->  /tmp/raycast-firefox-cmd.json  <--polls--  Firefox WebExtension
```

**Pros:** No persistent native host process needed; WebExtension does the work
**Cons:** Polling introduces latency; file locking issues; less clean

---

## 7. Recommended Final Architecture

After analyzing all options, the recommended architecture is:

### Native Messaging Host as Persistent Local Server

```
+----------------+          +---------------------+          +--------------------+
|   Raycast      |   HTTP   |   Native Messaging  |  native  |   Firefox          |
|  Extension     |<-------->|      Host            |<-------->|  WebExtension      |
|  (TypeScript)  | localhost |  (Node.js/Python)   |  msg     |  (background.js)   |
+----------------+          +---------------------+          +--------------------+
                                     |
                             Launched by Firefox
                             when WebExtension loads
```

**Lifecycle:**
1. User installs the Firefox WebExtension (from AMO or as a temporary add-on during dev)
2. On load, the WebExtension calls browser.runtime.connectNative("raycast_firefox") — this launches the native messaging host
3. The native messaging host starts an HTTP server on localhost:PORT
4. When the user invokes the Raycast command, it sends HTTP requests to localhost:PORT
5. The native host relays requests/responses between HTTP and the native messaging stdin/stdout channel
6. When Firefox closes, the native messaging connection drops and the host process exits

---

## 8. Build Order (Dependencies)

### Phase 1: Firefox WebExtension (foundation)
- Build manifest.json with nativeMessaging permission and tabs permission
- Implement background.js that:
  - Connects to native messaging host
  - Listens for messages (list-tabs, switch-tab)
  - Responds with data from browser.tabs.query() and browser.tabs.update()
- Test with a simple native messaging host stub

### Phase 2: Native Messaging Host
- Build the host executable (Node.js recommended — same language as Raycast extension)
- Implement stdin/stdout native messaging protocol (length-prefixed JSON, per Mozilla spec)
- Implement HTTP server on localhost
- Create the native messaging host manifest JSON
- Create installation script to register the manifest with Firefox
- Test end-to-end: WebExtension <-> Native Host <-> HTTP client (curl)

### Phase 3: Raycast Extension
- Scaffold Raycast extension with create-raycast-extension
- Implement search-tabs command
- Implement HTTP client to talk to native messaging host
- Implement fuzzy search over tab titles and URLs
- Implement "switch to tab" action
- Handle error states (Firefox not running, host not running, extension not installed)

### Phase 4: Packaging and Installation
- Installer script that:
  - Copies native messaging host to a known location
  - Registers the native messaging host manifest with Firefox
  - Provides instructions for installing the Firefox WebExtension
- First-run experience in Raycast extension (detect if native host is available, guide setup)

### Dependency Graph
```
Phase 1 (WebExtension) --> Phase 2 (Native Host) --> Phase 3 (Raycast Extension) --> Phase 4 (Packaging)
         |                          |                           |
         +---------- can develop in parallel -------------------+
                     (with mocked interfaces)
```

Note: Phases 1-3 can be developed somewhat in parallel using mocked interfaces. The WebExtension can be tested with a mock native host; the Raycast extension can be tested with a mock HTTP server.

---

## 9. Technology Choices

| Component | Recommended Technology | Rationale |
|-----------|----------------------|-----------|
| Raycast Extension | TypeScript + React | Required by Raycast |
| Firefox WebExtension | JavaScript (Manifest V2) | Firefox still supports MV2 well; MV2 background scripts are persistent (needed for native messaging) |
| Native Messaging Host | Node.js (TypeScript) | Same language as Raycast extension; reduces context switching; Node.js handles stdin/stdout and HTTP easily |
| IPC | HTTP on localhost | Simplest for Raycast to consume; easy to debug with curl; no special libraries needed |
| Port | Fixed port (e.g., 26394) or dynamic with discovery file | Fixed is simpler; discovery file is more robust |

### Firefox Manifest V2 vs V3 Note
Firefox Manifest V3 uses event pages (non-persistent background scripts) which complicates native messaging — the background script may be suspended, dropping the native messaging connection. **Use Manifest V2** for the Firefox WebExtension to ensure the background script (and native messaging connection) stays alive while Firefox is running.

---

## 10. Security and Privacy Considerations

- **All communication is local** — HTTP server bound to 127.0.0.1 only
- **No data leaves the machine** — tab titles and URLs stay local
- **Native messaging host only runs when Firefox is running** — no orphan processes
- **Port security** — any local process can connect to localhost:PORT. Mitigate with a random auth token stored in a file readable only by the user, passed as a header
- **Firefox WebExtension permissions** — minimal: tabs (for listing), nativeMessaging (for the bridge). No host permissions or content script permissions needed

---

## 11. Risks and Open Questions

| Risk | Mitigation |
|------|------------|
| User setup friction (3 components to install) | Good installer script + first-run detection in Raycast extension |
| Native messaging host may not start reliably | Health check endpoint; Raycast extension shows clear error if unreachable |
| Firefox MV3 migration may break persistent background scripts | Use MV2 for now; Firefox has committed to long-term MV2 support |
| Port conflicts on localhost | Use a high, unusual port number; consider dynamic port with discovery file |
| Session restoration (Firefox restart) | WebExtension reconnects native messaging on startup; native host restarts |

### Open Questions for Further Research
1. What port number to use? (Check IANA unassigned ranges)
2. Should the native host be Node.js or a compiled binary (Go/Rust) for easier distribution?
3. Can the Raycast extension detect if Firefox is running before attempting connection?
4. How to handle multiple Firefox profiles?
5. What is the exact native messaging protocol format? (Length-prefixed 4-byte native-endian + JSON)

---

*Researched: 2026-02-06*
*Confidence: High for the overall architecture; the native messaging approach is well-established and used by many Firefox-adjacent tools (e.g., browserpass, KeePassXC-Browser, Tridactyl).*
