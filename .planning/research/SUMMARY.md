# Project Research Summary

**Project:** raycast-firefox v1.1 Store Publishing & Distribution
**Domain:** Multi-component browser extension distribution (Raycast Store + Firefox AMO + native messaging host)
**Researched:** 2026-02-24
**Confidence:** HIGH

## Executive Summary

This milestone transforms a developer-only tool into a publicly distributable product across three independent channels: the Raycast Store, Firefox AMO, and GitHub Releases. The core distribution problem is that v1.0 assumes all components live together in a git checkout — a `project-root.txt` asset hardcodes the path to `native-host/run.sh`. Store distribution breaks this assumption entirely: the Raycast extension is installed to an opaque managed directory, the Firefox extension comes from AMO, and the native host must be acquired independently. Replacing this coupling is the single most critical architectural change for v1.1 and must be resolved before any store submission work begins.

The recommended approach is pragmatic: keep the native host as a Node.js script (esbuild-bundled to a single `host.bundle.js`, ~50KB) distributed via GitHub Releases, with a shell wrapper that discovers Node.js through a priority chain (symlinked Raycast node first, then Homebrew, nvm, etc.). The Raycast setup command downloads the bundle, verifies its SHA256 hash, installs it to `~/.raycast-firefox/bin/`, and registers the native messaging manifest — eliminating all manual steps. This avoids the ~80MB binary size penalty of Node.js SEA and the macOS Gatekeeper signing complexity, while still achieving zero-friction install for end users. The key insight is that every Raycast user already has Node.js (Raycast ships its own at a known path), so the setup command can create a symlink to it and the shell wrapper always has a reliable Node.js to call.

The dominant risks are process-oriented rather than technical. AMO has a hard November 2025 requirement for `data_collection_permissions` in every new extension manifest that will block submission without it. Raycast's Store review commonly requires 3-4 rounds for first submissions, and a PR auto-closes at 21 days without response. There is also a policy ambiguity: Raycast may require binary downloads to come from a server the developer does not control — GitHub Releases is in a gray zone. The safest resolution is bundling the ~50KB JS file directly in the Raycast extension's `assets/` directory and extracting it at setup time, eliminating any download requirement. The roadmap should submit to AMO first to parallelize review times before opening the Raycast Store PR.

---

## Key Findings

### Recommended Stack

The v1.0 stack (TypeScript/React Raycast extension, Node.js native host, Firefox MV2 WebExtension, pino logging) is validated and unchanged. New additions are purely build and distribution tooling. See [STACK.md](.planning/research/STACK.md) for full detail including version compatibility matrix and build scripts.

**Core technologies (new for v1.1):**

- **esbuild 0.24.x**: JS bundler — produces single-file `host.bundle.js` with all dependencies inlined, no `node_modules` needed at runtime. Fast, zero-config for CJS bundling.
- **web-ext 9.x**: AMO submission CLI — `web-ext lint`, `web-ext build`, `web-ext sign --channel=listed`. Mozilla's official tool, actively maintained.
- **softprops/action-gh-release@v2**: GitHub Releases creation — triggered on `v*` tag push, uploads versioned assets, auto-generates release notes.
- **macos-14 runner (ARM64)**: GitHub Actions build target — Apple Silicon (M1), matches target architecture. Free for public repos.
- **Native `fetch()` (Node 22 built-in)**: Download from GitHub Releases at setup time — no additional fetch library needed.
- **Node.js SEA**: DEFERRED — produces ~80MB binary, triggers macOS Gatekeeper on Apple Silicon, unnecessary since Raycast ships its own Node.js 22.14+.

Pino logging requires one change when bundled: replace `pino-roll` transport (runs in worker threads that break inside a bundle) with `pino.destination({ sync: true })` plus a manual size-check rotation on startup. Sync pino is well-documented and sufficient for the low-volume logging of a tab bridge.

---

### Expected Features

The v1.0 feature set (tab search, switch, close, favicons, container colors, error classification) is complete and unchanged. v1.1 is entirely distribution infrastructure. See [FEATURES.md](.planning/research/FEATURES.md) for full checklists for both store submissions.

**Must have (table stakes):**

- **Raycast Store listing** — requires README, 512x512 icon (verify dimensions), 2000x1250 screenshots (3+ minimum), CHANGELOG.md, `platforms: ["macOS"]` in package.json, MIT license in extension root, ESLint clean
- **Firefox AMO listing** — requires `data_collection_permissions` in manifest (new Nov 2025), extension name without "Firefox" (rename to "Raycast Tab Bridge" or similar), existing 48x96px icons are fine, plain JS source is ideal (no source upload needed)
- **Automated native host install from Raycast** — setup command installs bundle, verifies SHA256, writes manifest; zero manual CLI steps for end users
- **README with setup instructions** — required by Raycast Store; also needed for AMO description
- **Cross-linking between stores** — AMO description links to Raycast Store; Raycast README links to AMO listing

**Should have (differentiators):**

- **One-click native host install** — setup command handles download + verify + install + manifest registration in a single Raycast action
- **Chain verification after setup** — existing `verifyChain()` adapted to use new binary path
- **Guided error recovery with store links** — error states link directly to AMO page for Firefox extension, setup command for native host
- **CI-built release artifacts** — GitHub Actions produces reproducible bundle + SHA256 on `v*` tag, ensuring users always get a clean build

**Defer to post-v1.1:**

- Node.js SEA standalone binary — only if user feedback shows Node.js availability is a real problem post-launch
- Automated AMO submission in CI — do first submission manually via web UI; `web-ext sign --channel=listed` in CI submits for review but does not return a signed artifact, so it is non-obvious to automate
- Version compatibility warnings between components — non-blocking for initial public release
- Homebrew formula — adds a separate distribution channel with no clear benefit given Raycast automates everything

---

### Architecture Approach

The architecture change is surgical. The communication layer (HTTP localhost:26394, native messaging stdio, port file at `~/.raycast-firefox/port`) is entirely unchanged. The only changes are: (1) how components are installed and (2) where the native messaging manifest points. The `project-root.txt` coupling is replaced by a well-known install path (`~/.raycast-firefox/bin/`), and the Raycast setup command gains a download-verify-install flow before writing the manifest.

See [ARCHITECTURE.md](.planning/research/ARCHITECTURE.md) for component diagrams, v1.0-vs-v1.1 data flow comparisons, and TypeScript/bash implementation sketches.

**Major components:**

1. **Native Host Build Pipeline (NEW)** — esbuild bundles `host.js` + all source + pino into `host.bundle.js` (~50KB); CI packages with `raycast-firefox-host.sh` wrapper + `checksums.sha256` as GitHub Release assets
2. **GitHub Actions CI/CD (NEW)** — triggers on `v*` tag, builds on macos-14 ARM64, publishes versioned Release assets
3. **Raycast Install Flow (MODIFIED: setup-bridge.tsx)** — replaces `project-root.txt` lookup with check-download-verify-install-register pattern against `~/.raycast-firefox/bin/`; symlinks Raycast's Node.js for reliable discovery
4. **Firefox AMO Listing (MODIFIED: extension/)** — signed and listed on AMO; updated manifest with `data_collection_permissions`; AMO description guides users to Raycast setup
5. **Raycast Store Listing (MODIFIED: raycast-extension/)** — published via PR to `raycast/extensions`; all metadata/screenshots/README created; `project-root.txt` pattern removed

**Key pattern — Node.js discovery chain in wrapper script:** Firefox launches the native host without user PATH. The wrapper script checks: (1) symlink at `~/.raycast-firefox/node` pointing to Raycast's bundled Node.js (created during setup via `process.execPath`), (2) Homebrew ARM, (3) Homebrew Intel, (4) nvm. The symlink approach guarantees every Raycast user has a working Node.js available to the wrapper, even if they have no system Node.js on PATH.

**File layout after install:**

```
~/.raycast-firefox/
├── bin/
│   ├── host.bundle.js           # Downloaded from GitHub Releases (or bundled in assets)
│   ├── raycast-firefox-host.sh  # Wrapper script (finds node, runs bundle)
│   └── version.txt              # Installed version tag
├── node -> /path/to/raycast/node  # Symlink to Raycast's Node.js
├── host.pid                     # Existing: PID of running host
├── port                         # Existing: HTTP server port
└── logs/                        # Existing: pino log files
```

---

### Critical Pitfalls

See [PITFALLS.md](.planning/research/PITFALLS.md) for 17 pitfalls with full prevention strategies. Top 5:

1. **AMO rejects extension: missing `data_collection_permissions`** (Pitfall 1, HIGH) — New Nov 2025 AMO requirement for all new extensions. Add `"data_collection_permissions": { "required": ["none"] }` to `browser_specific_settings.gecko` before first AMO submission. Our extension communicates only on localhost — defensible as "none," but have a fallback prepared to declare `browsingActivity` with a local-only explanation.

2. **macOS Gatekeeper blocks unsigned native host binary** (Pitfall 6, HIGH) — Apple Silicon requires signed Mach-O binaries. Node.js SEA produces a Mach-O that Gatekeeper will block without a paid Apple Developer certificate ($99/year) or `xattr -cr` workaround. Prevention: don't ship a compiled binary. Keep the host as a `.js` script + shell wrapper. Shell scripts and JS files are not subject to Gatekeeper code signing.

3. **`project-root.txt` path breaks for Store-installed extensions** (Pitfall 9, HIGH) — The v1.0 `prebuild` script writes the developer's repo path into an asset at build time. Store users have no git checkout. This must be replaced before any Store submission — it is the foundational change for v1.1 and the root cause of all distribution problems.

4. **Raycast Store binary download policy** (Pitfall 3, HIGH) — Raycast may reject extensions that download binaries from developer-controlled servers (GitHub Releases is in a gray zone). Safest option (Option A): bundle the ~50KB JS file directly in `raycast-extension/assets/native-host/` and extract it at setup time, avoiding any runtime download. Option B: GitHub Releases download with SHA256 hardcoded in extension source is the pattern used by Bitwarden and Speedtest extensions.

5. **Raycast Store PR fails multiple review rounds** (Pitfall 4, HIGH) — First submissions commonly take 3-4 rounds (weeks of back-and-forth). Prevention: fix all ESLint `@raycast/prefer-title-case` warnings before submitting, create all metadata assets (screenshots, README, CHANGELOG) before opening the PR, respond to reviewer feedback within 48 hours (PR auto-closes at 21 days of inactivity).

---

## Implications for Roadmap

Based on combined research, the work decomposes into 5 phases with a strict dependency order: infrastructure first, then install flow, then parallel AMO submission, then Raycast Store PR, then post-launch polish. AMO review takes weeks and can happen in parallel with Raycast-side work — submit it as early as possible.

### Phase 1: Foundation — Native Host Bundling + CI/CD

**Rationale:** Everything downstream depends on having a reproducible, distributable native host artifact. This phase has no external dependencies and can be validated entirely locally. Resolving the `project-root.txt` coupling also belongs here since it is the root cause of all distribution problems and determines the shape of every subsequent phase.

**Delivers:** `host.bundle.js` (single-file, zero runtime dependencies), `raycast-firefox-host.sh` wrapper, `checksums.sha256`, GitHub Actions workflow that publishes these to Releases on `v*` tag push, and `resolveNativeHostPath()` in setup-bridge rewritten to check `~/.raycast-firefox/bin/` (or `assets/native-host/`) first.

**Addresses:** Native host bundling (table stakes), CI-built release artifacts (differentiator)

**Avoids:** Pitfall 9 (`project-root.txt` breakage), Pitfall 17 (architecture mismatch), Pitfall 6 (Gatekeeper — by staying as JS + wrapper)

**Research flag:** Standard patterns. esbuild bundling and GitHub Actions release workflows are well-documented. No additional research needed.

---

### Phase 2: Raycast Install Flow

**Rationale:** After Phase 1 produces release artifacts (or a bundled asset), the setup command can be rewritten to install the bundle and register the manifest. This is the most complex single change in v1.1 and the one Raycast reviewers will actually test. Must work end-to-end before any store submission.

**Delivers:** Automated install flow in `setup-bridge.tsx` — either extracting from `assets/native-host/` (Option A) or downloading from GitHub Releases with SHA256 verification (Option B); Node.js symlink creation (`~/.raycast-firefox/node -> process.execPath`); manifest registration updated to new binary path; version tracking via `version.txt`; updated error states with direct AMO links for the Firefox extension.

**Uses:** Native `fetch()`, `crypto.createHash`, `fs` (Node built-ins), `@raycast/api` for progress toasts and open URL actions.

**Implements:** Architecture Components 3 (Raycast Install Flow), Pattern 1 (Download-Verify-Install), Pattern 2 (Node.js Discovery Chain)

**Avoids:** Pitfall 3 (binary download policy), Pitfall 8 (NativeMessagingHosts `mkdir -p`), Pitfall 11 (Node.js discovery), Pitfall 15 (too many user steps)

**Research flag:** Needs shallow verification. Before implementation, confirm which distribution pattern Raycast currently accepts: bundle in `assets/` vs. download from GitHub Releases. Review the Speedtest and Bitwarden extension sources. This decision gates the whole phase.

---

### Phase 3: Firefox AMO Submission

**Rationale:** AMO submission is independent of Raycast Store work and has its own review timeline (days to weeks). It must be submitted before or in parallel with Phase 2 so the AMO listing URL exists when writing the Raycast README and error message links. The review window is pure waiting time — start it as early as possible.

**Delivers:** Updated `manifest.json` with `data_collection_permissions`; renamed extension for AMO compliance (no "Firefox" in display name); `web-ext` added as dev dependency; AMO listing with description cross-linking to Raycast Store; signed extension live on AMO.

**Addresses:** Firefox AMO listing (table stakes), cross-linking (table stakes)

**Avoids:** Pitfall 1 (`data_collection_permissions`), Pitfall 2 (source code submission — keep plain JS), Pitfall 7 (submit early to parallelize review), Pitfall 10 (listed vs. unlisted CI behavior), Pitfall 12 (extension name policy), Pitfall 14 (version numbers strictly increasing)

**Research flag:** Standard patterns. The only non-obvious item is the `data_collection_permissions` declaration edge case — fully documented in research. No additional research needed.

---

### Phase 4: Raycast Store Preparation + Submission

**Rationale:** Final step. Depends on Phase 2 (download/install flow must work without git checkout) and Phase 3 (AMO listing URL must exist for README and error message links). All metadata must be complete before opening the PR — incomplete submissions waste review cycles and risk PR staleness.

**Delivers:** README.md with setup instructions and AMO link; CHANGELOG.md; 3-6 screenshots at 2000x1250; 512x512 icon verification; `platforms: ["macOS"]` in package.json; ESLint clean (fix `@raycast/prefer-title-case` violations); PR to `raycast/extensions` monorepo.

**Addresses:** Raycast Store listing (table stakes), README (table stakes), screenshots + CHANGELOG (table stakes), MIT license verification (table stakes)

**Avoids:** Pitfall 4 (review round minimization — complete all metadata before PR), Pitfall 13 (PR staleness — respond to reviews within 48 hours)

**Research flag:** Standard patterns. Raycast's submission requirements are exhaustive in official docs. Use the checklist in PITFALLS.md Pitfall 4 as a pre-submission gate.

---

### Phase 5: Post-Launch Polish

**Rationale:** After both stores are live and user feedback is available, address items that are differentiators but not blocking for initial launch. Also hardens the system against version mismatch issues that will emerge as components update independently.

**Delivers:** Protocol version handshake between components (prevents silent failures when native host and Firefox extension versions diverge); non-blocking version mismatch warning toast; AMO submission automation in CI for future releases; improved Node.js path detection for edge cases (fnm, asdf, volta).

**Addresses:** Version sync pitfall (Pitfall 5), Node.js discovery edge cases (Pitfall 11 — post-launch feedback driven)

**Research flag:** Standard patterns. Protocol versioning is a small additive change. No research needed.

---

### Phase Ordering Rationale

- **Infrastructure before distribution**: Phases 1-2 build what Raycast reviewers will actually test. Opening Store PRs before the install flow works wastes review cycles and risks rejection.
- **AMO before Raycast Store**: AMO review can take weeks; Raycast review takes days. Submitting AMO during Phase 2 (or immediately after) maximizes parallelism. The AMO listing URL is also needed in the Raycast README, which blocks opening the Raycast PR.
- **Architecture decisions resolved in Phase 1**: The `project-root.txt` removal and the "bundle in assets vs. download from Releases" decision affect everything downstream. Resolving both in Phase 1 avoids rework in Phases 2 and 4.
- **Metadata as its own phase**: Screenshots, README, and CHANGELOG are low-dependency but time-consuming creative work. Treating Phase 4 as a discrete preparation sprint keeps focus.
- **Post-launch polish deferred to Phase 5**: Version handshake and CI automation are real improvements but not blocking for initial Store listing. User feedback after launch will also reveal which additional node paths to add.

### Research Flags

Phases needing verification during planning:

- **Phase 2**: Confirm Raycast's current binary distribution policy (bundle in `assets/` vs. download from GitHub Releases). FEATURES.md and ARCHITECTURE.md reach different conclusions on the safest approach. Review the Speedtest extension (`github.com/raycast/extensions/tree/main/extensions/speedtest`) and current Raycast security docs before writing setup-bridge code.

Phases with standard patterns (skip research-phase):

- **Phase 1**: esbuild + GitHub Actions are mature, well-documented. Build process is scripted in STACK.md.
- **Phase 3**: AMO submission is well-documented; `data_collection_permissions` requirement is fully researched.
- **Phase 4**: Raycast Store requirements are exhaustive in official docs and summarized in PITFALLS.md.
- **Phase 5**: Protocol versioning is a minor additive change.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All technology choices verified against official docs. esbuild, web-ext, GitHub Actions, Node.js built-ins are stable and production-proven. One MEDIUM item: manual log rotation replacing pino-roll (pattern choice, not exotic API). |
| Features | HIGH | Raycast Store and AMO requirements sourced directly from official docs. Anti-features (SEA binary, Homebrew, self-hosted server) are well-justified with references. Open question: Node.js availability on non-developer user machines (mitigated by Raycast's bundled runtime). |
| Architecture | HIGH | Component boundaries, data flow, and anti-patterns sourced from official Raycast and Mozilla docs. Bitwarden and Speedtest extensions provide approved precedents. One MEDIUM gap: exact policy interpretation of GitHub Releases as a download source. |
| Pitfalls | HIGH | 17 pitfalls documented with HIGH/MEDIUM confidence ratings. All critical pitfalls (AMO `data_collection_permissions`, Gatekeeper, `project-root.txt`, Raycast review rounds) are HIGH confidence from official sources. |

**Overall confidence:** HIGH

### Gaps to Address

- **Raycast binary policy interpretation**: FEATURES.md recommends bundling the JS in Raycast `assets/` (Option A); ARCHITECTURE.md recommends downloading from GitHub Releases with hash verification (Option B). These are architecturally different approaches. Before Phase 2 implementation, review the Speedtest extension source and the current Raycast security docs section to determine which pattern will pass review. Option A (bundle in assets) is the lower-risk default.

- **AMO `data_collection_permissions` declaration value**: Research recommends declaring `"required": ["none"]` but acknowledges tab titles and URLs qualify as `browsingActivity` under AMO's taxonomy. If AMO reviewers push back on `none`, the fallback is declaring `browsingActivity` as required with a local-only explanation. Have this explanation drafted before submission.

- **Extension name for AMO**: "Raycast Firefox" likely violates AMO's "no Firefox in name" policy. A rename decision is needed before AMO submission. Options: "Raycast Tab Bridge", "Raycast Tabs Companion". The extension ID (`raycast-firefox@lau.engineering`) and Raycast Store name are unaffected.

- **Raycast bundled Node.js path**: The Node.js symlink strategy (`~/.raycast-firefox/node -> process.execPath`) is the most reliable approach. Validate that `process.execPath` in the Raycast extension context points to Raycast's bundled Node.js (not a system node). Test on a clean machine without system Node.js to confirm the wrapper script's fallback chain works correctly.

---

## Sources

### Primary (HIGH confidence)

- [Node.js SEA Documentation](https://nodejs.org/api/single-executable-applications.html) — SEA API, build process, macOS Gatekeeper implications
- [Raycast: Prepare an Extension for Store](https://developers.raycast.com/basics/prepare-an-extension-for-store) — binary download policy, icon, metadata requirements, security section
- [Raycast: Publish an Extension](https://developers.raycast.com/basics/publish-an-extension) — PR submission process, stale PR policy
- [Raycast: Environment API](https://developers.raycast.com/api-reference/environment) — `supportPath`, `assetsPath`
- [Firefox Extension Workshop: Submitting an Add-on](https://extensionworkshop.com/documentation/publish/submitting-an-add-on/) — AMO submission steps
- [Firefox Extension Workshop: Source Code Submission](https://extensionworkshop.com/documentation/publish/source-code-submission/) — when source upload is required
- [Firefox Extension Workshop: Data Collection Consent](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/) — `data_collection_permissions` requirement
- [Firefox Extension Workshop: Self-Distribution](https://extensionworkshop.com/documentation/publish/self-distribution/) — unlisted channel behavior
- [MDN: Native Messaging](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Native_messaging) — manifest format, host discovery
- [web-ext Command Reference](https://extensionworkshop.com/documentation/develop/web-ext-command-reference/) — `sign`, `build`, `lint` options
- [esbuild API Documentation](https://esbuild.github.io/api/) — bundling configuration for Node.js CJS
- [softprops/action-gh-release@v2](https://github.com/softprops/action-gh-release) — GitHub release action
- [GitHub Actions macos-14 ARM64 runners](https://github.blog/news-insights/product-news/introducing-the-new-apple-silicon-powered-m1-macos-larger-runner-for-github-actions/) — runner availability (GA since April 2025)

### Secondary (MEDIUM confidence)

- [Mozilla Add-ons Blog: Data Collection Consent Changes (Oct 2025)](https://blog.mozilla.org/addons/2025/10/23/data-collection-consent-changes-for-new-firefox-extensions/) — Nov 2025 requirement timeline
- [Mozilla Add-ons Blog: Updated Add-on Policies (June 2025)](https://blog.mozilla.org/addons/2025/06/23/updated-add-on-policies-simplified-clarified/) — privacy policy no longer required on AMO
- [Firefox MV2 Indefinite Support Confirmation](https://www.ghacks.net/2025/02/26/firefox-mozilla-confirms-support-for-classic-extensions-and-manifest-v3-add-ons/) — MV2 remains valid submission target
- [Raycast Speedtest Extension](https://github.com/raycast/extensions/tree/main/extensions/speedtest) — reference for CLI binary download pattern (approved by Raycast)
- [Raycast Bitwarden Extension](https://github.com/raycast/extensions/tree/main/extensions/bitwarden) — reference for binary download from GitHub Releases (approved by Raycast)
- [kewisch/action-web-ext docs](https://github.com/kewisch/action-web-ext) — listed channel returns "submitted" status, not signed artifact
- [First Raycast Extension Journey (4-round review)](https://www.yppnote.com/en/raycast-extension-development-experience/) — real submission experience, common rejection reasons
- [Pino bundling documentation](https://github.com/pinojs/pino/blob/HEAD/docs/bundling.md) — sync destination mode for bundled applications
- [vercel/pkg deprecation notice](https://github.com/vercel/pkg) — deprecated in favor of Node.js SEA (confirms SEA is the right direction long-term)

### Tertiary (LOW confidence)

- Bugzilla 1367100 — NativeMessagingHosts directory not created by default on fresh Firefox
- Browserpass native macOS installation issues — Node.js discovery fallback patterns, version mismatch as top support issue

---
*Research completed: 2026-02-24*
*Ready for roadmap: yes*
