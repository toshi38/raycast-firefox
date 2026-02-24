# Phase 6: Tab Close Action - Research

**Researched:** 2026-02-09
**Domain:** Raycast Action integration, native messaging command routing, WebExtension tabs API
**Confidence:** HIGH

## Summary

Phase 6 adds the ability to close a Firefox tab directly from the Raycast tab list without switching to it. The implementation touches all three layers of the existing communication chain (Raycast -> Native Host HTTP -> WebExtension), but the WebExtension layer is **already complete** -- `handleCloseTab` and the `close-tab` command routing already exist in `background.js`.

The remaining work is: (1) a new `/close` HTTP endpoint in the native host, and (2) a "Close Tab" action in the Raycast extension ActionPanel with optimistic list removal and revalidation.

**Primary recommendation:** Follow the exact pattern established by `/switch` for the native host endpoint, and use `usePromise`'s `mutate` with `optimisticUpdate` to instantly remove the tab from the list while the HTTP request completes in the background.

## Standard Stack

No new libraries or dependencies are required. This phase uses only what is already installed.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@raycast/api` | ^1.104.0 | Action, ActionPanel, confirmAlert, showToast, Toast, Icon | Already installed; provides all UI primitives needed |
| `@raycast/utils` | ^2.2.0 | usePromise (mutate, revalidate, optimisticUpdate) | Already installed; provides mutation/refresh pattern |
| `browser.tabs` | WebExtension API | `browser.tabs.remove(tabId)` | Built-in Firefox API; already used for query/update |
| Node.js `http` | Built-in | HTTP server endpoint handler | Already used in native-host/src/server.js |

### Supporting
No additional supporting libraries needed.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Optimistic update via `mutate` | Simple `revalidate()` after close | `revalidate` re-fetches all tabs, causing a visible flash; `mutate` with `optimisticUpdate` removes the tab instantly from the local array for snappy UX |
| `confirmAlert` before close | No confirmation | Closing is non-destructive enough (tab is gone, not data loss) that confirmation is optional. Firefox itself does not confirm tab close. Skip confirmation for speed. |

**Installation:** None required.

## Architecture Patterns

### Existing Communication Chain
```
Raycast Extension  --HTTP-->  Native Host (Node.js)  --stdin/stdout-->  Firefox WebExtension
     (React/TSX)              (src/server.js)                           (background.js)
```

### Pattern 1: Endpoint Mirroring (follow `/switch`)
**What:** The `/close` endpoint mirrors the structure of `/switch` exactly: parse JSON body, validate `tabId`, call `sendRequest('close-tab', { tabId })`, return JSON result.
**When to use:** Any new command that takes a tabId and sends it to the WebExtension.
**Example:**
```javascript
// Source: existing pattern in native-host/src/server.js (handleSwitchTab)
async function handleCloseTab(req, res) {
  let body;
  try {
    body = await parseBody(req);
  } catch (err) {
    sendJSON(res, 400, { ok: false, error: 'Invalid JSON body' });
    return;
  }

  if (!body.tabId && body.tabId !== 0) {
    sendJSON(res, 400, { ok: false, error: 'tabId is required' });
    return;
  }

  try {
    const data = await sendRequest('close-tab', { tabId: body.tabId });
    sendJSON(res, 200, { ok: true, data, meta: { timestamp: Date.now() } });
  } catch (err) {
    sendJSON(res, 502, { ok: false, error: err.message, meta: { timestamp: Date.now() } });
  }
}
```

**Key difference from `/switch`:** No `execFile('osascript', ...)` to raise Firefox. The whole point is that Firefox stays in the background.

### Pattern 2: Optimistic Removal with `mutate` (Raycast side)
**What:** Use `usePromise`'s returned `mutate` function to optimistically remove the closed tab from the local data while the HTTP request is in flight. Rolls back automatically if the request fails.
**When to use:** Any destructive action where instant visual feedback is important.
**Example:**
```typescript
// Source: Raycast docs - usePromise mutate pattern
const { data: tabs, isLoading, mutate } = usePromise(fetchAllTabs);

async function closeTab(tabId: number) {
  const toast = await showToast({ style: Toast.Style.Animated, title: "Closing tab..." });
  try {
    await mutate(
      fetch(`http://127.0.0.1:${port}/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tabId }),
      }),
      {
        optimisticUpdate(data) {
          return data?.filter((t) => t.id !== tabId);
        },
      },
    );
    toast.style = Toast.Style.Success;
    toast.title = "Tab closed";
  } catch (err) {
    toast.style = Toast.Style.Failure;
    toast.title = "Failed to close tab";
    toast.message = String(err);
  }
}
```

### Pattern 3: ActionPanel Section Grouping
**What:** Group the close action in a separate `ActionPanel.Section` to visually separate destructive actions from navigation actions.
**When to use:** When combining primary (switch) and destructive (close) actions.
**Example:**
```tsx
// Source: Raycast docs - ActionPanel sections + Keyboard.Shortcut.Common
<ActionPanel>
  <ActionPanel.Section>
    <Action title="Switch to Tab" icon={Icon.Globe} onAction={() => switchTab(tab.id, tab.windowId)} />
  </ActionPanel.Section>
  <ActionPanel.Section>
    <Action
      title="Close Tab"
      icon={Icon.Trash}
      style={Action.Style.Destructive}
      shortcut={Keyboard.Shortcut.Common.Remove}
      onAction={() => closeTab(tab.id)}
    />
  </ActionPanel.Section>
</ActionPanel>
```

### Anti-Patterns to Avoid
- **Calling `revalidate()` instead of `mutate` for close:** Causes a visible flash as the entire list refreshes from the server. Use `mutate` with `optimisticUpdate` to immediately remove the tab from the local array.
- **Raising Firefox to foreground on close:** Unlike `/switch`, the `/close` endpoint must NOT activate Firefox. The user wants to stay in Raycast (or whatever app they are in).
- **Closing the Raycast window on close:** Unlike switching, closing a tab should keep Raycast open so the user can continue working with the list (e.g., close multiple tabs in succession).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Optimistic list removal | Manual state management with useState | `usePromise`'s `mutate` with `optimisticUpdate` | Built-in rollback on error, handles race conditions with in-flight data fetches |
| Tab close in WebExtension | Custom tab lookup + removal | `browser.tabs.remove(tabId)` | Already implemented in `background.js` as `handleCloseTab` |
| Confirmation dialog | Custom modal component | `confirmAlert` from `@raycast/api` (if needed) | Standard Raycast pattern; but likely not needed here since tab close is not data-destructive |

**Key insight:** The WebExtension `close-tab` command handler already exists and is fully wired into the message router. The native host just needs a thin HTTP endpoint to bridge it.

## Common Pitfalls

### Pitfall 1: Forgetting to add route in server.js
**What goes wrong:** Adding the handler function but not the route check in `handleRequest`.
**Why it happens:** The routing is manual `if/else` in `handleRequest`, easy to miss.
**How to avoid:** Add both the handler function AND the route entry. Also update CORS preflight `Access-Control-Allow-Methods` if needed (already covers POST).
**Warning signs:** 404 response from `/close` endpoint.

### Pitfall 2: Not handling the `mutate` promise rejection
**What goes wrong:** If the HTTP request fails (e.g., Firefox disconnected), the optimistic update rolls back silently and the user sees no feedback.
**Why it happens:** Not wrapping `mutate` in try/catch with toast feedback.
**How to avoid:** Always wrap `mutate` calls in try/catch and show Toast on failure.
**Warning signs:** Tab reappears in list with no explanation.

### Pitfall 3: Closing the active tab leaves stale "Active" tag
**What goes wrong:** When you close the currently active tab, Firefox promotes another tab to active, but the Raycast list (optimistically updated) does not reflect this new active tab.
**Why it happens:** Optimistic update only removes the closed tab; it does not know which tab Firefox will promote.
**How to avoid:** Accept this minor inconsistency. The optimistic update removes the tab instantly. If the user needs to see the new active tab, `shouldRevalidateAfter` (default `true` in `MutatePromise`) will re-fetch the full list after the mutation completes, which will include the correct active tab state.
**Warning signs:** No "Active" tag visible after closing the active tab (until revalidation completes).

### Pitfall 4: Closing the last tab in a window
**What goes wrong:** `browser.tabs.remove()` on the last tab in a window closes the entire window. This is standard Firefox behavior and is expected.
**Why it happens:** Firefox automatically closes empty windows.
**How to avoid:** No avoidance needed -- this is correct behavior. The revalidation will reflect the closed window by removing its tabs.
**Warning signs:** None; this is expected.

### Pitfall 5: Tab ID becoming stale
**What goes wrong:** The user leaves Raycast open for a long time, tabs change, and the tabId in the list no longer corresponds to a real tab.
**Why it happens:** Tab IDs are ephemeral; they change when tabs are closed and reopened.
**How to avoid:** `browser.tabs.remove(invalidId)` will reject, which the error handling propagates as an error toast. The revalidation after mutation will refresh the list. This is acceptable behavior.
**Warning signs:** "Failed to close tab" toast.

## Code Examples

### WebExtension: handleCloseTab (ALREADY EXISTS)
```javascript
// Source: extension/background.js lines 191-198 (already implemented)
const handleCloseTab = async (params = {}) => {
  const { tabId } = params;
  if (tabId == null) {
    throw new Error("tabId is required");
  }
  await browser.tabs.remove(tabId);
  return { tabId };
};
```

### WebExtension: Command routing (ALREADY EXISTS)
```javascript
// Source: extension/background.js lines 232-233 (already routed)
case "close-tab":
  data = await handleCloseTab(params);
  break;
```

### Native Host: /close endpoint (TO BE ADDED)
```javascript
// Follows exact pattern of handleSwitchTab in native-host/src/server.js
// POST /close with JSON body { tabId: number }
// Returns { ok: true, data: { tabId }, meta: { timestamp } }
// No Firefox activation (unlike /switch)
```

### Raycast: Close action with optimistic update (TO BE ADDED)
```typescript
// Uses mutate from usePromise for optimistic removal
// Action.Style.Destructive for red styling
// Keyboard.Shortcut.Common.Remove (Ctrl+X) for keyboard shortcut
// showToast for feedback on success/failure
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `revalidate()` after mutation | `mutate()` with `optimisticUpdate` | Available since @raycast/utils 2.x | Instant UI feedback without re-fetch flash |
| No destructive action styling | `Action.Style.Destructive` | Available in @raycast/api | Red text for destructive actions, matching system conventions |
| Custom keyboard shortcuts | `Keyboard.Shortcut.Common.Remove` | Available in @raycast/api | Consistent Ctrl+X shortcut across Raycast extensions |

## Open Questions

1. **Should there be a confirmation dialog before closing?**
   - What we know: Firefox itself does not confirm single-tab close. Raycast provides `confirmAlert` for this pattern. `Keyboard.Shortcut.Common.Remove` (Ctrl+X) is a deliberate action.
   - Recommendation: No confirmation. Tab close is fast and non-destructive (no data loss beyond browser history which is preserved). Matches Firefox behavior.

2. **Should closing the last tab in a window warn about window closure?**
   - What we know: This is standard Firefox behavior. The window closes automatically.
   - Recommendation: No special handling. Let Firefox manage window lifecycle.

## Sources

### Primary (HIGH confidence)
- Codebase inspection: `extension/background.js` - verified `handleCloseTab` and `close-tab` command routing already exist
- Codebase inspection: `native-host/src/server.js` - verified `/switch` endpoint pattern to mirror for `/close`
- Codebase inspection: `raycast-extension/src/search-tabs.tsx` - verified current ActionPanel structure and `usePromise` usage
- Context7 `/websites/developers_raycast` - usePromise mutate/optimisticUpdate API, ActionPanel sections, Action.Style.Destructive, Keyboard.Shortcut.Common, confirmAlert
- MDN `browser.tabs.remove` - API signature, accepts integer or integer array, resolves to void

### Secondary (MEDIUM confidence)
- None needed -- all findings verified against codebase and official docs

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new dependencies; all APIs verified against Context7 and codebase
- Architecture: HIGH - follows exact patterns already established in codebase (endpoint mirroring, bridge command routing)
- Pitfalls: HIGH - derived from understanding of the existing implementation and standard browser behavior

**Research date:** 2026-02-09
**Valid until:** 2026-03-09 (stable -- no external dependencies or fast-moving APIs)
