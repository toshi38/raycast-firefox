# Roadmap: Raycast Firefox

## Overview

This roadmap delivers a Raycast extension for Firefox tab control, structured as a risk-reduction pipeline. The communication layer (Firefox WebExtension + Native Messaging bridge) is built and validated first because every feature depends on it. Once the pipeline is proven, the Raycast UI, tab actions, visual polish, error handling, and setup automation are layered on incrementally -- each phase delivering an observable, testable capability.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Firefox WebExtension** - Companion extension that exposes tab data via the browser.tabs API
- [ ] **Phase 2: Native Messaging Bridge** - Native Messaging Host bridging Firefox to localhost HTTP
- [ ] **Phase 3: Raycast Tab List** - Raycast extension displaying open Firefox tabs with search
- [ ] **Phase 4: Tab Switching** - User can select a tab in Raycast and Firefox brings it to front
- [ ] **Phase 5: Tab List Polish** - Active tab indicator and favicons for visual completeness
- [ ] **Phase 6: Tab Close Action** - Close a tab from Raycast without switching to it
- [ ] **Phase 7: Error Handling** - Graceful messages when Firefox, WebExtension, or host is unavailable
- [ ] **Phase 8: Setup Automation** - Automated command to register native messaging host with Firefox

## Phase Details

### Phase 1: Firefox WebExtension
**Goal**: A working Firefox extension that can query all open tabs and respond to native messages
**Depends on**: Nothing (first phase)
**Requirements**: COMM-01
**Success Criteria** (what must be TRUE):
  1. Firefox WebExtension installs and loads without errors in Firefox
  2. WebExtension background script can enumerate all open tabs (titles, URLs, favicons, active state) via browser.tabs.query
  3. WebExtension listens for incoming native messages and responds with tab data as JSON
  4. WebExtension can receive a "switch tab" command and activate the specified tab via browser.tabs.update and browser.windows.update
**Plans**: TBD

Plans:
- [ ] 01-01: WebExtension manifest and background script scaffold
- [ ] 01-02: Tab query and native message response handler
- [ ] 01-03: Tab action handlers (switch, close)

### Phase 2: Native Messaging Bridge
**Goal**: A Node.js Native Messaging Host that bridges Firefox's native messaging protocol to a localhost HTTP server
**Depends on**: Phase 1
**Requirements**: COMM-02, COMM-03
**Success Criteria** (what must be TRUE):
  1. Native Messaging Host reads and writes length-prefixed JSON over stdin/stdout per Firefox's protocol spec
  2. Host runs a localhost HTTP server that accepts requests from Raycast
  3. HTTP GET to /tabs returns JSON array of all open Firefox tabs (fetched via native messaging from the WebExtension)
  4. HTTP POST to /switch with tabId/windowId triggers tab switch in Firefox via the WebExtension
  5. Full round-trip works: curl to localhost returns live tab data from Firefox
**Plans**: TBD

Plans:
- [ ] 02-01: Native messaging protocol (length-prefixed JSON stdin/stdout)
- [ ] 02-02: Localhost HTTP server with /tabs and /switch endpoints
- [ ] 02-03: End-to-end integration test (manual or scripted)

### Phase 3: Raycast Tab List
**Goal**: Users can invoke a Raycast command and see a searchable list of all open Firefox tabs
**Depends on**: Phase 2
**Requirements**: TABS-01, TABS-02
**Success Criteria** (what must be TRUE):
  1. User can invoke "Search Firefox Tabs" command from Raycast
  2. Raycast displays a list of all open Firefox tabs with title and URL
  3. User can type to fuzzy-filter tabs by title or URL
  4. Tab list updates when Raycast command is re-invoked (reflects current Firefox state)
**Plans**: TBD

Plans:
- [ ] 03-01: Raycast extension scaffold (create-raycast-extension)
- [ ] 03-02: HTTP client fetching tabs from native messaging host
- [ ] 03-03: List UI with fuzzy search over title and URL

### Phase 4: Tab Switching
**Goal**: Users can select a tab in Raycast and Firefox instantly brings that tab to the front
**Depends on**: Phase 3
**Requirements**: ACTN-01
**Success Criteria** (what must be TRUE):
  1. User can press Enter on a tab in the Raycast list to switch to it
  2. Firefox comes to the foreground with the selected tab active
  3. If the tab is in a different Firefox window, that window comes to front and the tab activates
  4. Raycast closes after switching (standard Raycast behavior)
**Plans**: TBD

Plans:
- [ ] 04-01: Switch action wired to HTTP POST /switch
- [ ] 04-02: Firefox window focus via browser.windows.update
- [ ] 04-03: Multi-window tab switching validation

### Phase 5: Tab List Polish
**Goal**: The tab list looks polished with visual indicators that match the quality of Chrome/Safari Raycast extensions
**Depends on**: Phase 3
**Requirements**: TABS-03, TABS-04
**Success Criteria** (what must be TRUE):
  1. The currently active Firefox tab is visually distinguished in the Raycast list (icon or accessory)
  2. Each tab displays its favicon next to the title
  3. Tabs without favicons show a sensible fallback (default icon)
**Plans**: TBD

Plans:
- [ ] 05-01: Active tab indicator (accessory icon or tag)
- [ ] 05-02: Favicon display from WebExtension favIconUrl data
- [ ] 05-03: Fallback icons for tabs without favicons

### Phase 6: Tab Close Action
**Goal**: Users can close a Firefox tab directly from Raycast without switching to it
**Depends on**: Phase 4
**Requirements**: ACTN-02
**Success Criteria** (what must be TRUE):
  1. User can select "Close Tab" from the action menu on any tab in the Raycast list
  2. The tab closes in Firefox without Firefox coming to the foreground
  3. The Raycast list refreshes to reflect the closed tab
**Plans**: TBD

Plans:
- [ ] 06-01: Close tab endpoint in native messaging host (/close)
- [ ] 06-02: WebExtension browser.tabs.remove handler
- [ ] 06-03: Raycast action menu integration with list refresh

### Phase 7: Error Handling
**Goal**: Users see clear, actionable messages when something in the communication chain is broken
**Depends on**: Phase 3
**Requirements**: ERRH-01, ERRH-02, ERRH-03
**Success Criteria** (what must be TRUE):
  1. When Firefox is not running, Raycast shows "Firefox is not running" with an option to launch Firefox
  2. When the companion WebExtension is not installed, Raycast shows a message explaining how to install it
  3. When the native messaging host is not registered, Raycast shows a message explaining how to set it up
  4. Error states are detected automatically (user does not need to diagnose the issue themselves)
**Plans**: TBD

Plans:
- [ ] 07-01: Firefox process detection (pgrep or equivalent)
- [ ] 07-02: Host connectivity check and WebExtension status detection
- [ ] 07-03: EmptyView states with actionable messages for each failure mode

### Phase 8: Setup Automation
**Goal**: Users can run a single Raycast command to register the native messaging host with Firefox
**Depends on**: Phase 2
**Requirements**: COMM-04
**Success Criteria** (what must be TRUE):
  1. Raycast extension includes a "Setup Firefox Integration" command
  2. Running the command creates the native messaging host manifest in the correct Firefox location
  3. The manifest contains valid absolute paths and correct extension ID
  4. After running setup, the communication chain works without manual file editing
**Plans**: TBD

Plans:
- [ ] 08-01: Manifest template with absolute path resolution
- [ ] 08-02: Raycast setup command that writes manifest to ~/Library/Application Support/Mozilla/NativeMessagingHosts/
- [ ] 08-03: Post-setup validation (verify manifest is correct and host is reachable)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8
Note: Phase 5 depends on Phase 3 (not 4), so Phases 4 and 5 could execute in parallel. Phase 7 depends on Phase 3. Phase 8 depends on Phase 2.

| Phase | Plans Complete | Status | Completed |
|-------|---------------|--------|-----------|
| 1. Firefox WebExtension | 0/3 | Not started | - |
| 2. Native Messaging Bridge | 0/3 | Not started | - |
| 3. Raycast Tab List | 0/3 | Not started | - |
| 4. Tab Switching | 0/3 | Not started | - |
| 5. Tab List Polish | 0/3 | Not started | - |
| 6. Tab Close Action | 0/3 | Not started | - |
| 7. Error Handling | 0/3 | Not started | - |
| 8. Setup Automation | 0/3 | Not started | - |

---
*Roadmap created: 2026-02-06*
*Last updated: 2026-02-06*
