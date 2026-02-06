# Features Research: Browser-Control Raycast Extensions

> Research date: 2026-02-06
> Purpose: Understand the feature landscape of existing browser-control Raycast extensions to inform requirements for raycast-firefox.

---

## 1. Existing Extensions Surveyed

### Official / High-Quality Extensions

| Extension | Author | Browser | Installs | Notes |
|-----------|--------|---------|----------|-------|
| **Safari** | Raycast (official) | Safari | Very high | Gold standard; deepest OS integration |
| **Google Chrome** | Raycast (community) | Chrome | Very high | Chromium baseline; uses AppleScript |
| **Arc** | Thomas Paul Mann / community | Arc | High | Arc-specific features (spaces, boosts) |
| **Brave** | community | Brave | Medium | Chrome-based, similar commands |
| **Vivaldi** | community | Vivaldi | Low | Chrome-based |

### Existing Firefox Extensions

| Extension | Author | Key Limitation |
|-----------|--------|---------------|
| **Search Firefox** | nicholasxjy | Reads SQLite DB directly (places.sqlite); read-only; cannot switch tabs or control browser |
| **Firefox** | kud | Uses AppleScript (limited Firefox support); basic tab listing |

**Key insight**: No existing Firefox extension has full tab switching + search. This is our core opportunity.

---

## 2. Feature Inventory Across Extensions

### 2.1 Tab Management

| Feature | Safari | Chrome | Arc | Brave | Firefox (existing) |
|---------|--------|--------|-----|-------|-------------------|
| Search open tabs (title + URL) | Yes | Yes | Yes | Yes | Partial (kud) |
| Switch to tab (activate + focus) | Yes | Yes | Yes | Yes | No |
| Close tab | Yes | Yes | Yes | Yes | No |
| Close other tabs | Yes | No | No | No | No |
| Open new tab | Yes | Yes | Yes | Yes | No |
| Open new tab with URL | Yes | Yes | Yes | Yes | No |
| Duplicate tab | No | No | Yes | No | No |
| Pin/unpin tab | No | No | Yes | No | No |
| Move tab between windows | No | No | No | No | No |

### 2.2 Bookmarks

| Feature | Safari | Chrome | Arc | Brave | Firefox (existing) |
|---------|--------|--------|-----|-------|-------------------|
| Search bookmarks | Yes | Yes | No | Yes | Yes (nicholasxjy; SQLite) |
| Open bookmark | Yes | Yes | No | Yes | Partial (opens URL) |
| Add bookmark | No | No | No | No | No |
| Delete bookmark | No | No | No | No | No |
| Bookmark folders | Yes | Yes | No | Yes | Yes |

### 2.3 History

| Feature | Safari | Chrome | Arc | Brave | Firefox (existing) |
|---------|--------|--------|-----|-------|-------------------|
| Search history | Yes | Yes | No | Yes | Yes (nicholasxjy; SQLite) |
| Open history item | Yes | Yes | No | Yes | Yes |
| Clear history | No | No | No | No | No |

### 2.4 Reading List (Safari-specific)

| Feature | Safari | Chrome | Arc | Brave | Firefox (existing) |
|---------|--------|--------|-----|-------|-------------------|
| Search reading list | Yes | N/A | N/A | N/A | N/A |
| Add to reading list | Yes | N/A | N/A | N/A | N/A |

### 2.5 Window Management

| Feature | Safari | Chrome | Arc | Brave | Firefox (existing) |
|---------|--------|--------|-----|-------|-------------------|
| New window | Yes | Yes | Yes | Yes | No |
| New incognito/private window | Yes | Yes | No | Yes | No |
| List windows | Implicit | Implicit | Yes | Implicit | No |

### 2.6 Navigation & Page Actions

| Feature | Safari | Chrome | Arc | Brave | Firefox (existing) |
|---------|--------|--------|-----|-------|-------------------|
| Copy current tab URL | Yes | Yes | Yes | Yes | No |
| Copy tab title + URL | Yes | Yes | Yes | Yes | No |
| Copy as Markdown link | Yes | Yes | Yes | No | No |
| Reload tab | No | No | Yes | No | No |

### 2.7 Browser-Specific Features

| Feature | Browser | Description |
|---------|---------|-------------|
| Spaces | Arc | Search/switch Arc spaces |
| Boosts | Arc | Manage Arc boosts |
| Profiles | Chrome/Brave | Switch between browser profiles |
| Sidebar items | Arc | List and open sidebar items |
| Little Arc | Arc | Open URL in Arc mini-window |
| Tab Groups | Chrome | Search within tab groups |

---

## 3. Communication Mechanisms

Understanding how each extension talks to its browser is critical for Firefox:

| Browser | Primary Mechanism | Fallback | Notes |
|---------|------------------|----------|-------|
| Safari | AppleScript (native) | SQLite (bookmarks/history) | Best macOS integration; System Events API |
| Chrome | AppleScript | SQLite (history/bookmarks) | Good AppleScript support via "tell application" |
| Arc | AppleScript | Arc-specific APIs | Custom AppleScript dictionary |
| Brave | AppleScript | SQLite | Same as Chrome (Chromium-based) |
| Firefox (existing) | SQLite (places.sqlite) | AppleScript (very limited) | Firefox has minimal AppleScript support; no tab control via AppleScript |

**Firefox challenge**: Firefox's AppleScript dictionary is extremely limited (basically just `open location`). No ability to list tabs, switch tabs, or query state via AppleScript. This is the core technical challenge.

**Possible Firefox approaches**:
1. **Native Messaging + WebExtension**: Build a Firefox WebExtension that exposes tab data via Native Messaging protocol to a local process. The Raycast extension communicates with that process.
2. **Firefox Remote Debugging Protocol (CDP-like)**: Firefox supports a remote debugging protocol on a local port. Could query tabs this way.
3. **Accessibility API (macOS)**: Use macOS Accessibility APIs to read tab titles from the Firefox window. Fragile but no Firefox extension needed.
4. **SQLite for read-only data**: Bookmarks and history can be read from `places.sqlite` (like existing extensions do). But this does NOT include open tabs.
5. **sessionstore.jsonlz4**: Firefox stores session data (including open tabs) in a compressed file. Can be read but is a snapshot, not live.

---

## 4. Feature Classification for raycast-firefox

### TABLE STAKES (Must have or users will not adopt)

These features are present in every major browser extension and define the minimum viable product:

| # | Feature | Complexity | Dependencies | Rationale |
|---|---------|-----------|--------------|-----------|
| T1 | **Search open tabs by title and URL** | Medium | Communication layer (Firefox <-> Raycast) | Core value proposition; every browser extension has this |
| T2 | **Switch to selected tab** (focus Firefox window + activate tab) | Medium | T1, communication layer | Useless to search without switching; every extension does this |
| T3 | **Fuzzy matching** on search | Low | T1 | Raycast provides this via `<List>` component; users expect it |
| T4 | **Show favicon** for each tab | Low | T1, favicon access | Visual polish; all major extensions show favicons |
| T5 | **Show tab URL as subtitle/accessory** | Low | T1 | Standard UX pattern across all browser extensions |
| T6 | **Open new tab with URL** | Low | Communication layer | Basic browser control; all extensions have this |
| T7 | **Copy current tab URL** | Low | Communication layer | Extremely common action; Safari/Chrome/Arc all have it |

### DIFFERENTIATORS (Competitive advantage over existing Firefox extensions)

These features would make raycast-firefox clearly better than the existing Firefox extensions:

| # | Feature | Complexity | Dependencies | Rationale |
|---|---------|-----------|--------------|-----------|
| D1 | **Close tab from Raycast** | Low | Communication layer | Existing Firefox extensions cannot do this |
| D2 | **Search bookmarks** | Medium | SQLite access OR WebExtension | nicholasxjy does this via SQLite; we should match it |
| D3 | **Search history** | Medium | SQLite access | nicholasxjy does this via SQLite; we should match it |
| D4 | **Copy URL as Markdown link** | Low | T7 | Nice productivity feature; Safari and Chrome have it |
| D5 | **Multiple window support** (show which window a tab is in) | Medium | Communication layer | Good UX when user has many windows |
| D6 | **Open new private window** | Low | Communication layer | Common feature in Chrome/Brave extensions |
| D7 | **Tab preview** (show page title, URL, maybe screenshot) | Medium | Communication layer | Helps identify tabs with similar titles |
| D8 | **Quicklink support** (deeplinks for specific actions) | Low | Raycast API | Lets users create shortcuts to specific browser actions |

### NICE TO HAVE (v2+ features, not critical for launch)

| # | Feature | Complexity | Dependencies | Rationale |
|---|---------|-----------|--------------|-----------|
| N1 | **Tab groups / containers** | High | WebExtension with container API | Firefox Container Tabs are unique; could be differentiating |
| N2 | **Recently closed tabs** | Medium | Communication layer or sessionstore | Useful recovery feature |
| N3 | **Pin/unpin tab** | Low | Communication layer | Arc has this; low value for most users |
| N4 | **Reload tab** | Low | Communication layer | Arc has this; niche utility |
| N5 | **Multiple profile support** | High | Profile detection + per-profile communication | Chrome/Brave have this; Firefox has profiles too |
| N6 | **Reading list integration** | Medium | WebExtension or Pocket API | Firefox has Pocket built in; could integrate |

### ANTI-FEATURES (Deliberately do NOT build)

| # | Feature | Rationale |
|---|---------|-----------|
| A1 | **Modify bookmarks** (add/delete/edit) | No browser extension does this; high risk, low value. Read-only is sufficient. |
| A2 | **Clear history** | Destructive action; too dangerous for a quick-launch tool |
| A3 | **Full browser automation** (fill forms, click buttons, etc.) | Out of scope; that's Puppeteer/Playwright territory |
| A4 | **Cross-browser support** | Scope creep; focus on Firefox excellence |
| A5 | **Sync/cloud features** | Privacy constraint from PROJECT.md; all data stays local |
| A6 | **Tab content search** (search within page text) | Extremely complex; requires indexing page content; poor ROI |
| A7 | **Move tabs between windows** | No browser extension does this well; complex edge cases |
| A8 | **Automatic tab management** (auto-close stale tabs, auto-group) | Opinionated behavior that users don't expect from a Raycast extension |

---

## 5. Dependency Graph

```
Communication Layer (CRITICAL PATH)
├── Tab Data Access (T1)
│   ├── Search open tabs (T1)
│   ├── Show favicon (T4)
│   ├── Show URL as subtitle (T5)
│   └── Fuzzy matching (T3) — provided by Raycast List component
├── Tab Control
│   ├── Switch to tab (T2) — depends on T1
│   ├── Close tab (D1) — depends on T1
│   ├── Open new tab (T6)
│   └── Open private window (D6)
├── Page Info Access
│   ├── Copy URL (T7)
│   └── Copy as Markdown (D4) — depends on T7
└── Window Awareness (D5)

SQLite Access (INDEPENDENT PATH)
├── Bookmark search (D2)
├── History search (D3)
└── Recently closed tabs (N2) — partial, from sessionstore

No Dependencies (Raycast-only)
├── Quicklink support (D8)
└── Fuzzy matching (T3)
```

---

## 6. Complexity Analysis

### The Core Technical Risk: Communication Layer

The single biggest differentiator between "works great" and "doesn't work" is the communication mechanism between Raycast and Firefox.

**Recommended approach: Native Messaging + Firefox WebExtension**

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| **Native Messaging + WebExtension** | Full tab API access; can list, switch, close tabs; real-time data; officially supported | Requires user to install a Firefox extension; two-part installation | **Best option** for full control |
| **Firefox Remote Protocol** | No extension needed; programmatic access | Requires user to enable remote debugging (security concern); protocol is unstable | Risky for end users |
| **Accessibility API** | No Firefox extension needed | Fragile; can't get URLs; can't control tabs; breaks with UI changes | Insufficient |
| **sessionstore.jsonlz4** | No extension needed; gets open tab data | Read-only snapshot; can't switch tabs; file locked while Firefox running | Insufficient for tab switching |
| **AppleScript** | Standard macOS approach | Firefox AppleScript dictionary is nearly empty; can only `open location` | Insufficient |
| **Hybrid: SQLite + Native Messaging** | SQLite for bookmarks/history (proven); Native Messaging for tabs (full control) | Still requires WebExtension for tab features | **Recommended composite** |

### Complexity Ratings

| Rating | Meaning | Examples |
|--------|---------|---------|
| **Low** | < 1 day; uses existing Raycast APIs or simple data transforms | Copy URL, fuzzy search UI, open new tab |
| **Medium** | 1-3 days; requires integration work or non-trivial logic | SQLite reading, tab list rendering with favicons, window grouping |
| **High** | 3+ days; requires significant architecture or research | Communication layer, Native Messaging setup, container tab support |
| **Critical** | Blocking; must be solved before any other feature works | Communication layer design and implementation |

---

## 7. Recommended MVP Feature Set (v1)

Based on this analysis, the minimum viable extension is:

1. **T1** - Search open tabs (title + URL)
2. **T2** - Switch to selected tab
3. **T3** - Fuzzy matching (free via Raycast)
4. **T4** - Show favicon
5. **T5** - Show URL as subtitle
6. **T7** - Copy current tab URL (action)
7. **D1** - Close tab (action, since we have the communication layer anyway)

**Total complexity**: 1 Critical (communication layer) + 1 Medium (tab data UI) + several Low

### v1.1 (Quick wins after MVP)
- **T6** - Open new tab with URL
- **D4** - Copy as Markdown link
- **D6** - Open private window

### v2 (Significant new capability)
- **D2** - Bookmark search (SQLite path, independent of communication layer)
- **D3** - History search (SQLite path)
- **D5** - Window awareness

---

## 8. Key Insights

1. **No existing Firefox extension can switch tabs.** This is the fundamental gap. The existing "Search Firefox" extension by nicholasxjy only reads SQLite for bookmarks/history. The "Firefox" extension by kud attempts AppleScript but it's severely limited. Our extension filling this gap is the core value proposition.

2. **The communication layer is the entire technical risk.** Every other feature is straightforward Raycast API usage. Solve the communication layer and everything else falls into place.

3. **SQLite is proven for read-only data.** Bookmarks and history can reliably be read from Firefox's `places.sqlite`. This is how existing extensions work. We should use this for v2 features.

4. **Safari sets the bar, but Chrome is the realistic target.** Safari has the deepest integration due to native macOS APIs. Chrome has a good AppleScript dictionary. Our Firefox extension should aim for Chrome-level feature parity, with the understanding that our communication mechanism will be different.

5. **Favicons matter more than you'd think.** Every polished browser extension shows favicons. They make the tab list scannable. Worth investing in from day one.

6. **Action menu patterns are consistent.** All browser extensions use a similar action menu: primary action is "switch to tab", secondary actions include copy URL, copy as markdown, close tab, open new tab. We should follow this convention.

---

*This research feeds into requirements definition. See PROJECT.md for scope decisions.*
