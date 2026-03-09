# Requirements: Raycast Firefox

**Defined:** 2026-02-24
**Core Value:** Quickly find and switch to any open Firefox tab without leaving the keyboard

## v1.1 Requirements

Requirements for store publishing and distribution. Each maps to roadmap phases.

### Bundling

- [x] **BUND-01**: Native host builds into a single JS file via esbuild with all dependencies inlined
- [x] **BUND-02**: Pino logging uses sync destination instead of pino-roll worker threads
- [x] **BUND-03**: Shell wrapper discovers Node.js via priority chain (Raycast bundled → Homebrew ARM → Homebrew Intel → nvm → system PATH)

### CI/CD

- [x] **CICD-01**: GitHub Actions workflow triggers on push to main (CD: changeset version + tag + release directly, no intermediate PR)
- [x] **CICD-02**: CI builds native host bundle on macOS ARM64 runner
- [x] **CICD-03**: CI publishes bundle + SHA256 checksum as GitHub Release assets

### Install Flow

- [ ] **INST-01**: User can install native host from Raycast setup command without cloning the repo
- [ ] **INST-02**: Setup command downloads native host bundle from GitHub Releases
- [ ] **INST-03**: Setup command verifies SHA256 hash of downloaded bundle
- [ ] **INST-04**: Setup command extracts bundle to `~/.raycast-firefox/bin/`
- [ ] **INST-05**: Setup command registers native messaging manifest pointing to installed bundle
- [ ] **INST-06**: Setup command creates Node.js symlink for reliable wrapper script execution
- [ ] **INST-07**: Setup command verifies full chain after installation
- [ ] **INST-08**: Installed bundle tracks version via `version.txt`
- [x] **INST-09**: `project-root.txt` dependency eliminated — extension works without git checkout

### Firefox AMO

- [ ] **AMO-01**: Firefox extension is listed on addons.mozilla.org
- [x] **AMO-02**: Extension manifest includes `data_collection_permissions`
- [x] **AMO-03**: Extension display name complies with AMO naming policy (no "Firefox" in name)
- [x] **AMO-04**: `web-ext` tooling added as dev dependency for building/linting

### Raycast Store

- [ ] **STORE-01**: Raycast extension is listed in the Raycast Store
- [ ] **STORE-02**: README.md with setup instructions and AMO link
- [ ] **STORE-03**: 512x512 custom icon verified for light/dark themes
- [ ] **STORE-04**: 3+ screenshots at 2000x1250 in `metadata/` folder
- [ ] **STORE-05**: CHANGELOG.md with version history
- [ ] **STORE-06**: `platforms: ["macOS"]` set in package.json
- [ ] **STORE-07**: ESLint clean (no `@raycast/prefer-title-case` violations)
- [ ] **STORE-08**: MIT license present in extension root

### Cross-linking

- [ ] **LINK-01**: AMO listing description links to Raycast Store page
- [ ] **LINK-02**: Raycast README links to AMO listing
- [ ] **LINK-03**: Error states include direct links to AMO for Firefox extension installation

## Future Requirements

Deferred to post-v1.1. Tracked but not in current roadmap.

### Distribution Enhancements

- **DIST-01**: Node.js SEA standalone binary (eliminate Node.js dependency)
- **DIST-02**: Automated AMO submission via `web-ext sign` in CI
- **DIST-03**: Non-blocking version mismatch warning toast between components
- **DIST-04**: Protocol version handshake between native host and Firefox extension

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Auto-update native host binary | Security concern, silent background executable updates; prompt user to re-run setup instead |
| Bundling native host inside Raycast extension assets | Raycast guidelines prohibit heavy/opaque binaries; download from GitHub Releases with hash verification |
| Self-hosted binary download server | Raycast Store rejects extensions downloading from developer-controlled servers; use GitHub Releases |
| Universal XPI installer | AMO handles signing and distribution; sideloading requires disabled signature checks |
| Windows/Linux support | Raycast is macOS-only |
| Homebrew formula | Distribution channel fragmentation; Raycast setup command handles everything |
| Apple notarization/code signing | $99/yr developer account; JS + shell script not subject to Gatekeeper |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| BUND-01 | Phase 9 | Complete |
| BUND-02 | Phase 9 | Complete |
| BUND-03 | Phase 9 | Complete |
| INST-09 | Phase 9 | Complete |
| CICD-01 | Phase 10 | Complete |
| CICD-02 | Phase 10 | Complete |
| CICD-03 | Phase 10 | Complete |
| INST-01 | Phase 11 | Pending |
| INST-02 | Phase 11 | Pending |
| INST-03 | Phase 11 | Pending |
| INST-04 | Phase 11 | Pending |
| INST-05 | Phase 11 | Pending |
| INST-06 | Phase 11 | Pending |
| INST-07 | Phase 11 | Pending |
| INST-08 | Phase 11 | Pending |
| AMO-01 | Phase 12 | Pending |
| AMO-02 | Phase 12 | Complete |
| AMO-03 | Phase 12 | Complete |
| AMO-04 | Phase 12 | Complete |
| LINK-01 | Phase 12 | Pending |
| STORE-01 | Phase 13 | Pending |
| STORE-02 | Phase 13 | Pending |
| STORE-03 | Phase 13 | Pending |
| STORE-04 | Phase 13 | Pending |
| STORE-05 | Phase 13 | Pending |
| STORE-06 | Phase 13 | Pending |
| STORE-07 | Phase 13 | Pending |
| STORE-08 | Phase 13 | Pending |
| LINK-02 | Phase 13 | Pending |
| LINK-03 | Phase 13 | Pending |

**Coverage:**
- v1.1 requirements: 30 total
- Mapped to phases: 30
- Unmapped: 0

---
*Requirements defined: 2026-02-24*
*Last updated: 2026-03-09 (milestone audit — phases 9+10 verified, CD pipeline confirmed)*
