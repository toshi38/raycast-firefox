# Roadmap: Raycast Firefox

## Milestones

- ✅ **v1.0 Raycast Firefox Tab Control** — Phases 1-8 (shipped 2026-02-24)
- 🚧 **v1.1 Store Publishing & Distribution** — Phases 9-13 (in progress)

## Phases

<details>
<summary>✅ v1.0 Raycast Firefox Tab Control (Phases 1-8) — SHIPPED 2026-02-24</summary>

- [x] Phase 1: Firefox WebExtension (2/2 plans) — completed 2026-02-07
- [x] Phase 2: Native Messaging Bridge (3/3 plans) — completed 2026-02-07
- [x] Phase 3: Raycast Tab List (2/2 plans) — completed 2026-02-07
- [x] Phase 4: Tab Switching (1/1 plan) — completed 2026-02-08
- [x] Phase 5: Tab List Polish (3/3 plans) — completed 2026-02-09
- [x] Phase 6: Tab Close Action (1/1 plan) — completed 2026-02-10
- [x] Phase 7: Error Handling (2/2 plans) — completed 2026-02-14
- [x] Phase 8: Setup Automation (2/2 plans) — completed 2026-02-23

See: `.planning/milestones/v1.0-ROADMAP.md` for full details.

</details>

### 🚧 v1.1 Store Publishing & Distribution (In Progress)

**Milestone Goal:** Ship to Raycast Store and Firefox AMO so anyone can install without manual setup.

**Phase Numbering:**
- Integer phases (9, 10, 11, ...): Planned milestone work
- Decimal phases (9.1, 9.2): Urgent insertions (marked with INSERTED)

- [ ] **Phase 9: Native Host Bundling** - Bundle native host into a single distributable JS file and eliminate git checkout dependency
- [ ] **Phase 10: CI/CD Pipeline** - Automate building and publishing the native host bundle via GitHub Actions
- [ ] **Phase 11: Raycast Install Flow** - Setup command installs native host from release artifacts without cloning the repo
- [ ] **Phase 12: Firefox AMO Submission** - Get Firefox extension listed and signed on addons.mozilla.org
- [ ] **Phase 13: Raycast Store Submission** - Get Raycast extension listed in the Raycast Store with all required metadata

## Phase Details

### Phase 9: Native Host Bundling
**Goal**: Native host runs as a single JS file with no node_modules and no dependency on a git checkout
**Depends on**: Nothing (first phase of v1.1)
**Requirements**: BUND-01, BUND-02, BUND-03, INST-09
**Success Criteria** (what must be TRUE):
  1. Running `node host.bundle.js` starts the native messaging host with identical behavior to the current multi-file setup
  2. The bundle uses synchronous pino logging (no worker threads) and logs correctly to `~/.raycast-firefox/logs/`
  3. The shell wrapper script discovers Node.js via priority chain (Raycast bundled, Homebrew ARM, Homebrew Intel, nvm, system PATH) and launches the bundle
  4. The Raycast extension works without `project-root.txt` — setup and tab search function when the extension is installed outside a git checkout
**Plans**: 2 plans

Plans:
- [ ] 09-01-PLAN.md — Sync logging migration and esbuild bundle
- [ ] 09-02-PLAN.md — Wrapper script rewrite and dual-mode path resolution

### Phase 10: CI/CD Pipeline
**Goal**: Every tagged release automatically produces verified, downloadable native host artifacts
**Depends on**: Phase 9
**Requirements**: CICD-01, CICD-02, CICD-03
**Success Criteria** (what must be TRUE):
  1. Pushing a `v*` tag to GitHub triggers a workflow that builds the native host bundle on a macOS ARM64 runner
  2. The GitHub Release contains the bundle JS, wrapper script, and SHA256 checksum file as downloadable assets
  3. The SHA256 checksum in the release matches the actual hash of the downloaded bundle file
**Plans**: TBD

Plans:
- [ ] 10-01: TBD

### Phase 11: Raycast Install Flow
**Goal**: Any Raycast user can install the native host through the setup command without touching a terminal
**Depends on**: Phase 10
**Requirements**: INST-01, INST-02, INST-03, INST-04, INST-05, INST-06, INST-07, INST-08
**Success Criteria** (what must be TRUE):
  1. User runs the Raycast setup command and the native host is downloaded, hash-verified, extracted to `~/.raycast-firefox/bin/`, and registered as a native messaging host — all without manual steps
  2. After setup completes, the verification chain confirms the full path works: Raycast -> native host -> Firefox extension
  3. A Node.js symlink is created at `~/.raycast-firefox/node` pointing to the Raycast runtime, so the wrapper script always has a working Node.js
  4. The installed bundle includes a `version.txt` tracking which release is installed
  5. Running setup a second time on an already-installed system succeeds cleanly (reinstall/update path works)
**Plans**: TBD

Plans:
- [ ] 11-01: TBD
- [ ] 11-02: TBD

### Phase 12: Firefox AMO Submission
**Goal**: Firefox extension is publicly listed on addons.mozilla.org and discoverable by users
**Depends on**: Phase 9 (bundle must exist so AMO description can reference install flow; no dependency on Phase 10/11)
**Requirements**: AMO-01, AMO-02, AMO-03, AMO-04, LINK-01
**Success Criteria** (what must be TRUE):
  1. The extension is listed and downloadable on addons.mozilla.org (signed by Mozilla)
  2. The extension manifest includes `data_collection_permissions` and passes AMO automated review
  3. The extension display name does not contain "Firefox" (complies with AMO naming policy)
  4. The AMO listing description includes a link to the Raycast Store page with setup instructions
**Plans**: TBD

Plans:
- [ ] 12-01: TBD

### Phase 13: Raycast Store Submission
**Goal**: Raycast extension is publicly listed in the Raycast Store and installable by any Raycast user
**Depends on**: Phase 11, Phase 12 (install flow must work end-to-end; AMO listing URL needed for README and error links)
**Requirements**: STORE-01, STORE-02, STORE-03, STORE-04, STORE-05, STORE-06, STORE-07, STORE-08, LINK-02, LINK-03
**Success Criteria** (what must be TRUE):
  1. The extension is listed in the Raycast Store and installable via Raycast's built-in store browser
  2. The README includes setup instructions that guide users to install the Firefox extension from AMO and run the setup command for the native host
  3. The extension has a 512x512 icon that renders correctly in both light and dark Raycast themes
  4. At least 3 screenshots at 2000x1250 are included showing tab search, switching, and setup flow
  5. Error states in the extension include direct links to the AMO listing for installing the Firefox extension
**Plans**: TBD

Plans:
- [ ] 13-01: TBD
- [ ] 13-02: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 9 -> 10 -> 11 -> 12 (can overlap with 10/11) -> 13

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|---------------|--------|-----------|
| 1. Firefox WebExtension | v1.0 | 2/2 | Complete | 2026-02-07 |
| 2. Native Messaging Bridge | v1.0 | 3/3 | Complete | 2026-02-07 |
| 3. Raycast Tab List | v1.0 | 2/2 | Complete | 2026-02-07 |
| 4. Tab Switching | v1.0 | 1/1 | Complete | 2026-02-08 |
| 5. Tab List Polish | v1.0 | 3/3 | Complete | 2026-02-09 |
| 6. Tab Close Action | v1.0 | 1/1 | Complete | 2026-02-10 |
| 7. Error Handling | v1.0 | 2/2 | Complete | 2026-02-14 |
| 8. Setup Automation | v1.0 | 2/2 | Complete | 2026-02-23 |
| 9. Native Host Bundling | v1.1 | 0/? | Not started | - |
| 10. CI/CD Pipeline | v1.1 | 0/? | Not started | - |
| 11. Raycast Install Flow | v1.1 | 0/? | Not started | - |
| 12. Firefox AMO Submission | v1.1 | 0/? | Not started | - |
| 13. Raycast Store Submission | v1.1 | 0/? | Not started | - |

---
*Roadmap created: 2026-02-06*
*Last updated: 2026-02-24 (v1.1 milestone roadmap created)*
