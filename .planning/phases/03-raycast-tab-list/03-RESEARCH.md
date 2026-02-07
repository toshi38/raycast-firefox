# Phase 3: Raycast Tab List - Research

**Researched:** 2026-02-07
**Domain:** Raycast extension development (React + TypeScript), HTTP client integration
**Confidence:** HIGH

## Summary

Phase 3 builds a Raycast extension that fetches tab data from the native messaging bridge's HTTP server (built in Phase 2) and displays it as a searchable list. The extension uses Raycast's React-based framework with TypeScript, the `@raycast/utils` package for data fetching via `useFetch`, and Raycast's built-in fuzzy filtering on `List.Item` titles and keywords.

The architecture is straightforward: the Raycast extension makes HTTP GET requests to `http://127.0.0.1:{port}/tabs`, receives JSON with tab data, and renders each tab as a `List.Item` with the title as the primary text, URL as the subtitle, and URL segments as keywords for search indexing. Raycast's built-in filtering handles fuzzy search over both title and keywords, satisfying TABS-01 without custom filtering logic.

**Primary recommendation:** Use Raycast's built-in `List` component with `useFetch` from `@raycast/utils`, setting each tab's URL as both `subtitle` (for display, TABS-02) and `keywords` (for search indexing, TABS-01). Let Raycast's native fuzzy filtering handle search rather than implementing custom filtering.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@raycast/api` | `^1.104` | Raycast extension framework (List, ActionPanel, etc.) | Required by all Raycast extensions |
| `@raycast/utils` | `^2.2` | Utility hooks including `useFetch`, `getFavicon` | Official companion library; provides data fetching with loading states, error handling, caching |
| TypeScript | `^5.x` | Type safety | Required by Raycast extension toolchain |
| React | 19 | UI rendering | Raycast runs React 19 internally with Node.js 22 |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node-fetch` | N/A | HTTP client | NOT needed -- Node.js 22 (Raycast's runtime) has global `fetch` built in; `useFetch` wraps it |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `useFetch` | Raw `fetch` + `useState`/`useEffect` | `useFetch` handles loading states, error toasts, and caching automatically; no reason to hand-roll |
| Built-in List filtering | Custom `filtering={false}` + manual filter | Built-in filtering is fuzzy and indexes title + keywords; custom only needed if Raycast's fuzzy matching is insufficient (unlikely for tab search) |
| Reading port file | Hardcoded port 26394 | Port file (`~/.raycast-firefox/port`) is more robust since server may use a fallback port if 26394 is in use |

**Installation:**
```bash
npm install --save @raycast/api @raycast/utils
```

## Architecture Patterns

### Recommended Project Structure
```
raycast-extension/
├── assets/
│   └── icon.png              # Extension icon (512x512 PNG)
├── src/
│   └── search-tabs.tsx       # "Search Firefox Tabs" command
├── package.json              # Raycast manifest + npm config
├── tsconfig.json             # TypeScript config
├── .gitignore                # node_modules, raycast-env.d.ts
└── raycast-env.d.ts          # Auto-generated (do NOT commit)
```

### Pattern 1: useFetch with List for Tab Display
**What:** Fetch tab data from the HTTP bridge and display as a filterable list
**When to use:** This is the primary (and only) pattern for Phase 3
**Example:**
```typescript
// Source: Raycast API docs (https://developers.raycast.com/utilities/react-hooks/usefetch)
import { List } from "@raycast/api";
import { useFetch } from "@raycast/utils";

interface Tab {
  id: number;
  windowId: number;
  title: string;
  url: string;
  favIconUrl: string | null;
  active: boolean;
  pinned: boolean;
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

export default function SearchTabs() {
  const { isLoading, data } = useFetch<TabsResponse>(
    "http://127.0.0.1:26394/tabs",
    {
      keepPreviousData: true,
    }
  );

  const tabs = data?.data?.tabs ?? [];

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Search Firefox tabs by title or URL"
    >
      {tabs.map((tab) => (
        <List.Item
          key={String(tab.id)}
          title={tab.title || "Untitled"}
          subtitle={tab.url}
          keywords={extractKeywords(tab.url)}
        />
      ))}
    </List>
  );
}
```

### Pattern 2: Port Discovery via Port File
**What:** Read the port from `~/.raycast-firefox/port` instead of hardcoding
**When to use:** For resilience when port 26394 is occupied and the host falls back to 26395+
**Example:**
```typescript
import { readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

function getPort(): number {
  const portFile = join(homedir(), ".raycast-firefox", "port");
  try {
    const content = readFileSync(portFile, "utf-8").trim();
    const port = parseInt(content, 10);
    if (isNaN(port)) throw new Error("Invalid port");
    return port;
  } catch {
    return 26394; // Fallback to default
  }
}
```

### Pattern 3: URL Keyword Extraction for Search
**What:** Break URL into searchable segments so users can search by domain, path, etc.
**When to use:** To make URL-based search work with Raycast's built-in filtering
**Example:**
```typescript
function extractKeywords(url: string): string[] {
  // "https://docs.google.com/spreadsheets/d/abc"
  // -> ["docs.google.com", "docs", "google", "com", "spreadsheets", "abc"]
  try {
    const parsed = new URL(url);
    const hostParts = parsed.hostname.split(".");
    const pathParts = parsed.pathname.split("/").filter(Boolean);
    return [parsed.hostname, ...hostParts, ...pathParts, url];
  } catch {
    return [url];
  }
}
```

### Anti-Patterns to Avoid
- **Custom filtering with `filtering={false}`:** Do NOT disable built-in filtering and implement your own fuzzy search. Raycast's built-in fuzzy search on title + keywords is optimized and consistent with the rest of Raycast. Only disable if you need server-side search, which we don't.
- **Fetching tabs on every keystroke:** Do NOT re-fetch from the HTTP bridge on each search keystroke. Fetch once when the command opens, let Raycast filter client-side. The tab list updates when the command is re-invoked (requirement #4).
- **Using `onSearchTextChange` to trigger re-fetches:** This would create unnecessary HTTP requests. The tab list is small enough to filter entirely client-side.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Data fetching + loading state | Custom `fetch` + `useState` + `useEffect` | `useFetch` from `@raycast/utils` | Handles loading spinner, error toasts, caching, stale-while-revalidate automatically |
| Fuzzy search | Custom string matching | Raycast built-in `List` filtering with `keywords` prop | Native fuzzy search is faster, handles Unicode, matches Raycast UX conventions |
| Favicon display | Custom favicon fetching | `getFavicon` from `@raycast/utils` | Provides Google favicon service with fallback icons (defer to Phase 5, but good to know) |
| Error display | Custom error UI | `useFetch` automatic `failureToastOptions` | Shows native Raycast toast on fetch failure |

**Key insight:** Raycast provides almost everything needed out of the box. The extension code should be minimal -- mostly wiring `useFetch` to `List.Item` rendering.

## Common Pitfalls

### Pitfall 1: Filtering Disabled Accidentally
**What goes wrong:** Setting `onSearchTextChange` implicitly sets `filtering={false}`, disabling Raycast's built-in fuzzy search.
**Why it happens:** Developers add `onSearchTextChange` to track search text for other purposes without realizing it disables built-in filtering.
**How to avoid:** Do NOT set `onSearchTextChange` unless you need custom filtering. If you must use it, explicitly set `filtering={true}` to re-enable built-in filtering.
**Warning signs:** Typing in the search bar does not filter the list.

### Pitfall 2: URL Not Searchable
**What goes wrong:** Users type a domain name but no tabs are found because only `title` is indexed by default.
**Why it happens:** Raycast built-in filtering only searches `title` and `keywords`, not `subtitle`.
**How to avoid:** Add URL-derived strings to the `keywords` prop on each `List.Item`. The `subtitle` is display-only and NOT indexed for search.
**Warning signs:** Searching by URL text returns no results even though matching tabs exist.

### Pitfall 3: Host Not Running
**What goes wrong:** Extension shows an error or empty list because the native messaging host HTTP server isn't running.
**Why it happens:** Firefox isn't open, the WebExtension isn't installed, or the native host hasn't been registered.
**How to avoid:** For Phase 3, show a basic loading/error state. Full error handling is deferred to Phase 7.
**Warning signs:** `useFetch` returns an error for connection refused.

### Pitfall 4: Port Mismatch
**What goes wrong:** Extension tries port 26394 but the host started on 26395 due to port conflict.
**Why it happens:** Another process occupies port 26394; the host falls back to the next available port.
**How to avoid:** Read port from `~/.raycast-firefox/port` file before making HTTP requests.
**Warning signs:** Connection refused even though Firefox and host are running.

### Pitfall 5: Stale raycast-env.d.ts in Git
**What goes wrong:** Auto-generated TypeScript definitions file causes merge conflicts or confusion.
**Why it happens:** `raycast-env.d.ts` is generated at build time and should not be committed.
**How to avoid:** Add `raycast-env.d.ts` to `.gitignore`.
**Warning signs:** Git diff shows changes to `raycast-env.d.ts`.

## Code Examples

### Complete Search Firefox Tabs Command
```typescript
// Source: Synthesized from Raycast API docs
// https://developers.raycast.com/utilities/react-hooks/usefetch
// https://developers.raycast.com/api-reference/user-interface/list
import { List } from "@raycast/api";
import { useFetch } from "@raycast/utils";
import { readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

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

function getPort(): number {
  try {
    const content = readFileSync(
      join(homedir(), ".raycast-firefox", "port"),
      "utf-8"
    ).trim();
    const port = parseInt(content, 10);
    return isNaN(port) ? 26394 : port;
  } catch {
    return 26394;
  }
}

function urlKeywords(url: string): string[] {
  try {
    const parsed = new URL(url);
    const hostParts = parsed.hostname.split(".");
    const pathParts = parsed.pathname.split("/").filter(Boolean);
    return [parsed.hostname, ...hostParts, ...pathParts];
  } catch {
    return [url];
  }
}

export default function SearchTabs() {
  const port = getPort();
  const { isLoading, data } = useFetch<TabsResponse>(
    `http://127.0.0.1:${port}/tabs`,
    { keepPreviousData: true }
  );

  const tabs = data?.data?.tabs ?? [];

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Search Firefox tabs..."
    >
      {tabs.map((tab) => (
        <List.Item
          key={String(tab.id)}
          title={tab.title || "Untitled"}
          subtitle={tab.url}
          keywords={urlKeywords(tab.url)}
        />
      ))}
    </List>
  );
}
```

### Raycast Extension Manifest (package.json)
```json
{
  "name": "firefox-tabs",
  "title": "Firefox Tabs",
  "description": "Search and switch Firefox tabs from Raycast",
  "icon": "icon.png",
  "author": "stelau",
  "categories": ["Applications", "Productivity"],
  "license": "MIT",
  "commands": [
    {
      "name": "search-tabs",
      "title": "Search Firefox Tabs",
      "description": "Search open Firefox tabs by title or URL",
      "mode": "view"
    }
  ],
  "dependencies": {
    "@raycast/api": "^1.104.0",
    "@raycast/utils": "^2.2.0"
  },
  "devDependencies": {
    "@raycast/eslint-config": "^1.0.0",
    "typescript": "^5.0.0",
    "@types/node": "^22.0.0"
  },
  "scripts": {
    "dev": "ray develop",
    "build": "ray build -e dist",
    "lint": "ray lint"
  }
}
```

### TypeScript Configuration (tsconfig.json)
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "outDir": "dist"
  },
  "include": ["src/**/*", "raycast-env.d.ts"]
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `node-fetch` for HTTP requests | Built-in `fetch` (Node.js 22) / `useFetch` hook | Node.js 22 + Raycast utils v2 | No need for `node-fetch` dependency |
| Manual `useState`/`useEffect` for data loading | `useFetch` with automatic loading states | `@raycast/utils` v1.0+ | Significantly less boilerplate |
| Custom search/filter logic | Raycast built-in fuzzy filtering with `keywords` | Raycast API 1.25+ | Free fuzzy search, no custom code needed |
| Separate `create-raycast-extension` CLI | Raycast "Create Extension" command in app | Current | Scaffold via Raycast UI, not npm CLI |

**Deprecated/outdated:**
- `npx create-raycast-extension` is NOT a standard CLI command; extensions are scaffolded via the "Create Extension" command within the Raycast application itself, or by manually creating the project structure
- Raycast extensions previously required `node-fetch`; this is no longer needed with Node.js 22's built-in `fetch`

## Existing Codebase Integration Points

### HTTP API Contract (from Phase 2)
The native messaging host at `http://127.0.0.1:{port}` exposes:

**GET /tabs** returns:
```json
{
  "ok": true,
  "data": {
    "tabs": [
      {
        "id": 2,
        "windowId": 58,
        "title": "New Tab",
        "url": "about:home",
        "favIconUrl": "chrome://branding/content/icon32.png",
        "active": false,
        "pinned": false,
        "incognito": false,
        "status": "complete",
        "cookieStoreId": "firefox-default",
        "container": null
      }
    ],
    "total": 5,
    "page": 1,
    "pageSize": 5,
    "hasMore": false
  },
  "meta": { "count": 5, "timestamp": 1770463332013 }
}
```

**GET /health** returns server status including `firefoxConnected` boolean.

**Port discovery:** Port is written to `~/.raycast-firefox/port` by the native host (see `lifecycle.js`).

**POST /switch** (for Phase 4, not Phase 3):
```json
{ "tabId": 123, "windowId": 58 }
```

### Key Constants
- Default port: `26394` (defined in `native-host/src/server.js` as `BASE_PORT`)
- Port file: `~/.raycast-firefox/port`
- Config dir: `~/.raycast-firefox/`

## Open Questions

1. **Extension placement in project structure**
   - What we know: The project has `extension/` (Firefox WebExtension) and `native-host/` at the root
   - What's unclear: Should the Raycast extension go in `raycast-extension/` or `raycast/` at the project root?
   - Recommendation: Use `raycast-extension/` to be clear and unambiguous. It parallels `extension/` (Firefox) and `native-host/` naming.

2. **Scaffolding method**
   - What we know: Raycast's recommended approach is the "Create Extension" command in Raycast UI. However, the project structure is simple enough to create manually.
   - What's unclear: Whether using the Raycast UI scaffolder adds hidden configuration that manual creation misses.
   - Recommendation: Create manually since we know the exact structure needed. The Raycast scaffolder mainly generates boilerplate we'd replace anyway. Run `npm run dev` to validate the extension loads.

3. **Port reading frequency**
   - What we know: `getPort()` reads the port file synchronously from disk
   - What's unclear: Whether `getPort()` should be called once at command launch or on every re-render
   - Recommendation: Call once at component initialization (outside the component or with `useMemo`). The port doesn't change during a single Raycast command invocation.

## Sources

### Primary (HIGH confidence)
- Context7 `/websites/developers_raycast` - Raycast API reference for List, List.Item, useFetch, getFavicon, package.json manifest format
- https://developers.raycast.com/api-reference/user-interface/list - List.Item props (title, subtitle, keywords, accessories, icon)
- https://developers.raycast.com/utilities/react-hooks/usefetch - useFetch hook API, mapResult, keepPreviousData, failureToastOptions
- https://developers.raycast.com/utilities/getting-started - @raycast/utils v2.2.2, installation
- https://developers.raycast.com/information/manifest - package.json manifest format for extensions
- https://developers.raycast.com/information/file-structure - src/ folder, command entry point naming
- https://developers.raycast.com/basics/getting-started - Node.js 22.14+, npm 7+ requirements
- Codebase: `/Users/stephen/code/raycast-firefox/native-host/src/server.js` - HTTP API endpoints, port 26394, response format
- Codebase: `/Users/stephen/code/raycast-firefox/native-host/src/lifecycle.js` - Port file at `~/.raycast-firefox/port`
- Codebase: `/Users/stephen/code/raycast-firefox/extension/background.js` - Tab data shape (id, windowId, title, url, favIconUrl, active, pinned, etc.)
- Live API test: `curl http://127.0.0.1:26394/tabs` - Verified actual response envelope format

### Secondary (MEDIUM confidence)
- Context7 `/raycast/extensions` - Google Chrome extension patterns, BrowserExtension API
- https://developers.raycast.com/basics/create-your-first-extension - Extension creation workflow

### Tertiary (LOW confidence)
- https://github.com/marwan-tanager/raycast-extensions-browser-tabs - Community browser tabs extension (AppleScript-based, different architecture)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Raycast's own documentation is authoritative; `@raycast/api` and `@raycast/utils` are the only required libraries
- Architecture: HIGH - Pattern is well-documented in Raycast API docs with multiple code examples; verified against live API response from our native host
- Pitfalls: HIGH - `keywords` vs `subtitle` for search indexing confirmed via official docs; filtering behavior documented officially

**Research date:** 2026-02-07
**Valid until:** 2026-03-07 (Raycast API is stable; 30-day validity)
