# Phase 4: Tab Switching - Research

**Researched:** 2026-02-07
**Domain:** Raycast Action/ActionPanel wiring, HTTP POST from Raycast, Firefox window focus (browser.windows.update + NSRunningApplication)
**Confidence:** HIGH

## Summary

Phase 4 wires the Raycast "Search Firefox Tabs" list to the existing `POST /switch` HTTP endpoint built in Phase 2. The backend is already complete: the native host's `handleSwitchTab` function accepts `{ tabId, windowId }`, forwards the command to the WebExtension which calls `browser.tabs.update(tabId, { active: true })` and `browser.windows.update(tab.windowId, { focused: true })`, then the host raises Firefox via `NSRunningApplication.activateWithOptions(2)`. No new server-side code is needed.

The Raycast-side work involves adding an `ActionPanel` with a primary `Action` to each `List.Item`, where the action handler makes an HTTP POST to `/switch`, then calls `closeMainWindow()` to dismiss Raycast. The `getFavicon` utility from `@raycast/utils` can enhance tab items with website icons. Multi-window scenarios work because the WebExtension uses `browser.windows.update` with `focused: true`, which brings the correct window to the front, and the native host then activates the Firefox application.

**Primary recommendation:** Add an `ActionPanel` with a single primary `Action` to each `List.Item`. The action's `onAction` handler should: (1) call `closeMainWindow({ clearRootSearch: true })` immediately, (2) POST to `/switch` with `{ tabId, windowId }`. Close the window first for responsiveness -- the HTTP call is fire-and-forget from the user's perspective.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@raycast/api` | `^1.104` | `Action`, `ActionPanel`, `closeMainWindow`, `showHUD`, `Icon` | Already installed; provides all UI primitives needed |
| `@raycast/utils` | `^2.2` | `getFavicon` for tab icons, `useFetch` (already used) | Already installed; favicon display enhances UX |
| Node.js built-in `fetch` | N/A | HTTP POST to `/switch` endpoint | Raycast runs Node.js 22 with global `fetch`; no extra dependency needed |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `browser.tabs.update` | WebExtensions API | Activate target tab | Already implemented in `extension/background.js` |
| `browser.windows.update` | WebExtensions API | Focus target window | Already implemented in `extension/background.js` |
| `NSRunningApplication` | macOS AppKit | Bring Firefox app to foreground | Already implemented in `native-host/src/server.js` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Raw `fetch` for POST | `useFetch` with `execute: false` + `revalidate` | `useFetch` is designed for GET data loading with React state; a simple one-shot POST is better as raw `fetch` in the action handler |
| `closeMainWindow` | `popToRoot` | `closeMainWindow` dismisses Raycast entirely (correct for tab switching); `popToRoot` keeps the window open |
| `showHUD` after switch | `showToast` | `showHUD` auto-closes Raycast window; but since we already call `closeMainWindow`, a toast is unnecessary and would not be visible anyway |

**Installation:**
```bash
# No new packages needed -- all dependencies already installed in raycast-extension/
```

## Architecture Patterns

### Existing Code to Modify
```
raycast-extension/
└── src/
    └── search-tabs.tsx    # ADD: ActionPanel + Action to each List.Item
                           # ADD: imports for Action, ActionPanel, Icon, closeMainWindow
                           # ADD: switchTab() async handler function
                           # OPTIONAL: getFavicon for tab icons
```

### Pattern 1: Action Handler with closeMainWindow
**What:** The primary action on each list item calls `closeMainWindow` first, then fires the HTTP POST. Closing the window immediately makes the switch feel instant.
**When to use:** Always -- this is the standard Raycast pattern for "switch to external app" actions.
**Example:**
```typescript
// Source: Raycast API docs + community browser extension patterns
import { Action, ActionPanel, Icon, List, closeMainWindow } from "@raycast/api";

async function switchTab(tabId: number, windowId: number) {
  await closeMainWindow({ clearRootSearch: true });
  await fetch(`http://127.0.0.1:${port}/switch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tabId, windowId }),
  });
}

// In the List.Item:
<List.Item
  key={String(tab.id)}
  title={tab.title || "Untitled"}
  subtitle={tab.url}
  keywords={urlKeywords(tab.url)}
  actions={
    <ActionPanel>
      <Action
        title="Switch to Tab"
        icon={Icon.Globe}
        onAction={() => switchTab(tab.id, tab.windowId)}
      />
    </ActionPanel>
  }
/>
```

### Pattern 2: Error Handling in Action Handler
**What:** Wrap the HTTP POST in try/catch and show a toast on failure. Since `closeMainWindow` was already called, use `showHUD` to surface errors.
**When to use:** For resilience when the native host is not running or the bridge times out.
**Example:**
```typescript
import { showHUD } from "@raycast/api";

async function switchTab(tabId: number, windowId: number) {
  await closeMainWindow({ clearRootSearch: true });
  try {
    const response = await fetch(`http://127.0.0.1:${port}/switch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tabId, windowId }),
    });
    if (!response.ok) {
      const body = await response.json();
      await showHUD(`Failed to switch tab: ${body.error}`);
    }
  } catch (error) {
    await showHUD("Could not connect to Firefox bridge");
  }
}
```

### Pattern 3: Multi-window Tab Switch Flow
**What:** The full flow for switching to a tab in a different Firefox window.
**When to use:** Understanding the end-to-end chain for multi-window validation.
```
User presses Enter on tab
  -> Raycast: closeMainWindow() (Raycast dismisses)
  -> Raycast: POST /switch { tabId: 42, windowId: 7 }
  -> Native Host: sendRequest('switch-tab', { tabId: 42, windowId: 7 })
  -> WebExtension: browser.tabs.update(42, { active: true })
  -> WebExtension: browser.windows.update(7, { focused: true })
    (Firefox internally focuses window 7 and activates tab 42)
  -> Native Host: receives success response
  -> Native Host: execFile('osascript', ...) -> NSRunningApplication.activateWithOptions(2)
    (macOS brings Firefox to the foreground)
```
**Key insight:** `browser.windows.update({ focused: true })` handles the within-Firefox window switching. `NSRunningApplication.activateWithOptions(2)` handles the macOS-level app activation. Together they ensure the correct window with the correct tab is in front.

### Anti-Patterns to Avoid
- **Waiting for POST response before closing window:** Do NOT `await fetch(...)` then `closeMainWindow()`. The user sees a delay. Close the window first -- the HTTP call takes ~50-100ms but the user doesn't need to see it.
- **Using `showToast` after `closeMainWindow`:** Toasts are not visible after the window is closed. Use `showHUD` if you need to display a message.
- **Omitting `windowId` from the POST body:** The `/switch` endpoint accepts `windowId` optionally, but the WebExtension uses `tab.windowId` from the `browser.tabs.update` result. For cross-window switching, always send `windowId` so the server doesn't have to look it up.
- **Creating a separate command for tab switching:** Tab switching is an action ON the search results, not a separate command. It belongs as the primary `Action` in the existing `search-tabs.tsx` command.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Window dismissal | Custom window management | `closeMainWindow({ clearRootSearch: true })` | Raycast API handles cleanup, search bar clearing, pop-to-root |
| Favicon display | Custom favicon fetching/caching | `getFavicon(url)` from `@raycast/utils` | Handles Google favicon API, fallback icons, caching |
| macOS app activation | New osascript logic | Existing `NSRunningApplication.activateWithOptions(2)` in server.js | Already implemented in Phase 2, fires automatically on POST /switch |
| Tab activation + window focus | New WebExtension code | Existing `handleSwitchTab` in background.js | Already calls `browser.tabs.update` + `browser.windows.update` |
| HTTP response correlation | Custom request tracking | Existing bridge.js with `crypto.randomUUID()` correlation | Already handles request-response matching with timeouts |

**Key insight:** The entire backend for tab switching is already implemented. Phase 4 is purely a Raycast UI wiring task -- adding ActionPanel/Action to List.Item and making an HTTP POST call.

## Common Pitfalls

### Pitfall 1: Closing Window After HTTP Call (Perceived Latency)
**What goes wrong:** User presses Enter, sees Raycast freeze for 100-200ms before it closes, then Firefox activates.
**Why it happens:** The code awaits the HTTP POST response before calling `closeMainWindow()`.
**How to avoid:** Call `closeMainWindow()` FIRST, then fire the HTTP POST. The user perceives instant switching.
**Warning signs:** Visible delay between pressing Enter and Raycast closing.

### Pitfall 2: Missing windowId in POST Body
**What goes wrong:** Tab switches correctly in single-window setups but fails or activates the wrong window in multi-window setups.
**Why it happens:** The `windowId` is available in the tab data but not sent in the POST body.
**How to avoid:** Always include both `tabId` and `windowId` in the POST body. The tab data from the `/tabs` endpoint already includes `windowId` for each tab.
**Warning signs:** Multi-window switching activates the tab but the wrong Firefox window is in front.

### Pitfall 3: stale Tab IDs After Long Idle
**What goes wrong:** User opens Raycast, waits a while, then tries to switch -- gets a 502 error because the tab ID no longer exists (tab was closed in Firefox).
**Why it happens:** Tab data was fetched when the command opened but tabs changed since then.
**How to avoid:** For Phase 4, accept this as a known limitation. The error handling pattern (showHUD on failure) covers it gracefully. Phase 7 (error handling) can add automatic refresh.
**Warning signs:** 502 responses from `/switch` with "tabId X not found" errors.

### Pitfall 4: Firefox Not Foregrounded on macOS
**What goes wrong:** The correct tab activates in Firefox but the Firefox application doesn't come to the foreground -- another app stays in front.
**Why it happens:** `browser.windows.update({ focused: true })` only focuses the window within Firefox; it does not bring Firefox itself to the macOS foreground.
**How to avoid:** This is already handled by the `NSRunningApplication.activateWithOptions(2)` call in `handleSwitchTab` in server.js. Verify it works during testing.
**Warning signs:** After switching, you have to manually Cmd+Tab to Firefox.

### Pitfall 5: Action Not Appearing as Primary
**What goes wrong:** Pressing Enter on a list item does nothing or triggers the wrong action.
**Why it happens:** The `Action` component is not the first child of the `ActionPanel`, or the `ActionPanel` is not set as the `actions` prop on `List.Item`.
**How to avoid:** Ensure the "Switch to Tab" action is the FIRST action in the ActionPanel. The first action automatically becomes the primary action (triggered by Enter).
**Warning signs:** Enter key does nothing; user must open action panel and manually select.

## Code Examples

### Complete Updated search-tabs.tsx with Tab Switching
```typescript
// Source: Synthesized from Raycast API docs + existing codebase
import { Action, ActionPanel, Icon, List, closeMainWindow, showHUD } from "@raycast/api";
import { useFetch, getFavicon } from "@raycast/utils";
import { readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

// -- Types matching the native host HTTP API response --

interface Tab {
  id: number;
  windowId: number;
  title: string;
  url: string;
  favIconUrl: string | null;
  active: boolean;
  pinned: boolean;
  incognito: boolean;
  status: string;
  cookieStoreId: string;
  container: { name: string; color: string; icon: string } | null;
}

interface TabsResponse {
  ok: boolean;
  data: {
    tabs: Tab[];
    total: number;
    page: number;
    pageSize: number;
    hasMore: boolean;
  };
  meta: { count: number; timestamp: number };
}

// -- Port discovery --

function getPort(): number {
  try {
    const portPath = join(homedir(), ".raycast-firefox", "port");
    const content = readFileSync(portPath, "utf-8").trim();
    const port = parseInt(content, 10);
    if (Number.isNaN(port) || port <= 0 || port > 65535) {
      return 26394;
    }
    return port;
  } catch {
    return 26394;
  }
}

const port = getPort();

// -- URL keyword extraction --

function urlKeywords(url: string): string[] {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname;
    const hostParts = hostname.split(".").filter(Boolean);
    const pathParts = parsed.pathname.split("/").filter(Boolean);
    return [hostname, ...hostParts, ...pathParts];
  } catch {
    return [url];
  }
}

// -- Tab switching --

async function switchTab(tabId: number, windowId: number) {
  await closeMainWindow({ clearRootSearch: true });
  try {
    const response = await fetch(`http://127.0.0.1:${port}/switch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tabId, windowId }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: "Unknown error" }));
      await showHUD(`Switch failed: ${body.error}`);
    }
  } catch {
    await showHUD("Could not connect to Firefox");
  }
}

// -- Component --

export default function SearchTabs() {
  const { data, isLoading } = useFetch<TabsResponse>(
    `http://127.0.0.1:${port}/tabs`,
    {
      keepPreviousData: true,
    },
  );

  const tabs = data?.data?.tabs ?? [];

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Search Firefox tabs...">
      {tabs.map((tab) => (
        <List.Item
          key={String(tab.id)}
          icon={getFavicon(tab.url)}
          title={tab.title || "Untitled"}
          subtitle={tab.url}
          keywords={urlKeywords(tab.url)}
          actions={
            <ActionPanel>
              <Action
                title="Switch to Tab"
                icon={Icon.Globe}
                onAction={() => switchTab(tab.id, tab.windowId)}
              />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
```

### Minimal Diff from Current search-tabs.tsx
The changes to the existing file are:
1. **Add imports:** `Action`, `ActionPanel`, `Icon`, `closeMainWindow`, `showHUD` from `@raycast/api`; `getFavicon` from `@raycast/utils`
2. **Add function:** `switchTab(tabId, windowId)` async handler
3. **Modify List.Item:** Add `icon={getFavicon(tab.url)}` and `actions={<ActionPanel>...</ActionPanel>}`

### HTTP POST /switch Request/Response Contract
```
POST http://127.0.0.1:{port}/switch
Content-Type: application/json

Request body:
{ "tabId": 42, "windowId": 7 }

Success response (200):
{
  "ok": true,
  "data": { "tabId": 42, "windowId": 7 },
  "meta": { "timestamp": 1707350000000 }
}

Error - missing tabId (400):
{ "ok": false, "error": "tabId is required" }

Error - bridge failure (502):
{ "ok": false, "error": "WebExtension response timeout (2s)" }

Error - invalid JSON (400):
{ "ok": false, "error": "Invalid JSON body" }
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| AppleScript for browser control | WebExtension API + Native Messaging | Standard for Firefox (no AppleScript support) | Our architecture is already using the correct approach |
| `showToast` after closing window | `showHUD` for post-close feedback | Raycast API convention | Toasts not visible after `closeMainWindow`; HUD overlays the desktop |
| Blocking action handler | Close-first, POST-second pattern | Community best practice | Eliminates perceived latency on tab switch |

**Deprecated/outdated:**
- `popToRoot()` for tab switching: Use `closeMainWindow()` instead -- switching to an external app should dismiss Raycast entirely, not return to root search.

## Existing Implementation Inventory

### Already Complete (No Changes Needed)
| Component | File | What It Does |
|-----------|------|-------------|
| HTTP endpoint | `native-host/src/server.js` | `POST /switch` accepts `{ tabId, windowId }`, validates, forwards to WebExtension |
| WebExtension handler | `extension/background.js` | `handleSwitchTab` calls `browser.tabs.update` + `browser.windows.update` |
| macOS focus | `native-host/src/server.js` | `NSRunningApplication.activateWithOptions(2)` in `handleSwitchTab` |
| Bridge correlation | `native-host/src/bridge.js` | Request-response with UUID correlation and 2s timeout |
| Body parsing | `native-host/src/server.js` | `parseBody` reads JSON from POST requests |
| Error responses | `native-host/src/server.js` | 400 for missing tabId, 502 for bridge failures |

### Needs Changes
| Component | File | What Changes |
|-----------|------|-------------|
| List items | `raycast-extension/src/search-tabs.tsx` | Add `ActionPanel` with primary "Switch to Tab" action |
| Imports | `raycast-extension/src/search-tabs.tsx` | Add `Action`, `ActionPanel`, `Icon`, `closeMainWindow`, `showHUD`, `getFavicon` |
| Tab switching | `raycast-extension/src/search-tabs.tsx` | New `switchTab()` async function |

## Open Questions

1. **getFavicon vs favIconUrl from Firefox**
   - What we know: Each tab has a `favIconUrl` field from Firefox. Raycast also provides `getFavicon(url)` which uses Google's favicon service.
   - What's unclear: Whether to use Firefox's `favIconUrl` directly (more accurate for the actual tab) or `getFavicon(url)` (more reliable, cached by Raycast).
   - Recommendation: Use `getFavicon(tab.url)` for Phase 4 -- it is simpler, handles fallbacks automatically, and does not require resolving Firefox's internal `chrome://` URLs which may not be accessible outside Firefox. In Phase 5 (polish), the tab's actual `favIconUrl` could be used as a primary source with `getFavicon` as fallback.

2. **Error UX when bridge is down**
   - What we know: If the native host is not running, the POST will fail with connection refused. `showHUD` can display a message after `closeMainWindow`.
   - What's unclear: Whether `showHUD` is visible enough for error cases, or if users will be confused about why nothing happened.
   - Recommendation: Use `showHUD` for errors in Phase 4. Phase 7 (error handling) will add more sophisticated error reporting.

## Sources

### Primary (HIGH confidence)
- https://developers.raycast.com/api-reference/user-interface/actions - Action component props (title, icon, onAction, shortcut)
- https://developers.raycast.com/api-reference/user-interface/action-panel - ActionPanel component, ActionPanel.Section
- https://developers.raycast.com/api-reference/window-and-search-bar - closeMainWindow API (clearRootSearch, popToRootType)
- https://developers.raycast.com/api-reference/feedback/hud - showHUD API for post-close feedback
- https://developers.raycast.com/api-reference/feedback/toast - showToast API (not used, but reviewed)
- https://developers.raycast.com/utilities/icons/getfavicon - getFavicon(url) from @raycast/utils
- https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/windows/update - browser.windows.update with focused:true
- https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabs/update - browser.tabs.update with active:true (does NOT focus window)
- Codebase: `native-host/src/server.js` - Existing POST /switch handler with NSRunningApplication
- Codebase: `extension/background.js` - Existing handleSwitchTab with browser.tabs.update + browser.windows.update
- Codebase: `raycast-extension/src/search-tabs.tsx` - Current List.Item without actions

### Secondary (MEDIUM confidence)
- https://github.com/marwan-tanager/raycast-extensions-browser-tabs - Community Chrome tab extension pattern: Action with closeMainWindow + tab switch
- Raycast API docs keyboard shortcuts - First action in ActionPanel is primary (Enter key)

### Tertiary (LOW confidence)
- None -- all findings verified with primary sources.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No new libraries needed; all APIs verified against official Raycast docs
- Architecture: HIGH - Pattern confirmed from Raycast API docs and community browser extensions; backend already fully implemented and tested
- Pitfalls: HIGH - closeMainWindow-first pattern verified; browser.tabs.update NOT focusing window confirmed by MDN docs; NSRunningApplication behavior confirmed from existing code

**Research date:** 2026-02-07
**Valid until:** 2026-03-07 (Raycast API stable; existing backend code already tested)
