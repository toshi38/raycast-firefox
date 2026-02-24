# Phase 5: Tab List Polish - Context

**Gathered:** 2026-02-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Visual polish for the tab list: active tab indicator, favicons, fallback icons, and list item metadata. The tab list already works (Phase 3) with search and switching (Phase 4). This phase makes it look polished and match Chrome/Safari Raycast extension quality.

</domain>

<decisions>
## Implementation Decisions

### Active tab indicator
- Tag/badge with text "Active" in green color
- Show "Active" tag on all active tabs (one per window, not just frontmost)
- Windows should also be tagged (see List item layout)

### Favicon presentation
- Favicons as the main list item icon (left position)
- Source: Firefox favIconUrl from browser.tabs (not Raycast's getFavicon service)
- Native host caches favicons: in-memory for fast access + disk persistence across restarts
- Pass favicon data from WebExtension through native host to Raycast

### Fallback icons
- Letter avatar (first letter of title) with colored circle background
- Color varies by domain/hostname — same domain gets same color
- Firefox icon for about:* internal pages (about:blank, about:config, etc.)
- Loading tabs show a loading indicator icon, then switch to correct icon when loaded

### List item layout
- Title as main text, cleaned URL as subtitle (hostname + path, no protocol/query)
- Search still matches against full URL including https and query params
- Window tag always shown: "W1", "W2", etc. (even with single window)
- Container tag shown only for container tabs, using the container's Firefox color
- No tag for tabs without a container
- Pinned tabs get a pin icon/indicator
- Flat list (no section grouping by window)

### Tab ordering
- Sorted by lastAccessed timestamp, most recently accessed first
- Cross-window interleaved — all tabs globally sorted regardless of window
- Active tab sorted naturally (no special pinning to top)
- Pinned tabs mixed in naturally by last accessed time

### Claude's Discretion
- Exact letter avatar color palette/algorithm
- Loading indicator icon choice
- Pin indicator implementation (icon vs tag)
- Favicon disk cache location and eviction strategy
- Exact favicon data format through the pipeline

</decisions>

<specifics>
## Specific Ideas

- Display shows hostname + path but search matches full URL (including https, query params) for finding hard-to-find tabs
- Window tags use compact format: W1, W2, W3
- Container tags use Firefox's assigned container colors for familiarity
- "Active" tag is green to stand out

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 05-tab-list-polish*
*Context gathered: 2026-02-09*
