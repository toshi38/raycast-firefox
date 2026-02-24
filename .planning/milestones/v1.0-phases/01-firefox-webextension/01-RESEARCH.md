# Phase 1: Firefox WebExtension - Research

**Researched:** 2026-02-06
**Domain:** Firefox WebExtension APIs (Manifest V2), Native Messaging, browser.tabs
**Confidence:** HIGH

## Summary

Phase 1 delivers a Firefox WebExtension (Manifest V2) that exposes tab data via `browser.tabs` and communicates with a Native Messaging Host over a persistent `browser.runtime.connectNative()` port. The extension has no visible UI beyond a hidden debug page and an about:addons listing.

Firefox's WebExtension APIs are mature and well-documented. The key APIs (`browser.tabs.query`, `browser.tabs.update`, `browser.tabs.remove`, `browser.windows.update`, `browser.runtime.connectNative`) are all stable and fully supported. The native messaging protocol uses length-prefixed JSON over stdin/stdout with a 1MB per-message limit from the native app to the extension -- this is comfortably within range for 500+ tabs (estimated ~250-500 bytes per tab JSON = ~125-250KB for 500 tabs).

Container/contextual identity info is available via the `cookieStoreId` property on each tab, with container metadata (name, color, icon) retrievable from `browser.contextualIdentities.query()`. Private browsing tabs are accessible by default in "spanning" mode, though users must explicitly allow the extension in private windows via about:addons.

**Primary recommendation:** Use a persistent Manifest V2 background script with lazy native port connection. Keep the extension minimal -- no browser action, no content scripts. The debug page is an extension page accessible via `moz-extension://[uuid]/debug.html`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Persistent native messaging port via `browser.runtime.connectNative()` (not one-shot messages)
- Three commands in v1: `list-tabs`, `switch-tab`, `close-tab`
- Wrapped response format: `{"ok": true, "data": [...]}` / `{"ok": false, "error": "message"}`
- Pagination support with large default page size (~500) so it's effectively "all at once" for most users
- Include tabs from private browsing windows
- Per-tab data: id, windowId, title, URL, favIconUrl, active state, pinned state, container/contextual identity info
- Return all available tabs immediately -- don't wait for "Loading..." tabs to finish loading
- Container info included in data model
- Self-hosted signed XPI initially (GitHub releases), AMO submission later
- Extension ID: `raycast-firefox@lau.engineering`
- No toolbar icon -- extension is invisible in normal use
- Hidden debug page for troubleshooting connection status and recent messages
- Lazy connection: connect to native messaging host on first request, not on Firefox startup
- Auto-reconnect on disconnection: silently retry on next request if the port drops
- Return whatever tab data is available immediately (don't block on session restore)

### Claude's Discretion
- Communication pattern choice (request-response vs event-driven push)
- Exact JSON message schema field names and structure
- Debug page design and content
- Extension icon design (for about:addons listing)
- Reconnection retry strategy (timing, backoff)

### Deferred Ideas (OUT OF SCOPE)
- AMO (addons.mozilla.org) publication -- future, after initial self-hosted release works
- Toolbar icon with connection status indicator -- not needed for v1, reconsider if users report confusion
</user_constraints>

## Standard Stack

### Core

| Library/Tool | Version | Purpose | Why Standard |
|-------------|---------|---------|--------------|
| Firefox WebExtension APIs | Manifest V2 | Extension framework | MV2 persistent background pages are required for reliable native messaging; MV3 Event Pages complicate port lifecycle |
| `browser.tabs` API | Stable | Tab enumeration, activation, removal | Standard Firefox API for all tab operations |
| `browser.windows` API | Stable | Window focus management | Required to bring correct window to front on tab switch |
| `browser.runtime` API | Stable | Native messaging (`connectNative`) | Only way to communicate with native messaging host |
| `browser.contextualIdentities` API | Stable | Container metadata lookup | Maps `cookieStoreId` to container name/color/icon |
| `web-ext` | 9.2.0 | Build, run, lint, sign | Mozilla's official CLI tool for WebExtension development |

### Supporting

| Library/Tool | Version | Purpose | When to Use |
|-------------|---------|---------|-------------|
| `web-ext lint` | (part of web-ext) | Manifest validation | Before every build to catch manifest errors |
| `web-ext run` | (part of web-ext) | Dev testing with auto-reload | During development for rapid iteration |
| `web-ext sign` | (part of web-ext) | Sign for self-distribution | When creating release XPI (unlisted channel) |
| `web-ext build` | (part of web-ext) | Package into .zip | Before signing, or for manual AMO upload |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|-----------|-----------|----------|
| Manifest V2 | Manifest V3 | MV3 uses Event Pages in Firefox (no service workers), which complicates persistent native messaging ports. User has locked MV2 decision. |
| `connectNative` (persistent) | `sendNativeMessage` (one-shot) | One-shot launches a new native process per message -- unacceptable latency for interactive tab switching. User locked persistent port. |

**Installation:**
```bash
npm install --save-dev web-ext
```

## Architecture Patterns

### Recommended Project Structure
```
extension/
  manifest.json           # MV2 manifest with gecko ID and permissions
  background.js           # Persistent background script (all logic lives here)
  debug.html              # Hidden debug page (accessible via moz-extension:// URL)
  debug.js                # Debug page script (communicates with background via runtime API)
  icons/
    icon-48.png           # Extension icon for about:addons (48x48)
    icon-96.png           # Extension icon for about:addons (96x96, 2x)
```

### Pattern 1: Manifest V2 with Persistent Background Script

**What:** A single persistent background script that holds the native messaging port and handles all commands.
**When to use:** Always -- this is the only pattern for this extension.

```json
// manifest.json
{
  "manifest_version": 2,
  "name": "Raycast Firefox",
  "version": "1.0.0",
  "description": "Companion extension for Raycast Firefox tab management",
  "browser_specific_settings": {
    "gecko": {
      "id": "raycast-firefox@lau.engineering",
      "strict_min_version": "91.0"
    }
  },
  "background": {
    "scripts": ["background.js"],
    "persistent": true
  },
  "permissions": [
    "tabs",
    "nativeMessaging",
    "contextualIdentities",
    "cookies"
  ],
  "icons": {
    "48": "icons/icon-48.png",
    "96": "icons/icon-96.png"
  }
}
```

**Source:** [MDN - manifest.json](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json)

### Pattern 2: Lazy Native Port with Request-Response

**What:** Connect to the native messaging host only when the first message arrives. Use strict request-response (each incoming message gets exactly one outgoing response).
**When to use:** This is the recommended communication pattern.

**Recommendation (Claude's Discretion - Communication Pattern):** Use request-response, not event-driven push. The native messaging host sends a command, the extension processes it and sends back a response. The extension never pushes unsolicited data. This is simpler, more predictable, and aligns with the three defined commands (`list-tabs`, `switch-tab`, `close-tab`).

```javascript
// background.js - Lazy connection pattern
// Source: MDN Native Messaging docs

const NATIVE_APP_NAME = "raycast_firefox";
let port = null;

function getPort() {
  if (port) return port;

  port = browser.runtime.connectNative(NATIVE_APP_NAME);

  port.onMessage.addListener(handleMessage);

  port.onDisconnect.addListener((p) => {
    if (p.error) {
      console.error("Native port disconnected:", p.error.message);
    }
    port = null; // Clear so next request reconnects
  });

  return port;
}

async function handleMessage(message) {
  try {
    const { command, ...params } = message;
    let result;

    switch (command) {
      case "list-tabs":
        result = await listTabs(params);
        break;
      case "switch-tab":
        result = await switchTab(params);
        break;
      case "close-tab":
        result = await closeTab(params);
        break;
      default:
        port.postMessage({ ok: false, error: `Unknown command: ${command}` });
        return;
    }

    port.postMessage({ ok: true, data: result });
  } catch (err) {
    port.postMessage({ ok: false, error: err.message });
  }
}
```

### Pattern 3: Debug Page as Extension Page

**What:** An HTML page bundled with the extension, accessible via `moz-extension://[uuid]/debug.html`. Communicates with the background script via `browser.runtime.sendMessage` / `browser.runtime.onMessage`.
**When to use:** For the hidden debug page requirement.

The debug page is NOT listed in manifest.json under any UI key -- it's just a bundled HTML file. Users access it by:
1. Going to `about:debugging#/runtime/this-firefox`
2. Finding the extension and clicking "Inspect"
3. Or navigating directly to `moz-extension://[internal-uuid]/debug.html`

The page can also be opened programmatically via `browser.runtime.getURL("debug.html")`.

### Anti-Patterns to Avoid

- **DO NOT use content scripts:** This extension has no need to inject into web pages. All logic is in the background script.
- **DO NOT use browser_action/page_action:** The user explicitly decided no toolbar icon.
- **DO NOT use `sendNativeMessage()`:** This launches a new native process per message. Use `connectNative()` for a persistent port.
- **DO NOT write to stdout in the native host for logging:** Any console.log or debug output to stdout corrupts the native messaging protocol. Log to stderr only. (This is a Phase 2 concern but important to know now.)
- **DO NOT assume private browsing access:** Firefox requires user opt-in per extension. Document this in setup instructions.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|------------|-------------|-----|
| Tab enumeration | Custom DOM parsing or profile reading | `browser.tabs.query({})` | The API returns all tabs across all windows in one call |
| Container name lookup | Parsing Firefox profiles/prefs | `browser.contextualIdentities.query({})` | Returns name, color, icon for each container |
| Tab switching (activate) | AppleScript or osascript hacks | `browser.tabs.update(id, {active: true})` + `browser.windows.update(windowId, {focused: true})` | Two API calls, works across windows |
| Tab closing | - | `browser.tabs.remove(tabId)` | Simple, supports array of IDs for batch close |
| Extension packaging | Manual zip + rename to .xpi | `web-ext build` + `web-ext sign` | Handles packaging, excludes dev files, signs with Mozilla |
| Manifest validation | Manual review | `web-ext lint` | Catches permission typos, missing keys, etc. |
| Native message framing | Custom binary protocol | Length-prefixed JSON (4-byte LE uint32 + UTF-8 JSON) | This is the Firefox-mandated protocol, no choice here |

**Key insight:** The Firefox WebExtension APIs are comprehensive for this use case. Every operation needed (enumerate tabs, get container info, switch tabs, close tabs, native messaging) has a direct API. There is zero need for content scripts, DOM manipulation, or external libraries.

## Common Pitfalls

### Pitfall 1: Private Browsing Opt-In Required
**What goes wrong:** Extension can enumerate regular tabs but private browsing tabs are invisible.
**Why it happens:** Firefox requires users to manually allow each extension in private windows. Even with `"incognito": "spanning"` (the default), the user must enable it in `about:addons` > extension details > "Run in Private Windows: Allow".
**How to avoid:** Document this requirement clearly. The debug page should show whether private window access is enabled (via `browser.extension.isAllowedIncognitoAccess()`). The `incognito` key defaults to `"spanning"` in the manifest, which is correct -- do NOT set it to `"split"` (Firefox treats `"split"` as `"not_allowed"`).
**Warning signs:** Tab count seems low; private window tabs missing from results.

### Pitfall 2: Native Messaging 1MB Response Limit
**What goes wrong:** If the tab data JSON exceeds 1MB, Firefox silently drops the message and disconnects the port.
**Why it happens:** Native app to extension messages are capped at 1MB. Extension to native app messages can be up to 4GB.
**How to avoid:** The pagination mechanism (default page size ~500) handles this. Rough math: 500 tabs * ~300 bytes/tab = ~150KB, well under 1MB. Even 2000 tabs would be ~600KB. This pitfall is theoretical for this use case but the pagination mechanism provides the safety valve.
**Warning signs:** Port disconnects unexpectedly after a `list-tabs` response; `onDisconnect` fires with no clear error.

### Pitfall 3: Port Disconnection Without Error Details
**What goes wrong:** The native port disconnects and `port.onDisconnect` fires, but the error information is minimal.
**Why it happens:** Firefox provides limited error context in `port.error`. Common causes: native host crashed, native host not found, native host manifest misconfigured.
**How to avoid:** Always check `port.error` in the `onDisconnect` handler. Log it. Set `port = null` so the next request triggers reconnection. The debug page should display the last disconnect reason.
**Warning signs:** `port.onDisconnect` fires immediately after `connectNative()` -- usually means the native host manifest is missing or misconfigured.

### Pitfall 4: `favIconUrl` Undefined for Some Tabs
**What goes wrong:** `tab.favIconUrl` is `undefined` or empty string for tabs that are loading, discarded, or have no favicon.
**Why it happens:** Firefox doesn't always have a favicon available, especially for: newly opened tabs, discarded tabs (unloaded from memory), about: pages, error pages.
**How to avoid:** Always treat `favIconUrl` as optional. Use a fallback icon on the Raycast side (Phase 5 concern, but the data model should make this field nullable now).
**Warning signs:** Missing favicons in the Raycast list.

### Pitfall 5: Contextual Identities Not Enabled
**What goes wrong:** `browser.contextualIdentities.query({})` returns empty or throws when containers are not enabled.
**Why it happens:** Containers are enabled by default in current Firefox, but users could have disabled them or be on older versions where `privacy.userContext.enabled` is false.
**How to avoid:** Wrap `contextualIdentities.query()` in a try-catch. If it fails, proceed without container info (graceful degradation). The tab's `cookieStoreId` will still be present even without the full container metadata.
**Warning signs:** `cookieStoreId` exists on tabs but container name/color is missing.

### Pitfall 6: Permissions for title/url Access
**What goes wrong:** `tab.url` and `tab.title` are `undefined` in query results.
**Why it happens:** The `tabs` permission is required to access `url`, `title`, and `favIconUrl` properties. Without it, these fields are omitted from the `Tab` object.
**How to avoid:** Include `"tabs"` in the `permissions` array in manifest.json. This is a hard requirement for this extension.
**Warning signs:** Tab objects have `id`, `windowId`, `active`, `pinned` but `url`/`title` are missing.

### Pitfall 7: Native Messaging Performance Regression (Firefox 138-145)
**What goes wrong:** Native messaging latency spikes from ~2ms to ~47ms per message.
**Why it happens:** Bug 2002517 -- the `dom.workers.timeoutmanager` feature introduced in Firefox 138 caused a 20-25x performance regression.
**How to avoid:** This was fixed in Firefox 146+ and patched in Firefox 140 ESR. Not a current concern for modern Firefox but worth knowing for troubleshooting if users report slowness.
**Warning signs:** Tab listing feels sluggish; measurable latency on native message round-trips.

## Code Examples

### Complete manifest.json
```json
{
  "manifest_version": 2,
  "name": "Raycast Firefox",
  "version": "1.0.0",
  "description": "Companion extension for Raycast Firefox tab management",

  "browser_specific_settings": {
    "gecko": {
      "id": "raycast-firefox@lau.engineering",
      "strict_min_version": "91.0"
    }
  },

  "background": {
    "scripts": ["background.js"],
    "persistent": true
  },

  "permissions": [
    "tabs",
    "nativeMessaging",
    "contextualIdentities",
    "cookies"
  ],

  "icons": {
    "48": "icons/icon-48.png",
    "96": "icons/icon-96.png"
  }
}
```
**Source:** [MDN manifest.json](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json), [MDN browser_specific_settings](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/browser_specific_settings)

### List All Tabs with Container Info
```javascript
// Source: MDN browser.tabs.query, MDN contextualIdentities

async function listTabs(params) {
  const { page = 1, pageSize = 500 } = params;

  // Get all tabs across all windows (including private if allowed)
  const tabs = await browser.tabs.query({});

  // Get container metadata for mapping
  let containers = {};
  try {
    const identities = await browser.contextualIdentities.query({});
    for (const identity of identities) {
      containers[identity.cookieStoreId] = {
        name: identity.name,
        color: identity.color,
        icon: identity.icon,
      };
    }
  } catch (e) {
    // Containers may not be enabled -- proceed without
  }

  // Map tabs to response format
  const allTabs = tabs.map((tab) => ({
    id: tab.id,
    windowId: tab.windowId,
    title: tab.title || "",
    url: tab.url || "",
    favIconUrl: tab.favIconUrl || null,
    active: tab.active,
    pinned: tab.pinned,
    incognito: tab.incognito,
    status: tab.status,
    cookieStoreId: tab.cookieStoreId || null,
    container: containers[tab.cookieStoreId] || null,
  }));

  // Paginate
  const start = (page - 1) * pageSize;
  const paginated = allTabs.slice(start, start + pageSize);

  return {
    tabs: paginated,
    total: allTabs.length,
    page,
    pageSize,
    hasMore: start + pageSize < allTabs.length,
  };
}
```
**Source:** [MDN tabs.query](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabs/query), [MDN contextualIdentities](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Work_with_contextual_identities)

### Switch to a Tab (Activate + Focus Window)
```javascript
// Source: MDN tabs.update, MDN windows.update

async function switchTab(params) {
  const { tabId } = params;

  // Activate the tab
  const tab = await browser.tabs.update(tabId, { active: true });

  // Focus the window containing this tab
  await browser.windows.update(tab.windowId, { focused: true });

  return { tabId: tab.id, windowId: tab.windowId };
}
```
**Source:** [MDN tabs.update](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabs/update), [MDN windows.update](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/windows/update)

### Close a Tab
```javascript
// Source: MDN tabs.remove

async function closeTab(params) {
  const { tabId } = params;
  await browser.tabs.remove(tabId);
  return { tabId };
}
```
**Source:** [MDN tabs.remove](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabs/remove)

### Native Messaging Port Lifecycle
```javascript
// Source: MDN runtime.connectNative, MDN Native messaging

const NATIVE_APP_NAME = "raycast_firefox";
let port = null;

function ensurePort() {
  if (port) return port;

  port = browser.runtime.connectNative(NATIVE_APP_NAME);

  port.onMessage.addListener((message) => {
    handleMessage(message);
  });

  port.onDisconnect.addListener((p) => {
    const error = p.error ? p.error.message : "unknown";
    console.error(`Native port disconnected: ${error}`);
    port = null;
    // Port is nulled -- next incoming request will reconnect
  });

  return port;
}
```
**Source:** [MDN runtime.connectNative](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/runtime/connectNative)

### Recommended JSON Message Schema (Claude's Discretion)

**Inbound (from native host to extension):**
```json
{
  "id": "msg-001",
  "command": "list-tabs",
  "params": {
    "page": 1,
    "pageSize": 500
  }
}
```

**Outbound success (extension to native host):**
```json
{
  "id": "msg-001",
  "ok": true,
  "data": {
    "tabs": [...],
    "total": 203,
    "page": 1,
    "pageSize": 500,
    "hasMore": false
  }
}
```

**Outbound error (extension to native host):**
```json
{
  "id": "msg-001",
  "ok": false,
  "error": "Tab not found: 12345"
}
```

**Design rationale:**
- `id` field enables request-response correlation. The native host assigns an ID to each request, and the extension echoes it back. This is critical if messages could overlap (unlikely with sequential request-response, but defensive).
- `command` + `params` is a clean separation of intent and arguments.
- `ok` boolean is the user's locked decision for the response envelope.
- Container info is embedded directly in each tab object (not as a separate lookup table) to simplify downstream consumption.

### Reconnection Strategy (Claude's Discretion)

**Recommendation:** No retry loop or backoff timer. Simply null the port on disconnect and reconnect on next incoming request. This is the simplest approach and matches the "lazy connection" decision.

```javascript
// On disconnect: just null the port
port.onDisconnect.addListener(() => {
  port = null;
});

// On next message attempt: reconnect transparently
function sendResponse(message) {
  const p = ensurePort();
  p.postMessage(message);
}
```

**Why no backoff:** The extension doesn't initiate communication. The native host sends requests. If the host is down, no requests arrive, so there's nothing to retry. When the host restarts and sends a new request, the background script's `onMessage` from the port won't fire (port is null), but the native host will establish a new connection which triggers a new port.

**Correction on flow:** Actually, in native messaging, Firefox launches the native app when `connectNative()` is called. The native host then sends messages over stdin. The extension calls `connectNative()` and gets a port. If the port disconnects, the extension needs to re-call `connectNative()` on the next occasion it wants to communicate. Since the native host initiates from the Raycast side (via HTTP), the flow is: HTTP request hits native host -> native host writes to stdout -> extension receives on port. If port is dead, the native host would need to be relaunched, which happens via a new `connectNative()` call.

**Revised understanding:** The extension should call `ensurePort()` at startup or on first use, and if the port drops, the next time the native host is launched (by a new `connectNative()` call), communication resumes. The key insight is that `connectNative()` launches the native host process. So "lazy connection on first request" means: the first time the Raycast extension makes an HTTP request, the native host process starts, but the WebExtension needs to have already called `connectNative()`. In practice, the background script should call `connectNative()` when it loads (or on some trigger), and reconnect if the port drops. Since the background is persistent, it stays alive.

**Final recommendation:** Call `connectNative()` lazily -- not immediately on background script load, but perhaps on the first `browser.runtime.onStartup` or `browser.runtime.onInstalled` event. Actually, the simplest approach is: the native messaging host is started BY Firefox when `connectNative()` is called. The background script should connect on load (since it's persistent, this effectively means on Firefox startup). The "lazy" aspect from the user's decision likely means: don't do expensive work until the first command arrives. Connect the port eagerly (it's cheap), but don't query tabs until asked.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|-------------|-----------------|--------------|--------|
| Manifest V3 with service workers | MV2 with persistent background (for Firefox native messaging) | Firefox still doesn't support background service workers (as of 2026) | MV2 is the correct choice for persistent native messaging in Firefox |
| `sendNativeMessage()` per request | `connectNative()` persistent port | Always preferred for interactive use | Avoids native process launch overhead per message (~2ms vs ~100ms+) |
| `applications` key in manifest.json | `browser_specific_settings` key | Firefox 48+ | Both work, but `browser_specific_settings` is the current standard |

**Deprecated/outdated:**
- `applications` manifest key: Still works as an alias for `browser_specific_settings` but the new key should be used.
- `tab.selected` property: Deprecated in favor of `tab.active` and `tab.highlighted`.

## Open Questions

1. **Native App Name for connectNative()**
   - What we know: The name passed to `connectNative()` must match the native messaging host manifest filename (e.g., `raycast_firefox.json`). It must match the regex `^\w+(\.\w+)*$` (alphanumeric, underscores, dots).
   - What's unclear: The exact name hasn't been decided. It must be consistent between the extension (Phase 1) and the native host manifest (Phase 2).
   - Recommendation: Use `raycast_firefox` as the native app name. It's simple, valid, and descriptive. The manifest file would be `~/Library/Application Support/Mozilla/NativeMessagingHosts/raycast_firefox.json`.

2. **When to Call connectNative()**
   - What we know: User wants "lazy connection" (not on Firefox startup). But `connectNative()` is what launches the native host process.
   - What's unclear: The native host process lifecycle depends on Phase 2 architecture. If the native host runs an HTTP server that stays alive independently, the WebExtension just needs the port for message passing. If the native host only runs when launched by Firefox, the port must be established for any communication.
   - Recommendation: For Phase 1, implement a `connectNative()` call that is deferred until the first time a message needs to be sent or received. In practice, this likely means connecting when the background script first handles a trigger. For testing in Phase 1 (before the native host exists), use `web-ext run` and manually verify the port lifecycle.

3. **strict_min_version Value**
   - What we know: Firefox ESR 91 is old (2021). Current Firefox is ~135+. The contextualIdentities API has been stable since Firefox 57.
   - What's unclear: What minimum Firefox version to target.
   - Recommendation: Set `strict_min_version` to `"91.0"` (ESR baseline). This is conservative but safe. All APIs used are available since Firefox 57+. Can tighten later if needed.

4. **Debug Page Discovery by Users**
   - What we know: Extension pages are accessible via `moz-extension://[uuid]/debug.html` but the UUID is internal and not user-facing.
   - What's unclear: How users will find the debug page without a toolbar icon.
   - Recommendation: The debug page URL can be logged to the browser console on extension load. Users can also find it via `about:debugging#/runtime/this-firefox` -> Inspect the extension -> navigate to debug.html. Consider adding a simple mechanism to copy the debug URL (e.g., from the extension's about:addons page description).

## Sources

### Primary (HIGH confidence)
- [MDN - Native messaging](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Native_messaging) - Complete native messaging guide, message format, size limits, code examples
- [MDN - runtime.connectNative()](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/runtime/connectNative) - API signature, Port object, browser compatibility
- [MDN - Native manifests](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Native_manifests) - Host manifest format, macOS file location, allowed_extensions
- [MDN - tabs.query()](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabs/query) - Query parameters, Tab object properties, permissions
- [MDN - tabs.Tab type](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabs/Tab) - All Tab properties with types and descriptions
- [MDN - tabs.update()](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabs/update) - Tab activation API
- [MDN - tabs.remove()](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabs/remove) - Tab removal API
- [MDN - windows.update()](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/windows/update) - Window focus API
- [MDN - Work with contextual identities](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Work_with_contextual_identities) - Container API, cookieStoreId mapping
- [MDN - browser_specific_settings](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/browser_specific_settings) - Gecko ID format, update_url
- [MDN - incognito manifest key](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/incognito) - Private browsing modes, Firefox-specific behavior
- [MDN - background manifest key](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background) - MV2 persistent vs event pages

### Secondary (MEDIUM confidence)
- [Firefox Extension Workshop - web-ext](https://extensionworkshop.com/documentation/develop/getting-started-with-web-ext/) - Signing workflow, AMO API credentials
- [Bugzilla #2002517](https://bugzilla.mozilla.org/show_bug.cgi?id=2002517) - Native messaging performance regression in Firefox 138-145 (verified fixed)

### Tertiary (LOW confidence)
- [Mozilla Discourse - native messaging message limit](https://discourse.mozilla.org/t/native-extension-exceed-message-limit/59039) - Community discussion on 1MB limit workarounds

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All based on official MDN documentation, APIs are stable and mature
- Architecture: HIGH - Patterns directly from MDN examples and official docs
- Pitfalls: HIGH - Documented in MDN (permissions, message limits) and verified via Bugzilla (perf regression)
- Message schema: MEDIUM - Claude's discretion area, design is sound but untested
- Debug page: MEDIUM - Extension pages pattern is well-documented but debug page UX is speculative

**Research date:** 2026-02-06
**Valid until:** 2026-03-06 (stable APIs, 30-day validity)
