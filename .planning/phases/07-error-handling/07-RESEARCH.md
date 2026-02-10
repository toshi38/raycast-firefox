# Phase 7: Error Handling - Research

**Researched:** 2026-02-10
**Domain:** Raycast extension error handling, Node.js fetch error classification, macOS process detection
**Confidence:** HIGH

## Summary

Phase 7 adds graceful, actionable error handling to the Raycast extension when the Firefox communication chain is broken. The chain has three failure points: (1) Firefox not running, (2) the WebExtension not installed/active, and (3) the native messaging host not running/registered. Each produces a distinct error signature that can be classified from the Raycast side by inspecting the fetch error structure.

The architecture is a three-layer pattern: an error **classifier** that maps raw fetch errors to typed failure modes, **EmptyView components** for tab list errors with recovery actions, and **toast handlers** for action errors (switch/close). The classifier inspects `error.cause.code` on the `TypeError: fetch failed` thrown by Node.js native fetch (undici) to distinguish `ECONNREFUSED` (host not running) from HTTP 502 responses (host running but extension disconnected). Firefox process detection uses `execFileSync("pgrep", ["-xi", "firefox"])` to further disambiguate "Firefox not running" from "Firefox running but host not registered."

**Primary recommendation:** Build a shared `errors.ts` utility module with a `classifyError` function that returns a typed enum (`FirefoxNotRunning | ExtensionNotInstalled | HostNotRunning | Unknown`), plus an `ErrorEmptyView` component and a `showActionError` toast helper. Wire retry logic with exponential backoff (1s/2s/4s) into the tab fetcher, and use `revalidate()` from `usePromise` for post-recovery auto-refresh.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Error detection strategy
- Detect on fetch failure only -- no separate health check endpoint
- Infer failure mode from error type: connection refused = host not running, host up but no data = extension issue, no Firefox process = Firefox not running
- All actions get error handling with specific messages (tab list, switch, close)
- Tab list fetch: auto-retry with backoff (2-3 retries, e.g., 1s/2s/4s) then show error
- Switch/close actions: fail immediately, no retries -- show specific error toast
- During retry period: show loading indicator with hint text ("Connecting to Firefox...")

#### Error presentation
- Tab list failures: Raycast EmptyView -- distinct per failure mode (different icon, title, description for each)
- Switch/close failures: Raycast toast notifications with failure style
- Tone: friendly and helpful -- "Firefox isn't running -- launch it and try again" style
- Each failure mode gets its own EmptyView with tailored message and recovery action

#### Recovery actions
- Firefox not running: action button launches Firefox via `open -a Firefox`
- WebExtension not installed: action button opens the AMO install page (or local install guide URL)
- Native host not registered: action button triggers the Phase 8 setup command (or placeholder)
- After recovery action: auto re-fetch tabs (wait a moment, then automatically retry)

#### Degraded states
- No stale/cached data -- if extension can't respond, show error EmptyView (clean and honest)
- If tabs loaded but switch/close fails mid-session: keep tab list visible, show toast error
- No proactive Firefox crash detection -- detect on next user interaction only
- Build shared error detection/presentation utilities reusable by Phase 8

### Claude's Discretion
- Specific retry timing and backoff intervals
- EmptyView icons per failure mode
- How long to wait after recovery action before auto re-fetch
- How to detect "extension not installed" vs "extension not responding" if distinguishable

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@raycast/api` | `^1.104` | `List.EmptyView`, `Toast`, `showToast`, `Icon`, `open`, `Action` | Already installed; provides all error presentation primitives |
| `@raycast/utils` | `^2.2` | `usePromise` (retry via wrapper), `showFailureToast`, `MutatePromise` | Already installed; provides `revalidate()` for post-recovery refresh |
| Node.js `child_process` | built-in | `execFileSync` for `pgrep` Firefox process detection | Built into Node.js 22 (Raycast runtime); no extra deps |
| Node.js `fs` | built-in | Check port file existence at `~/.raycast-firefox/port` | Already used by `getPort()` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| No additional libraries needed | -- | -- | All error handling uses existing Raycast API + Node.js built-ins |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `pgrep -xi firefox` | Raycast `getApplications()` | `getApplications()` returns installed apps, NOT running processes; `pgrep` is the only way to detect if Firefox is actually running |
| Manual retry wrapper | `useFetch` with built-in retry | `useFetch` does not expose retry/backoff configuration; `usePromise` with a custom retry wrapper is more flexible |
| `open("about:blank", "org.mozilla.firefox")` for launching Firefox | `execFile("open", ["-a", "Firefox"])` | `open()` from Raycast API requires a target URL; `execFile("open", ["-a", "Firefox"])` is simpler for just launching the app. However, `open("https://www.mozilla.org", "org.mozilla.firefox")` could work as an alternative |

**Installation:**
```bash
# No new packages needed -- all dependencies already installed
```

## Architecture Patterns

### Recommended Project Structure
```
raycast-extension/src/
├── search-tabs.tsx          # Main command (MODIFY: add error handling)
└── lib/
    └── errors.ts            # NEW: shared error utilities
```

The `lib/errors.ts` module exports:
1. `FailureMode` enum -- typed failure classification
2. `classifyError(error)` -- maps raw errors to `FailureMode`
3. `ErrorEmptyView` component -- renders failure-specific EmptyView with recovery actions
4. `showActionError(error, action)` -- shows failure toast for switch/close errors

### Pattern 1: Error Classification from Fetch Failures
**What:** Map raw fetch/HTTP errors to typed failure modes
**When to use:** Every fetch call in the extension
**Confidence:** HIGH (verified against Node.js undici error structure)

```typescript
// Source: Node.js undici fetch error structure
// https://github.com/nodejs/undici/issues/1248

enum FailureMode {
  FirefoxNotRunning = "firefox-not-running",
  ExtensionNotInstalled = "extension-not-installed",
  HostNotRunning = "host-not-running",
  Unknown = "unknown",
}

interface ClassifiedError {
  mode: FailureMode;
  message: string;
}

function classifyError(error: unknown): ClassifiedError {
  // Step 1: Check for fetch TypeError (connection-level failure)
  if (error instanceof TypeError && error.message === "fetch failed") {
    const cause = (error as any).cause;
    if (cause?.code === "ECONNREFUSED") {
      // Host HTTP server not running -- but WHY?
      // Sub-classify: is Firefox even running?
      if (!isFirefoxRunning()) {
        return { mode: FailureMode.FirefoxNotRunning, message: "..." };
      }
      // Firefox is running but host not serving -- host not registered/started
      return { mode: FailureMode.HostNotRunning, message: "..." };
    }
  }

  // Step 2: Check for HTTP 502 from the host (host running, extension disconnected)
  // This would come from the host's bridge.sendRequest rejection
  // The host returns 502 with { ok: false, error: "Firefox is not connected..." }
  if (error instanceof Error && error.message.includes("not connected")) {
    return { mode: FailureMode.ExtensionNotInstalled, message: "..." };
  }

  return { mode: FailureMode.Unknown, message: "..." };
}
```

**Key insight:** The error classification follows a decision tree:
1. `TypeError: fetch failed` with `cause.code === "ECONNREFUSED"` --> host not listening
   - Sub-check: `pgrep -xi firefox` --> if no process, Firefox not running; if process exists, host not registered
2. HTTP response received but `!res.ok` (502) --> host is running but extension is disconnected
3. HTTP 502 with error message containing "not connected" --> extension not installed or not active

### Pattern 2: Firefox Process Detection
**What:** Check if Firefox.app is running on macOS using `pgrep`
**When to use:** Only when ECONNREFUSED is detected (to disambiguate Firefox-not-running from host-not-running)
**Confidence:** HIGH (standard macOS/POSIX approach)

```typescript
import { execFileSync } from "child_process";

function isFirefoxRunning(): boolean {
  try {
    // pgrep -xi matches exact process name, case-insensitive; exits 0 if found, 1 if not
    execFileSync("pgrep", ["-xi", "firefox"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
```

**Important:** Use `execFileSync` (not `execSync`) for safety -- no shell interpretation. The `-i` flag makes the match case-insensitive, and `-x` matches the full process name exactly. This avoids false positives from similarly-named processes.

### Pattern 3: EmptyView with Recovery Actions
**What:** Display error-specific EmptyView with an ActionPanel containing a recovery action
**When to use:** Tab list fetch failure (after retries exhausted)
**Confidence:** HIGH (verified EmptyView accepts `actions` prop with ActionPanel)

```typescript
// Source: Raycast API docs
// https://developers.raycast.com/api-reference/user-interface/list
import { List, Icon, ActionPanel, Action } from "@raycast/api";

<List.EmptyView
  icon={Icon.WifiDisabled}
  title="Firefox Isn't Running"
  description="Launch Firefox and try again"
  actions={
    <ActionPanel>
      <Action
        title="Launch Firefox"
        icon={Icon.Globe}
        onAction={async () => {
          // Launch Firefox then trigger re-fetch
          await launchFirefox();
          setTimeout(() => revalidate(), 1500);
        }}
      />
    </ActionPanel>
  }
/>
```

### Pattern 4: Toast with Recovery for Action Errors
**What:** Show failure toast for switch/close errors with optional recovery action
**When to use:** switchTab() or closeTab() failures
**Confidence:** HIGH (verified Toast.ActionOptions structure)

```typescript
// Source: Raycast API docs
// https://developers.raycast.com/api-reference/feedback/toast
import { showToast, Toast } from "@raycast/api";

await showToast({
  style: Toast.Style.Failure,
  title: "Couldn't switch tab",
  message: "Firefox isn't running",
  primaryAction: {
    title: "Launch Firefox",
    onAction: async (toast) => {
      launchFirefox();
      toast.hide();
    },
  },
});
```

### Pattern 5: Retry with Exponential Backoff
**What:** Wrap fetchAllTabs with retry logic before showing error state
**When to use:** Tab list initial fetch and revalidation
**Confidence:** HIGH (standard pattern; user locked 2-3 retries with ~1s/2s/4s)

```typescript
async function fetchWithRetry<T>(
  fn: () => Promise<T>,
  retries: number = 3,
  baseDelay: number = 1000,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, baseDelay * Math.pow(2, attempt)));
      }
    }
  }
  throw lastError;
}
```

**Recommendation for retry timing:** 3 retries with exponential backoff: 1s, 2s, 4s delays. Total wait before error: ~7 seconds. This is long enough for the native host to start up after Firefox launches (lazy server start triggered by first native message).

### Anti-Patterns to Avoid
- **Polling health endpoint:** User decision locks to "detect on fetch failure only." Do NOT add a separate health check loop.
- **Caching stale data:** User decision locks to "no stale/cached data." Show error EmptyView, never old tabs.
- **Generic error messages:** Each failure mode MUST have its own tailored message. Never show "Something went wrong."
- **Blocking on execFileSync during render:** Call `isFirefoxRunning()` only inside the async `fetchAllTabs` error handler (already off the render thread). Never call it in the React component body or render function.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Failure toast | Custom toast wrapper | `showToast` with `Toast.Style.Failure` + `primaryAction` | Raycast API provides built-in failure styling and action buttons |
| Empty state UI | Custom component from scratch | `List.EmptyView` with `icon`, `title`, `description`, `actions` | Built-in component with proper Raycast styling |
| Post-recovery refresh | Manual state reset + re-fetch | `revalidate()` from `usePromise` return value | Already used by the hook; just call it after a delay |

**Key insight:** All error presentation primitives already exist in Raycast's API. The only custom code needed is the error classification logic and the retry wrapper.

## Common Pitfalls

### Pitfall 1: Node.js Fetch Error Structure is Nested
**What goes wrong:** Catching `TypeError: fetch failed` and only checking `error.message` misses the actual error code.
**Why it happens:** Node.js native fetch (undici) wraps the real error in `error.cause`. The top-level error is always `TypeError` with message `"fetch failed"`.
**How to avoid:** Always inspect `(error as any).cause?.code` to get `ECONNREFUSED`, `ECONNRESET`, `ENOTFOUND`, etc.
**Warning signs:** Error classification always returns "Unknown" because cause is not checked.

### Pitfall 2: pgrep Process Name Case Sensitivity
**What goes wrong:** `pgrep -x Firefox` may not match the actual process name on macOS.
**Why it happens:** The Firefox binary name inside `/Applications/Firefox.app/Contents/MacOS/` may be `firefox` (lowercase) or `Firefox` (mixed case) depending on version/installation.
**How to avoid:** Use `pgrep -xi firefox` for case-insensitive exact match.
**Warning signs:** Firefox is running but `isFirefoxRunning()` returns false, causing incorrect error messages.

### Pitfall 3: EmptyView Not Showing During Loading
**What goes wrong:** `List.EmptyView` is never displayed if `isLoading` is true and search bar is empty.
**Why it happens:** Raycast's documented behavior: "EmptyView is never displayed if the List's isLoading property is true and the search bar is empty."
**How to avoid:** During retry phase, set `isLoading={true}` to show Raycast's loading indicator. Only show EmptyView after retries are exhausted and `isLoading` becomes false.
**Warning signs:** Blank list shown instead of error EmptyView because isLoading was not properly managed.

### Pitfall 4: execFileSync Blocking the UI Thread
**What goes wrong:** Calling `execFileSync("pgrep", ...)` during render blocks the Raycast UI.
**Why it happens:** `execFileSync` is synchronous and blocks the Node.js event loop.
**How to avoid:** Only call `isFirefoxRunning()` inside the async `fetchAllTabs` error handler (already off the render thread inside the `usePromise` callback). Never call it in the React component body or render function.
**Warning signs:** Raycast extension feels sluggish or briefly freezes on every render.

### Pitfall 5: Race Condition After Recovery Action
**What goes wrong:** Auto re-fetch after "Launch Firefox" fires before Firefox and the native host have started.
**Why it happens:** Firefox takes 1-3 seconds to launch, then the WebExtension connects to the native host, which then starts the HTTP server lazily on first message.
**How to avoid:** Wait at least 1.5-2 seconds after triggering the recovery action before calling `revalidate()`. The retry wrapper will handle any residual startup delay.
**Warning signs:** Recovery action launches Firefox but the re-fetch still fails because the host hasn't started yet.

### Pitfall 6: HTTP 502 vs ECONNREFUSED Confusion
**What goes wrong:** Treating all errors as "host not running" when the host IS running but the extension is disconnected.
**Why it happens:** Both produce "error" states, but they have very different causes. ECONNREFUSED means no TCP listener. HTTP 502 means the host responded but the bridge to Firefox is broken.
**How to avoid:** Check the error type first: `TypeError: fetch failed` = connection-level. `Error` from response parsing = HTTP-level. Keep these classification paths separate.
**Warning signs:** User sees "Native host not running" when Firefox is running and the host is serving, but the extension is disabled.

## Code Examples

### Complete Error Classification Module
```typescript
// lib/errors.ts
// Source: Custom implementation based on Node.js undici error structure
// and Raycast API (List.EmptyView, Toast, open)

import { execFileSync } from "child_process";

export enum FailureMode {
  FirefoxNotRunning = "firefox-not-running",
  ExtensionNotInstalled = "extension-not-installed",
  HostNotRunning = "host-not-running",
  Unknown = "unknown",
}

export interface ClassifiedError {
  mode: FailureMode;
  title: string;
  description: string;
}

export function isFirefoxRunning(): boolean {
  try {
    execFileSync("pgrep", ["-xi", "firefox"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export function classifyError(error: unknown): ClassifiedError {
  // Connection-level failure: host HTTP server is not reachable
  if (error instanceof TypeError) {
    const cause = (error as TypeError & { cause?: { code?: string } }).cause;
    if (cause?.code === "ECONNREFUSED") {
      if (!isFirefoxRunning()) {
        return {
          mode: FailureMode.FirefoxNotRunning,
          title: "Firefox Isn't Running",
          description: "Launch Firefox to see your tabs here",
        };
      }
      return {
        mode: FailureMode.HostNotRunning,
        title: "Native Host Not Connected",
        description: "The Raycast Firefox helper needs to be set up",
      };
    }
  }

  // HTTP-level failure: host is running but extension bridge is broken
  // The native host returns 502 with "Firefox is not connected" when
  // nativeConnected is false in bridge.js
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("not connected") || msg.includes("timeout")) {
      return {
        mode: FailureMode.ExtensionNotInstalled,
        title: "WebExtension Not Connected",
        description: "Install the Raycast Firefox companion extension",
      };
    }
  }

  return {
    mode: FailureMode.Unknown,
    title: "Can't Connect to Firefox",
    description: "Something went wrong. Try restarting Firefox.",
  };
}
```

### Extracting HTTP Error Messages from fetch Responses
```typescript
// In fetchAllTabs, when the host returns an HTTP error (502),
// we need to throw an Error with the response body message so
// classifyError can inspect it.
async function fetchAllTabs(): Promise<Tab[]> {
  // ... existing pagination logic ...
  const res = await fetch(`http://127.0.0.1:${port}/tabs?offset=${offset}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  // ...
}
```

### EmptyView Per Failure Mode
```typescript
// Source: Raycast API docs (List.EmptyView with actions prop)
import { List, Icon, ActionPanel, Action, open } from "@raycast/api";
import { FailureMode, ClassifiedError } from "./lib/errors";

// Icon mapping per failure mode
const ERROR_ICONS: Record<FailureMode, Icon> = {
  [FailureMode.FirefoxNotRunning]: Icon.Globe,
  [FailureMode.ExtensionNotInstalled]: Icon.Puzzle,
  [FailureMode.HostNotRunning]: Icon.Terminal,
  [FailureMode.Unknown]: Icon.ExclamationMark,
};

function ErrorEmptyView({
  error,
  revalidate,
}: {
  error: ClassifiedError;
  revalidate: () => void;
}) {
  return (
    <List.EmptyView
      icon={ERROR_ICONS[error.mode]}
      title={error.title}
      description={error.description}
      actions={
        <ActionPanel>
          {error.mode === FailureMode.FirefoxNotRunning && (
            <Action
              title="Launch Firefox"
              icon={Icon.Globe}
              onAction={async () => {
                execFile("open", ["-a", "Firefox"]);
                setTimeout(() => revalidate(), 2000);
              }}
            />
          )}
          {error.mode === FailureMode.ExtensionNotInstalled && (
            <Action.OpenInBrowser
              title="Install WebExtension"
              url="https://addons.mozilla.org/en-US/firefox/addon/raycast-firefox/"
            />
          )}
          {error.mode === FailureMode.HostNotRunning && (
            <Action
              title="Set Up Native Host"
              icon={Icon.Terminal}
              onAction={() => {
                // Phase 8 will provide a real setup command
                // For now, placeholder
              }}
            />
          )}
          <Action
            title="Retry"
            icon={Icon.ArrowClockwise}
            shortcut={{ modifiers: ["cmd"], key: "r" }}
            onAction={() => revalidate()}
          />
        </ActionPanel>
      }
    />
  );
}
```

### Toast Error for Switch/Close Actions
```typescript
import { showToast, Toast } from "@raycast/api";
import { classifyError, FailureMode } from "./lib/errors";
import { execFile } from "child_process";

async function showActionError(
  error: unknown,
  actionName: string,
) {
  const classified = classifyError(error);

  const options: Toast.Options = {
    style: Toast.Style.Failure,
    title: `Couldn't ${actionName}`,
    message: classified.description,
  };

  if (classified.mode === FailureMode.FirefoxNotRunning) {
    options.primaryAction = {
      title: "Launch Firefox",
      onAction: (toast) => {
        execFile("open", ["-a", "Firefox"]);
        toast.hide();
      },
    };
  }

  await showToast(options);
}
```

### Retry Wrapper with Backoff
```typescript
async function fetchWithRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 1000,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt); // 1s, 2s, 4s
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `node-fetch` error objects | Native fetch (undici) with `error.cause` chain | Node.js 18+ | Must check `error.cause.code` instead of `error.code` directly |
| `showToast` without actions | `showToast` with `primaryAction`/`secondaryAction` | Raycast API 1.30+ | Toast actions enable inline recovery (e.g., "Launch Firefox" button in toast) |
| `useFetch` for simple data loading | `usePromise` for custom async with retry | @raycast/utils 2.x | `usePromise` gives more control over the fetch function; `useFetch` is simpler but less flexible |

**Deprecated/outdated:**
- `node-fetch` package: Not needed. Raycast runs Node.js 22 with built-in global `fetch`.
- Direct `error.code` on fetch errors: Must use `error.cause.code` with undici-backed native fetch.

## Open Questions

1. **Exact Firefox process name for pgrep on macOS**
   - What we know: Firefox installs to `/Applications/Firefox.app/Contents/MacOS/firefox` (binary is lowercase)
   - What's unclear: Whether all Firefox installations (regular, Developer Edition, Nightly) use the same binary name
   - Recommendation: Use `pgrep -xi firefox` (case-insensitive) for safety. Verify at implementation time with `pgrep -l firefox` on a running Firefox.

2. **Launching Firefox without a URL target**
   - What we know: Raycast's `open(target, application)` requires a `target` string. There is no `launchApplication()` API.
   - What's unclear: Whether `open("", "org.mozilla.firefox")` works or throws. Using `open("about:blank", "org.mozilla.firefox")` might open a new tab.
   - Recommendation: Use `execFile("open", ["-a", "Firefox"])` via `child_process` for the cleanest "just launch Firefox" behavior. This avoids opening an unwanted new tab or URL.

3. **Distinguishing "extension not installed" from "extension not responding"**
   - What we know: The native host sets `nativeConnected = false` on stdin EOF. The bridge.sendRequest rejects with "Firefox is not connected." The host returns HTTP 502 to the Raycast extension.
   - What's unclear: If Firefox is running but the extension was never installed, the native host process is never spawned at all (Firefox only spawns it when the extension connects). This means ECONNREFUSED, not 502.
   - Recommendation: The distinction between "extension not installed" and "host not registered" may be impossible when both produce ECONNREFUSED. When Firefox is running but we get ECONNREFUSED, show a combined message covering both possibilities: "The Raycast Firefox helper needs to be set up. Make sure the companion extension is installed and the native host is registered." Phase 8 (Setup Automation) can provide a single command that checks/fixes both.

## Sources

### Primary (HIGH confidence)
- Context7 `/websites/developers_raycast` -- List.EmptyView props (icon, title, description, actions), Toast API (showToast, Toast.Style.Failure, Toast.ActionOptions with primaryAction/secondaryAction), usePromise hook (revalidate, mutate, error handling, onError callback, failureToastOptions), Action component, open utility function, Icon enum
- Node.js undici GitHub issues -- Error structure for `TypeError: fetch failed` with `error.cause.code` property chain ([#1248](https://github.com/nodejs/undici/issues/1248), [#4063](https://github.com/nodejs/undici/issues/4063))
- Codebase analysis -- `search-tabs.tsx` (current error handling: generic catch blocks), `native-host/src/bridge.js` (nativeConnected flag, error messages), `native-host/src/server.js` (HTTP 502 responses with error messages), `native-host/src/lifecycle.js` (port file at `~/.raycast-firefox/port`)

### Secondary (MEDIUM confidence)
- MDN Web Docs -- fetch() rejection behavior (only rejects on network errors, not HTTP status codes)
- WebSearch -- Node.js native fetch ECONNREFUSED error structure (multiple sources confirm `error.cause.code` pattern)
- WebSearch -- macOS process detection with `pgrep -x` for checking running applications

### Tertiary (LOW confidence)
- Firefox binary name for `pgrep` -- Assumed `firefox` (lowercase) based on typical macOS app bundle structure; needs verification at implementation time

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all APIs verified via Context7 and official Raycast docs; no new dependencies needed
- Architecture: HIGH -- error classification tree verified against actual native-host error responses in codebase; EmptyView/Toast patterns confirmed
- Pitfalls: HIGH -- Node.js fetch error structure verified via undici GitHub issues; EmptyView loading behavior documented in Raycast API
- Firefox detection: MEDIUM -- `pgrep` approach is standard POSIX, but exact process name needs implementation-time verification
- "Extension not installed" vs "host not registered" disambiguation: MEDIUM -- may be impossible to distinguish in all cases when both produce ECONNREFUSED

**Research date:** 2026-02-10
**Valid until:** 2026-03-10 (30 days -- stable APIs, no fast-moving dependencies)
