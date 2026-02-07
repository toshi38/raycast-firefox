# Requirements: Raycast Firefox

**Defined:** 2026-02-06
**Core Value:** Quickly find and switch to any open Firefox tab without leaving the keyboard

## v1 Requirements

### Communication Layer

- [x] **COMM-01**: Companion Firefox WebExtension that uses `browser.tabs` API to access tab data
- [ ] **COMM-02**: Native Messaging Host that bridges Firefox WebExtension and Raycast extension via localhost HTTP
- [ ] **COMM-03**: Native messaging protocol implementation (length-prefixed JSON over stdin/stdout)
- [ ] **COMM-04**: Automated setup command to register native messaging host manifest with Firefox

### Tab Search

- [ ] **TABS-01**: User can search open Firefox tabs by title and URL via fuzzy matching
- [ ] **TABS-02**: Tab list displays URL as subtitle for each tab
- [ ] **TABS-03**: Active tab is visually indicated in the list
- [ ] **TABS-04**: Tab list displays favicon for each tab

### Tab Actions

- [ ] **ACTN-01**: User can switch to a selected tab (Firefox comes to front, tab activates)
- [ ] **ACTN-02**: User can close a tab from Raycast without switching to it

### Error Handling

- [ ] **ERRH-01**: Clear message when Firefox is not running
- [ ] **ERRH-02**: Clear message when companion WebExtension is not installed
- [ ] **ERRH-03**: Clear message when native messaging host is not registered

## v2 Requirements

### Tab Features

- **TABV2-01**: Copy tab URL to clipboard
- **TABV2-02**: Copy tab as Markdown link [title](url)
- **TABV2-03**: Open new tab with URL from Raycast

### Bookmarks

- **BOOK-01**: Search Firefox bookmarks by title and URL
- **BOOK-02**: Open selected bookmark in Firefox

### History

- **HIST-01**: Search Firefox browsing history
- **HIST-02**: Open selected history entry in Firefox

## Out of Scope

| Feature | Reason |
|---------|--------|
| Multi-browser support | Firefox-only focus; no need to abstract |
| Tab content search (full-text) | Extremely complex; requires indexing page content |
| Bookmark modification (add/delete/edit) | High risk, low value for a quick-launch tool |
| History clearing | Destructive action; too dangerous for quick-launch |
| Browser automation (forms, clicks) | Out of scope; that's Puppeteer/Playwright territory |
| Cross-device sync | Privacy constraint; all data stays local |
| Move tabs between windows | No browser extension does this well; complex edge cases |
| Auto tab management (close stale, auto-group) | Opinionated behavior users don't expect from Raycast |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| COMM-01 | Phase 1 | Complete |
| COMM-02 | Phase 2 | Pending |
| COMM-03 | Phase 2 | Pending |
| COMM-04 | Phase 8 | Pending |
| TABS-01 | Phase 3 | Pending |
| TABS-02 | Phase 3 | Pending |
| TABS-03 | Phase 5 | Pending |
| TABS-04 | Phase 5 | Pending |
| ACTN-01 | Phase 4 | Pending |
| ACTN-02 | Phase 6 | Pending |
| ERRH-01 | Phase 7 | Pending |
| ERRH-02 | Phase 7 | Pending |
| ERRH-03 | Phase 7 | Pending |

**Coverage:**
- v1 requirements: 13 total
- Mapped to phases: 13
- Unmapped: 0

---
*Requirements defined: 2026-02-06*
*Last updated: 2026-02-07 after Phase 1 completion*
