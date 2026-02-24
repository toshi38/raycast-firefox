# Phase 5: Tab List Polish - Research

**Researched:** 2026-02-09
**Domain:** Raycast List.Item visual polish (icons, accessories, tags, favicons)
**Confidence:** HIGH

## Summary

This phase transforms the functional tab list into a polished UI matching Chrome/Safari Raycast extension quality. The work spans three layers: the WebExtension (adding `lastAccessed`, `colorCode`, and favicon data extraction), the native host (favicon caching), and the Raycast extension (List.Item icon, subtitle, accessories, sorting, and fallback icons).

The Raycast API fully supports data URIs as `Image.ImageLike` values -- confirmed by inspecting `getAvatarIcon()` which returns `data:image/svg+xml,...` strings. Firefox's `favIconUrl` returns HTTPS URLs, so the WebExtension must fetch/convert to base64 for the native host pipeline. Favicon data is too large to include inline with every tab list response (could exceed the 512KB budget), so the native host must cache favicons separately and serve them via a dedicated endpoint.

**Primary recommendation:** Implement favicons as a separate `/favicon/:tabId` HTTP endpoint on the native host with in-memory + disk cache, rather than embedding favicon data in the tab list response. The Raycast extension fetches favicon URLs per-tab using this endpoint.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Active tab indicator: Tag/badge with text "Active" in green color; show on all active tabs (one per window)
- Favicon presentation: Favicons as main list item icon (left position); source is Firefox favIconUrl (not Raycast getFavicon service); native host caches favicons in-memory + disk; pass favicon data from WebExtension through native host to Raycast
- Fallback icons: Letter avatar (first letter of title) with colored circle background; color varies by domain/hostname (same domain = same color); Firefox icon for about:* pages; loading tabs show loading indicator then switch to correct icon
- List item layout: Title as main text, cleaned URL as subtitle (hostname + path, no protocol/query); search matches full URL; window tag always shown (W1, W2, etc.); container tag shown only for container tabs using Firefox color; no tag for non-container tabs; pinned tabs get pin icon/indicator; flat list (no section grouping)
- Tab ordering: Sorted by lastAccessed timestamp (most recent first); cross-window interleaved; active tab sorted naturally (no pinning to top); pinned tabs mixed naturally by last accessed time

### Claude's Discretion
- Exact letter avatar color palette/algorithm
- Loading indicator icon choice
- Pin indicator implementation (icon vs tag)
- Favicon disk cache location and eviction strategy
- Exact favicon data format through the pipeline

### Deferred Ideas (OUT OF SCOPE)
None
</user_constraints>

## Standard Stack

### Core (already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @raycast/api | ^1.104.0 | List.Item, Icon, Color, Image types | Required framework |
| @raycast/utils | ^2.2.0 | getAvatarIcon (letter avatars), usePromise | Official utilities |

### Supporting (no new dependencies needed)
| Library | Purpose | Notes |
|---------|---------|-------|
| Node.js `fs` | Favicon disk cache read/write | Already used in native host |
| Node.js `crypto` | Hash for cache keys | Already used in bridge.js |
| Node.js `path` | Cache directory paths | Already used in lifecycle.js |

**No new dependencies required.** Everything needed is already in the stack.

## Architecture Patterns

### Data Flow: Favicon Pipeline

```
Firefox tab.favIconUrl (HTTPS URL)
    |
    v
WebExtension: fetch() URL -> ArrayBuffer -> base64 data URI
    |
    v
Native Messaging: include favicons in tab data OR separate endpoint
    |
    v
Native Host: in-memory Map cache + disk cache (~/.raycast-firefox/favicons/)
    |
    v
HTTP /favicon?url=<encoded-url>: serve cached favicon as data URI string
    |
    v
Raycast extension: use data URI as Image.ImageLike icon
```

### Recommended Approach: Hybrid Favicon Strategy

**Confidence: HIGH** (based on codebase analysis)

The key tension: the user decided favicons come from Firefox `favIconUrl`, but including base64 favicon data for all tabs in the list-tabs response would blow past the 512KB response budget (100 tabs x ~5KB/favicon = 500KB of favicon data alone).

**Recommended approach:**

1. **WebExtension sends favIconUrl string** (the HTTPS URL) with each tab -- already happening
2. **Native host caches favicon data** fetched from those URLs, keyed by URL
3. **Raycast extension** uses a dedicated endpoint or includes favicon URLs in the response for the extension to fetch directly

**Simplest viable approach (recommended):** Since `Image.ImageLike` accepts any URL string, and `favIconUrl` is typically an HTTPS URL (e.g., `https://www.google.com/favicon.ico`), the Raycast extension can use the `favIconUrl` directly as the icon source with a fallback. No need to base64-encode or cache at the native host level for the initial implementation.

```typescript
// Image.ImageLike accepts URL strings directly
icon={tab.favIconUrl ? { source: tab.favIconUrl, fallback: fallbackIcon } : fallbackIcon}
```

**However**, the user explicitly decided "Native host caches favicons" and "Pass favicon data from WebExtension through native host to Raycast." This means the intended architecture is:

1. WebExtension fetches favicon image data, converts to base64
2. Sends base64 data via native messaging to host
3. Host caches to disk + memory
4. Raycast extension receives favicon data URIs

**For the caching approach, two options:**

**Option A: Inline with tab data (simpler but risky)**
- Include `faviconData: "data:image/png;base64,..."` in each tab object
- Risk: blows past 512KB response limit with many tabs

**Option B: Separate favicon endpoint (recommended)**
- Tab list response includes only `favIconUrl` (the HTTPS URL)
- Native host has a `/favicon?url=<encoded>` endpoint that returns cached base64 data
- Raycast extension fetches favicons separately per-tab
- Adds complexity but stays within response budget

**Recommendation: Option B** -- separate endpoint. This respects both the user's caching decision and the existing 512KB response budget constraint.

### Recommended Project Structure Changes

```
extension/
  background.js           # Add: lastAccessed, colorCode, favicon fetching
native-host/
  src/
    server.js             # Add: GET /favicon endpoint
    favicon-cache.js      # NEW: in-memory + disk favicon cache
  host.js                 # Wire favicon cache
raycast-extension/
  src/
    search-tabs.tsx        # Major: icon, subtitle, accessories, sorting
  assets/
    firefox-icon.png       # NEW: Firefox logo for about:* pages
```

### Pattern: List.Item Accessory Tags (from Raycast API)

**Confidence: HIGH** (verified from @raycast/api type definitions)

```typescript
// Tag accessory with color
accessories={[
  { tag: { value: "Active", color: Color.Green } },
  { tag: { value: "W1", color: Color.Blue } },
  { tag: { value: "Personal", color: "#37adff" } }, // Raw hex color
]}

// Tag type definition (from ItemAccessory):
// tag: string | Date | null | { value: string | Date | null; color?: Color.ColorLike }
// Color.ColorLike = Color | Color.Dynamic | Color.Raw (hex string)
```

### Pattern: Image.ImageLike for Icons

**Confidence: HIGH** (verified from type definitions + getAvatarIcon source)

```typescript
// Data URI (confirmed working - getAvatarIcon uses this pattern)
icon="data:image/svg+xml,..."

// HTTPS URL
icon="https://www.google.com/favicon.ico"

// With fallback and mask
icon={{ source: "https://example.com/favicon.ico", fallback: Icon.Globe, mask: Image.Mask.Circle }}

// Built-in icon with tint
icon={{ source: Icon.Pin, tintColor: Color.SecondaryText }}

// Type hierarchy:
// Image.ImageLike = Image.URL | Image.Asset | Icon | FileIcon | Image
// Image.URL = string (any URL string, including data: URIs)
// Image.Source = URL | Asset | Icon | { light, dark }
```

### Pattern: getAvatarIcon for Letter Avatars

**Confidence: HIGH** (verified from source code inspection)

```typescript
import { getAvatarIcon } from "@raycast/utils";

// Generates SVG data URI with letter initial + colored circle
// Same name/string always produces same color (deterministic)
const icon = getAvatarIcon("Google");  // "G" on colored circle
const icon2 = getAvatarIcon("GitHub"); // "G" on same color (same first char sum)

// With custom background
const icon3 = getAvatarIcon("A", { background: "#FF0000" });

// Returns: "data:image/svg+xml,<encoded-svg>"
// Uses 14-color palette, index = charCodeSum % 14
```

**For domain-deterministic colors**, we need a custom implementation since `getAvatarIcon` hashes by character sum of the full name, not by domain. Two "G" domains would get the same color. A custom approach hashing the hostname would give better distribution.

### Pattern: Container Color Mapping

**Confidence: MEDIUM** (color names confirmed; hex values need runtime verification)

Firefox contextual identities provide both a `color` name string and a `colorCode` hex string:

```javascript
// From contextualIdentities.query():
{
  cookieStoreId: "firefox-container-1",
  color: "blue",
  colorCode: "#37adff",  // <-- use this for Raycast Color.Raw
  name: "Personal",
  icon: "fingerprint"
}
```

Known color names: `blue`, `turquoise`, `green`, `yellow`, `orange`, `red`, `pink`, `purple`, `toolbar`

The `colorCode` property provides the exact hex value. Our background.js currently sends `color` (name) but should also send `colorCode` for use as `Color.Raw` in Raycast tags.

### Anti-Patterns to Avoid

- **Embedding favicon base64 in tab list response:** Would blow past the 512KB native messaging response budget with >50 tabs
- **Fetching favicons on every tab list request:** Would add latency; cache once, serve many times
- **Using `getAvatarIcon(title)` directly for fallback:** Produces colors based on full title char sum, not domain. Two pages on the same domain would get different colors. Need domain-based hashing instead
- **Grouping tabs by window in sections:** User explicitly decided flat list sorted by lastAccessed
- **Special-casing active tab position:** User decided active tab sorts naturally by lastAccessed

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Letter avatar generation | Custom SVG generation | `getAvatarIcon()` from @raycast/utils | Already generates SVG data URIs with colored circles; just customize the background color |
| Favicon from URL | Custom favicon fetcher | Direct URL in Image.ImageLike OR cached base64 | Raycast natively handles URL image sources |
| Tag accessories | Custom badge component | `List.Item.Accessory` with `tag` type | Built-in tag type with color support |
| URL cleaning | Manual regex | `new URL()` API | Parse hostname + pathname reliably |

**Key insight:** `getAvatarIcon(letter, { background: colorForDomain })` can generate domain-colored letter avatars. Compute the color from a domain hash, then pass it as the `background` option.

## Common Pitfalls

### Pitfall 1: Favicon Data Exceeds Response Budget
**What goes wrong:** Including base64 favicon data for all tabs in the list-tabs response exceeds the 512KB native messaging limit.
**Why it happens:** Each favicon is 0.5-13KB base64-encoded. With 100+ tabs, total easily exceeds 512KB.
**How to avoid:** Serve favicons via a separate HTTP endpoint, not inline in tab list data.
**Warning signs:** Response trimming kicks in aggressively, losing tab data.

### Pitfall 2: favIconUrl is Undefined or Empty
**What goes wrong:** `tab.favIconUrl` is undefined (no favicon), empty string (loading), or points to an internal `about:` URL.
**Why it happens:** Firefox returns undefined when no favicon exists, empty string while loading, and doesn't provide favicons for internal pages.
**How to avoid:** Always have fallback logic: `favIconUrl` -> letter avatar -> Firefox icon (for about:* pages).
**Warning signs:** Blank/missing icons in the list.

### Pitfall 3: Keywords Must Include Full URL for Search
**What goes wrong:** Changing subtitle from full URL to cleaned URL breaks search matching on protocol/query params.
**Why it happens:** Raycast's built-in filter searches title + subtitle + keywords. If subtitle no longer has the full URL, keywords must compensate.
**How to avoid:** Add the full URL string to the `keywords` array alongside the existing URL parts.
**Warning signs:** Users can't find tabs by typing "https" or query parameter values.

### Pitfall 4: lastAccessed Not Currently in Tab Data
**What goes wrong:** Sorting by lastAccessed fails because the field isn't being sent from the WebExtension.
**Why it happens:** The background.js `handleListTabs` maps specific fields but doesn't include `lastAccessed`.
**How to avoid:** Add `lastAccessed: tab.lastAccessed` to the mapped tab object in background.js.
**Warning signs:** Tabs appear in arbitrary Firefox internal order instead of recency order.

### Pitfall 5: Container colorCode Not Currently Sent
**What goes wrong:** Container tags can't use the exact Firefox color because only the color name is sent.
**Why it happens:** background.js maps `color: ci.color` but not `colorCode: ci.colorCode`.
**How to avoid:** Include `colorCode` in the container metadata sent from background.js.
**Warning signs:** Container tags use approximate Raycast Color enum values instead of exact Firefox colors.

### Pitfall 6: Window Number Assignment
**What goes wrong:** Window tags (W1, W2) are inconsistent between renders.
**Why it happens:** `windowId` is a Firefox internal ID (large integer), not a sequential number.
**How to avoid:** Compute window numbers by sorting unique windowIds and assigning sequential indices.
**Warning signs:** Tags show W1847363 instead of W1.

## Code Examples

### Complete List.Item with All Polish

```typescript
// Source: Raycast API type definitions + codebase analysis
import { List, Icon, Color, Image } from "@raycast/api";
import { getAvatarIcon } from "@raycast/utils";

// Compute window number from windowId
function getWindowNumber(windowId: number, allWindowIds: number[]): number {
  return allWindowIds.indexOf(windowId) + 1;
}

// Generate domain-deterministic color
function domainColor(hostname: string): string {
  const palette = [
    "#DC829A", "#D64854", "#D47600", "#D36CDD",
    "#52A9E4", "#7871E8", "#70920F", "#43B93A",
    "#EB6B3E", "#26B795", "#D85A9B", "#A067DC",
    "#BD9500", "#5385D9",
  ];
  let hash = 0;
  for (let i = 0; i < hostname.length; i++) {
    hash = hostname.charCodeAt(i) + ((hash << 5) - hash);
  }
  return palette[Math.abs(hash) % palette.length];
}

// Build fallback icon for tabs without favicons
function getFallbackIcon(tab: Tab): Image.ImageLike {
  // about:* pages -> Firefox icon
  if (tab.url.startsWith("about:")) {
    return { source: "firefox-icon.png" }; // bundled asset
  }
  // Loading tabs -> loading indicator
  if (tab.status === "loading") {
    return Icon.CircleProgress;
  }
  // Letter avatar with domain-based color
  const hostname = getHostname(tab.url);
  const letter = (tab.title || hostname || "?").charAt(0);
  return getAvatarIcon(letter, { background: domainColor(hostname) });
}

// Clean URL for subtitle display
function cleanUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    const path = parsed.pathname === "/" ? "" : parsed.pathname;
    return host + path;
  } catch {
    return url;
  }
}

// Build accessories array
function buildAccessories(tab: Tab, windowNumber: number): List.Item.Accessory[] {
  const accessories: List.Item.Accessory[] = [];

  // Pinned indicator
  if (tab.pinned) {
    accessories.push({ icon: Icon.Pin, tooltip: "Pinned" });
  }

  // Active tag
  if (tab.active) {
    accessories.push({ tag: { value: "Active", color: Color.Green } });
  }

  // Container tag (only for container tabs)
  if (tab.container) {
    accessories.push({
      tag: { value: tab.container.name, color: tab.container.colorCode || Color.SecondaryText },
    });
  }

  // Window tag (always shown)
  accessories.push({
    tag: { value: `W${windowNumber}`, color: Color.SecondaryText },
  });

  return accessories;
}

// List.Item render
<List.Item
  key={String(tab.id)}
  icon={tab.faviconData || getFallbackIcon(tab)}
  title={tab.title || "Untitled"}
  subtitle={cleanUrl(tab.url)}
  keywords={[tab.url, ...urlKeywords(tab.url)]}
  accessories={buildAccessories(tab, windowNumber)}
  actions={...}
/>
```

### Favicon Cache Module (Native Host)

```javascript
// Source: design based on codebase patterns (lifecycle.js, bridge.js)
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { logger } = require('./logger');

const CACHE_DIR = path.join(require('os').homedir(), '.raycast-firefox', 'favicons');
const MAX_MEMORY_ENTRIES = 500;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// In-memory cache: url -> { dataUri, timestamp }
const memoryCache = new Map();

function cacheKey(url) {
  return crypto.createHash('sha256').update(url).digest('hex');
}

function get(url) {
  // Check memory first
  const mem = memoryCache.get(url);
  if (mem) return mem.dataUri;

  // Check disk
  const key = cacheKey(url);
  const filePath = path.join(CACHE_DIR, key);
  try {
    const data = fs.readFileSync(filePath, 'utf-8');
    // Promote to memory cache
    memoryCache.set(url, { dataUri: data, timestamp: Date.now() });
    return data;
  } catch {
    return null;
  }
}

function set(url, dataUri) {
  // Memory cache with LRU eviction
  if (memoryCache.size >= MAX_MEMORY_ENTRIES) {
    const oldest = memoryCache.keys().next().value;
    memoryCache.delete(oldest);
  }
  memoryCache.set(url, { dataUri, timestamp: Date.now() });

  // Disk cache
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const key = cacheKey(url);
  fs.writeFileSync(path.join(CACHE_DIR, key), dataUri);
}

module.exports = { get, set, CACHE_DIR };
```

### WebExtension Favicon Fetching

```javascript
// Source: standard WebExtension fetch + canvas pattern
async function fetchFaviconAsDataUri(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}
```

### Tab Sorting by lastAccessed

```typescript
// Sort tabs by lastAccessed descending (most recent first)
const sortedTabs = [...tabs].sort((a, b) => {
  return (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0);
});
```

## State of the Art

| Old Approach (Current) | New Approach (This Phase) | Impact |
|------------------------|---------------------------|--------|
| `getFavicon(tab.url)` (Raycast service) | Firefox's own favIconUrl via native host cache | Privacy: no external service calls; accuracy: real Firefox favicon |
| Full URL as subtitle | Cleaned URL (hostname + path) as subtitle | Cleaner look, full URL still searchable via keywords |
| No accessories | Tags for Active, Window, Container, Pin icon | Visual information density matching Chrome/Safari extensions |
| Firefox internal tab order | Sorted by lastAccessed (most recent first) | User sees most relevant tabs first |
| No favicon caching | In-memory + disk cache in native host | Fast subsequent loads, persists across restarts |

## Discretion Recommendations

### Letter Avatar Color Palette
**Recommendation:** Use the same 14-color palette as `getAvatarIcon` from @raycast/utils (confirmed from source inspection). This ensures visual consistency with Raycast's design language.

**Algorithm:** Use djb2 hash of hostname (not full URL, not title) to select palette index. This ensures same-domain tabs always share a color.

```typescript
function domainColor(hostname: string): string {
  const palette = ["#DC829A","#D64854","#D47600","#D36CDD","#52A9E4","#7871E8",
                    "#70920F","#43B93A","#EB6B3E","#26B795","#D85A9B","#A067DC",
                    "#BD9500","#5385D9"];
  let hash = 0;
  for (let i = 0; i < hostname.length; i++) {
    hash = hostname.charCodeAt(i) + ((hash << 5) - hash);
  }
  return palette[Math.abs(hash) % palette.length];
}
```

### Loading Indicator Icon
**Recommendation:** `Icon.CircleProgress` -- it's a partial circle that visually suggests "in progress" and is purpose-built for loading states. Alternative: `Icon.ArrowClockwise` for a spinner feel.

### Pin Indicator Implementation
**Recommendation:** Pin **icon** (not tag) using `Icon.Pin` in the accessories array. Rationale:
- Pin is a binary state (yes/no), better expressed as a small icon than a text tag
- Saves horizontal space for more important text tags (Active, Container, Window)
- Consistent with how other Raycast extensions show boolean state indicators

```typescript
if (tab.pinned) {
  accessories.push({ icon: Icon.Pin, tooltip: "Pinned" });
}
```

### Favicon Disk Cache Location
**Recommendation:** `~/.raycast-firefox/favicons/` -- follows the existing pattern of `~/.raycast-firefox/` for the config directory (used by PID file, port file, logs). Favicon files are named by SHA-256 hash of the favicon URL.

### Eviction Strategy
**Recommendation:** Simple time-based eviction (7 days) + max entry count (500 in memory, unlimited on disk). Disk cleanup can be done lazily on startup. The 7-day TTL is generous because favicons rarely change, but short enough to prevent unbounded disk growth.

### Favicon Data Format Through Pipeline
**Recommendation:** Data URI format (`data:image/<type>;base64,<data>`) throughout the entire pipeline. The WebExtension converts to data URI, sends as a string, native host stores as a string, Raycast extension uses as `Image.ImageLike` (which accepts any string URL including data URIs).

## Open Questions

1. **Favicon fetch permissions in WebExtension**
   - What we know: WebExtension can fetch any URL with `<all_urls>` permission or matching host permissions. Our manifest has `tabs` permission but not explicit host permissions for favicon URLs.
   - What's unclear: Whether the background script can fetch arbitrary favicon URLs (HTTPS from any domain) without additional permissions. It likely can since background scripts in MV2 are not subject to the same CORS restrictions.
   - Recommendation: Test with a few URLs; if needed, add `<all_urls>` permission to manifest.

2. **Favicon fetch timing**
   - What we know: We don't want to fetch favicons on every tab list request.
   - What's unclear: When exactly should the WebExtension fetch and send favicon data? Options: (a) on tab list request, batch-fetch new favicons, (b) proactively on tab creation/update events, (c) lazily when the Raycast extension requests a specific favicon.
   - Recommendation: Option (c) -- lazy per-favicon endpoint. The native host checks cache first, fetches from the URL on miss. This avoids unnecessary work and the WebExtension doesn't need to be involved in favicon data transfer at all.

3. **Alternative: Direct URL approach**
   - What we know: `Image.ImageLike` accepts URL strings. The `favIconUrl` from Firefox is typically an HTTPS URL.
   - What's unclear: Whether Raycast can reliably fetch HTTPS favicon URLs directly (network access, caching behavior, timeout handling).
   - Recommendation: Start with the direct URL approach as a simpler implementation. If it proves unreliable (timeouts, CORS issues in Raycast), fall back to the native host caching approach. Both approaches are compatible -- the icon prop accepts either a URL string or a data URI string.

## Sources

### Primary (HIGH confidence)
- @raycast/api type definitions (`node_modules/@raycast/api/types/index.d.ts`) -- Image.ImageLike, List.Item.Accessory, Color enum
- @raycast/utils source (`node_modules/@raycast/utils/dist/main.js`) -- getAvatarIcon implementation, getFavicon implementation, color palette
- Project codebase -- background.js, search-tabs.tsx, server.js, bridge.js, lifecycle.js
- [MDN tabs.Tab documentation](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabs/Tab) -- favIconUrl format, lastAccessed property
- [MDN contextualIdentities.ContextualIdentity](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/contextualIdentities/ContextualIdentity) -- color and colorCode properties

### Secondary (MEDIUM confidence)
- [Raycast List API docs](https://developers.raycast.com/api-reference/user-interface/list) -- List.Item props and accessories
- [Raycast Icons & Images docs](https://developers.raycast.com/api-reference/user-interface/icons-and-images) -- Image types and Icon enum
- [Raycast Colors docs](https://developers.raycast.com/api-reference/user-interface/colors) -- Color enum and raw color support
- [Raycast getAvatarIcon docs](https://developers.raycast.com/utilities/icons/getavataricon) -- Avatar icon generation
- [Google Chrome Raycast extension](https://github.com/raycast/extensions/tree/main/extensions/google-chrome) -- Reference implementation for tab list UI patterns

### Tertiary (LOW confidence)
- WebSearch results on Firefox favIconUrl format -- consensus is HTTPS URLs, not data URIs
- WebSearch results on favicon sizes -- typically 0.5-10KB, 1-13KB base64-encoded

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- verified from installed packages and type definitions
- Architecture: HIGH -- patterns verified from codebase + Raycast API types
- Pitfalls: HIGH -- derived from codebase analysis and type system constraints
- Favicon pipeline: MEDIUM -- user decision is clear but implementation details have open questions about the simplest viable approach
- Container colors: MEDIUM -- colorCode property confirmed in docs but exact hex values for all colors need runtime verification

**Research date:** 2026-02-09
**Valid until:** 2026-03-09 (stable domain, 30-day validity)
