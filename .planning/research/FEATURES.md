# Feature Landscape

**Domain:** Store publishing, native host distribution, and automated install for a multi-component browser integration (Raycast extension + Firefox WebExtension + Node.js native messaging host)
**Researched:** 2026-02-24
**Milestone:** v1.1 Store Publishing & Distribution

## Context

This research focuses exclusively on v1.1 features. The following are already built and working (v1.0):
- Fuzzy tab search by title and URL
- Tab switching with close-first pattern
- Tab closing with optimistic removal
- Favicons from Firefox data URIs, active tab indicator, container colors
- Three-branch error classification with recovery actions
- "Setup Firefox Bridge" command (manifest registration from local project path)

The v1.1 challenge: the current architecture assumes all three components live together on disk from a git clone. Store distribution breaks this assumption -- the Raycast extension gets installed by Raycast, the Firefox extension gets installed from AMO, and the native host needs to be distributed independently.

---

## Table Stakes

Features users expect. Missing = product feels incomplete or unusable for public distribution.

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|--------------|------------|--------------|-------|
| **Raycast Store listing** | Users discover extensions through the Store; unlisted = invisible | Medium | Icon, README, screenshots, CHANGELOG, MIT license, PR to raycast/extensions | PR-based workflow via `npm run publish`; reviewed by Raycast team (1-3 day turnaround per round) |
| **Firefox AMO listing** | Users discover Firefox add-ons through AMO; sideloading requires manual XPI install and disabling signature checks | Medium | Icon (48x48, 96x96 -- already present), description, categories, screenshots (1280x800) | Immediately available on AMO after submission; human review follows. MV2 still fully accepted -- Mozilla confirmed indefinite MV2 support (Feb 2025) |
| **Automated native host install from Raycast** | Users should not have to clone a repo and run shell scripts; companion binary must "just work" | High | Bundled native host on GitHub Releases, download + hash verification in Raycast extension | This is the core distribution problem. Current setup assumes native-host/ lives on disk next to the Raycast extension. Store distribution breaks this assumption entirely |
| **README with setup instructions** | Raycast Store requires README for extensions needing additional setup; AMO users need setup guidance too | Low | None (content only) | Raycast shows "About This Extension" button linking to README. AMO has a description field. Both need clear cross-linking |
| **512x512 custom icon (Raycast)** | Raycast rejects submissions using the default icon | Low | Design asset | Must look good in light and dark themes. Use icon.ray.so generator or custom design. Current `icon.png` exists but needs size verification |
| **Store screenshots** | Raycast requires minimum 1 screenshot in `metadata/` folder (2000x1250 PNG). AMO recommends screenshots (1280x800) | Low | Running extension for capture | Show tab search, tab switching, setup flow. Recommend 3+ for Raycast |
| **CHANGELOG.md** | Raycast Store uses this for version history display | Low | None | Format: `## [Description] - {PR_MERGE_DATE}` |
| **Cross-linking between stores** | Users who find the Firefox extension need to find Raycast, and vice versa | Low | Both listings published | AMO description links to Raycast Store page; Raycast README links to AMO listing |
| **MIT license** | Raycast Store mandates MIT license | Low | Already present | Verify license file is in the extension root |
| **`platforms` field in package.json** | Raycast requires this for platform-specific extensions | Low | None | Add `["macOS"]` -- Raycast is macOS-only |

## Differentiators

Features that set the product apart. Not expected, but valued by users.

| Feature | Value Proposition | Complexity | Dependencies | Notes |
|---------|-------------------|------------|--------------|-------|
| **One-click native host install** | Most native messaging extensions require multi-step manual setup (download binary, move to path, register manifest). A single Raycast command that downloads + installs + verifies is genuinely rare | High | Bundled host on GitHub Releases, download logic with hash verification, manifest registration | The existing `setup-bridge` command already does manifest registration. Needs extension to download the binary first |
| **Chain verification after setup** | After install, automatically verify the entire chain (binary exists, host reachable, Firefox extension connected) and report specific failures | Low | Already implemented in v1.0 `verifyChain()` | Just needs minor adaptation to work with downloaded bundle path instead of project-relative path |
| **Standalone native host bundle (no scattered files)** | Users get a self-contained bundle instead of needing to clone a git repo with node_modules | Medium | `@vercel/ncc` to bundle JS into single file | Bundles host.js + 7 source files + pino + pino-roll into one file. Shell wrapper (`run.sh`) still discovers Node.js |
| **CI-built release artifacts** | GitHub Actions automatically builds and publishes the native host bundle on git tag/release, ensuring reproducible builds | Medium | GitHub Actions workflow, test + bundle + release jobs | Build on push of `v*` tag. Upload bundle + SHA256 hash as release assets |
| **Guided error recovery linking to missing piece** | When the Raycast extension detects a missing component, it directs the user exactly where to get it (AMO link for Firefox extension, setup command for native host) | Low | Both store listings published | Build on existing three-branch error classification. Add specific URLs in error messages |
| **AMO submission automation via web-ext** | Use `web-ext sign --channel=listed` in CI to automate Firefox extension updates | Medium | AMO API credentials as GitHub Secrets | First submission must be manual (metadata entry on AMO web UI). Subsequent versions can use `web-ext sign` |

## Anti-Features

Features to explicitly NOT build.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Auto-update native host binary** | Silent background updates to executables are a security concern and add significant complexity (update server, rollback, corruption recovery). Raycast reviewers scrutinize binary downloads closely | Prompt user to re-run setup command when version mismatch detected. Link to GitHub Releases for transparency |
| **Bundling native host inside Raycast extension** | Raycast guidelines explicitly prohibit bundling heavy or opaque binaries. Binary must be downloaded from a trusted source with hash verification | Download from GitHub Releases on first use or via setup command |
| **Self-hosted binary download server** | Raycast Store will reject extensions that download binaries from custom/personal servers. Must use established hosting | Use GitHub Releases (Raycast-approved pattern, same as Bitwarden CLI extension) |
| **Universal XPI installer** | Building an AMO-bypassing installer for the Firefox extension adds complexity and security risk. Users sideloading XPIs must disable signature checking | List on AMO (free) and link to the AMO listing. Let Mozilla handle signing and distribution |
| **Windows/Linux support** | Raycast is macOS-only. Adding cross-platform support for the native host adds complexity with zero benefit | Explicitly document macOS-only. Set `platforms: ["macOS"]` in Raycast package.json |
| **Homebrew formula** | Distribution channel fragmentation. Users would need to discover and use Homebrew separately from the Raycast Store flow | Keep distribution self-contained: Raycast Store install triggers native host download from GitHub Releases |
| **Notarization/code signing of native host** | Apple notarization requires a paid developer account ($99/yr) and adds CI complexity. The native host runs as a shell script + Node.js -- no Gatekeeper interception for non-app bundles | If Gatekeeper blocks, document `xattr -d com.apple.quarantine` workaround. But this is unlikely since we ship JS + shell script, not a compiled binary |
| **Node.js SEA standalone binary (for now)** | Produces a ~60MB binary (embeds full Node.js runtime). Download size hurts UX. macOS Gatekeeper may quarantine unsigned binaries. SEA is stable but macOS edge cases are less documented | Use `@vercel/ncc` bundle (~200KB) + shell wrapper that discovers Node.js. Most Raycast users (developers) have Node.js. Revisit if user feedback shows Node.js availability is a real problem |
| **Version compatibility enforcement** | Blocking the extension when versions are slightly mismatched is overly aggressive for a v1.1 release | Log version mismatches. Show a non-blocking warning toast if native host version is very old. Don't block functionality |

## Feature Dependencies

```
AMO Listing (independent) ──────────────────────────────────┐
                                                            │
Native Host Bundle ──> GitHub Actions CI ──> Download       │
  (@vercel/ncc)          (build + release)   Logic in       │
                                             Raycast ──> Cross-linking ──> Raycast Store Listing
                                             Extension      │                (PR submission)
                                               ^            │
                                               |            │
Existing setup-bridge ─── Refactor to ─────────┘            │
command (v1.0)             support downloaded                │
                           bundle path                      │
                                                            │
README + Icon + Screenshots ────────────────────────────────┘
```

Key dependency chains:

1. **Native host must be bundleable** before CI can build it
2. **CI must produce release artifacts** before Raycast extension can download them
3. **Download logic must work** before Raycast Store submission (reviewers will test it)
4. **Both store listings must exist** before cross-linking works fully
5. **AMO listing can be submitted independently** -- no dependency on Raycast side
6. **README, icon, and screenshots** are needed for both store submissions
7. **Refactoring setup-bridge** to use downloaded path instead of project-root.txt is the key code change

## Detailed Feature Analysis

### Native Host Bundling Strategy

The native host is a Node.js application (`host.js` + 7 source files in `src/`) with two runtime dependencies: `pino` (logging) and `pino-roll` (log rotation). Current execution requires Node.js on the user's machine, found via `run.sh` PATH probing across common install locations (Homebrew Intel/ARM, nvm, system PATH).

**Recommended approach: `@vercel/ncc` bundle + shell wrapper**

| Aspect | Details |
|--------|---------|
| Tool | `@vercel/ncc` -- compiles Node.js project into a single file |
| Output | Single `index.js` (~200KB) bundling all source + dependencies |
| Runner | Modified `run.sh` that finds Node.js and runs `index.js` |
| Node.js required | Yes -- but `run.sh` already handles discovery reliably |
| CI build | `ncc build host.js -o dist` |
| Release artifact | Tarball containing `dist/index.js` + `run.sh` |
| Download size | ~200KB compressed |
| Install location | `~/.raycast-firefox/native-host/` |

Why not SEA: A Node.js Single Executable Application would produce a ~60MB binary that eliminates the Node.js dependency. However, the download size is 300x larger, Gatekeeper may quarantine unsigned binaries on macOS, and most Raycast users are developers who have Node.js. The `@vercel/ncc` approach is the pragmatic choice. If Node.js availability becomes a real user complaint post-launch, SEA can be adopted later without changing the install flow.

### Raycast Store Submission Checklist

| Requirement | Current State | Action Needed |
|-------------|---------------|---------------|
| MIT license | Present in repo root | Copy to/verify in `raycast-extension/` root |
| Custom 512x512 icon | `icon.png` exists (unverified dimensions) | Verify 512x512 PNG, ensure light/dark compatibility |
| README.md | Not present in `raycast-extension/` root | Write: what it does, setup steps, AMO link, requirements |
| CHANGELOG.md | Not present | Write with initial version entry |
| `metadata/` screenshots | Directory not present | Capture 3+ screenshots at 2000x1250 PNG |
| `package-lock.json` | Present | Already good |
| `npm run build` passes | Yes | Already good |
| `npm run lint` passes | Needs verification | Run and fix issues |
| No Keychain access | Correct | Already good |
| Binary from trusted source with hash | N/A currently | GitHub Releases download with SHA256 verification |
| `platforms` field | Not set | Add `["macOS"]` to package.json |
| Categories | `["Applications", "Productivity"]` | Already set, already good |
| US English only | Yes | Already good |
| Author matches Raycast username | `"stelau"` | Verify matches Raycast account |
| Title case naming | "Firefox Tabs" / "Search Firefox Tabs" | Already good |
| Preferences API for config | No preferences currently | Consider: custom native host path preference for advanced users |

### Firefox AMO Submission Checklist

| Requirement | Current State | Action Needed |
|-------------|---------------|---------------|
| Packaged as .zip/.xpi | Not packaged | Add `web-ext build` command or manual zip |
| Icons (48x48, 96x96) | Present in `extension/icons/` | Already good |
| `browser_specific_settings` with gecko ID | Present: `raycast-firefox@lau.engineering` | Already good |
| Name | "Raycast Firefox" | Already good |
| Summary (250 chars max) | Needs writing | Draft: "Companion extension for Raycast Firefox Tabs. Enables tab search and switching from Raycast." |
| Description | Needs writing | Include: what it does, link to Raycast Store, setup instructions |
| Screenshots (1280x800) | Not created | Capture showing the extension is a companion (no visible UI -- it's a background extension) |
| Categories (up to 2) | Not selected | "Tabs" primary |
| License | Not specified for AMO | Select MIT (matching Raycast side) |
| Source code submission | Unminified JS, no build step | Already good -- source is directly readable |
| Privacy policy | Not needed | All communication is localhost-only, no external data transmission |
| `web-ext` tooling | Not installed | Add as devDependency: `npm install -D web-ext` |
| AMO API credentials | Not created | Generate at addons.mozilla.org/developers/addon/api/key/ |

### Automated Install Flow (User Experience)

**Target first-time user journey:**

1. User finds "Firefox Tabs" in Raycast Store, clicks Install
2. User opens "Search Firefox Tabs" command
3. Extension detects native host not installed (no bundle at `~/.raycast-firefox/native-host/`)
4. Error view: "Native host not installed" with "Set Up Firefox Bridge" action button
5. User clicks action -- setup command runs:
   a. Shows progress toast: "Downloading native host..."
   b. Downloads bundle tarball from GitHub Releases (latest)
   c. Verifies SHA256 hash
   d. Extracts to `~/.raycast-firefox/native-host/`
   e. Makes `run.sh` executable
   f. Writes native messaging manifest pointing to `~/.raycast-firefox/native-host/run.sh`
   g. Validates manifest
6. Setup reports: "Manifest installed. Install the companion Firefox extension" with link to AMO
7. User installs Firefox extension from AMO
8. Next time user runs "Search Firefox Tabs" -- it works

**Key UX decisions:**
- Install location: `~/.raycast-firefox/native-host/` (dot-directory, alongside existing `port` and `pid` files)
- Progress: Animated toast during download
- Failure recovery: Specific error messages -- "Download failed (check internet connection)", "Hash mismatch (try again)", "Firefox not installed"
- Idempotent: Re-running always downloads latest, overwrites existing bundle
- Offline resilience: If bundle already downloaded, skip download and just re-register manifest

### CI/CD Pipeline (GitHub Actions)

**Trigger:** Push of tag matching `v*`

**Jobs:**

1. **Build native host bundle**
   - Checkout repo
   - `cd native-host && npm ci`
   - `npx @vercel/ncc build host.js -o dist`
   - Verify `dist/index.js` exists
   - Package: tarball with `dist/index.js` + `run.sh`
   - Generate SHA256 hash file

2. **Create GitHub Release**
   - Create release from tag
   - Upload tarball + hash as release assets
   - Auto-generate release notes from commits

3. **(Future) AMO submission**
   - `web-ext build` the Firefox extension
   - `web-ext sign --channel=listed` with API credentials
   - First version: manual submission through AMO web UI

4. **(Future) Raycast Store PR**
   - Trigger `npm run publish` or manual PR to raycast/extensions
   - Requires human review regardless

### Path Resolution Refactoring

The current setup-bridge reads `assets/project-root.txt` (written at build time by `prebuild` script) to find `native-host/run.sh` relative to the git repo root. This works for local development but breaks for Store distribution.

**New path resolution strategy:**

1. **Primary:** Check `~/.raycast-firefox/native-host/run.sh` (downloaded bundle location)
2. **Fallback:** Check `assets/project-root.txt` path (development mode)
3. **Neither found:** Trigger download flow

This preserves backward compatibility for development (`ray develop`) while supporting Store distribution.

## MVP Recommendation

Prioritize for v1.1 release, in dependency order:

1. **Native host bundling with `@vercel/ncc`** -- foundation for everything else. Verify the bundle works correctly with pino, pino-roll, and all source modules.
2. **GitHub Actions CI** to build and publish bundle on release tag -- makes distribution reproducible and provides the download URL.
3. **Download + install flow in Raycast extension** -- refactor setup-bridge to download from GitHub Releases, verify hash, extract, register manifest. This is the core user-facing feature.
4. **Firefox AMO listing** -- can be done in parallel with items 1-3. Manual first submission through AMO web UI.
5. **Raycast Store listing** (README, icon verification, screenshots, CHANGELOG, PR submission) -- final step, depends on working install flow since reviewers will test it.
6. **Cross-linking between stores** -- polish step after both listings exist.

**Defer to post-v1.1:**
- Node.js SEA standalone binary: Only if user feedback shows Node.js availability is a real problem
- Automated AMO submission in CI: Do first submission manually, automate in future releases
- Version compatibility warnings: Nice-to-have, not blocking for initial public release

## Sources

- [Raycast Store Publishing Requirements](https://developers.raycast.com/basics/prepare-an-extension-for-store) -- HIGH confidence
- [Raycast Publishing Process](https://developers.raycast.com/basics/publish-an-extension) -- HIGH confidence
- [Raycast File Structure](https://developers.raycast.com/information/file-structure) -- HIGH confidence
- [Raycast Binary Dependency Guidelines](https://developers.raycast.com/basics/prepare-an-extension-for-store) -- HIGH confidence (section on binary downloads)
- [Firefox AMO Submission Guide](https://extensionworkshop.com/documentation/publish/submitting-an-add-on/) -- HIGH confidence
- [Firefox AMO Listing Best Practices](https://extensionworkshop.com/documentation/develop/create-an-appealing-listing/) -- HIGH confidence
- [Firefox Add-on Policies (updated June 2025)](https://blog.mozilla.org/addons/2025/06/23/updated-add-on-policies-simplified-clarified/) -- HIGH confidence
- [Firefox MV2 Indefinite Support Confirmation](https://www.ghacks.net/2025/02/26/firefox-mozilla-confirms-support-for-classic-extensions-and-manifest-v3-add-ons/) -- HIGH confidence
- [Mozilla web-ext Tool](https://github.com/mozilla/web-ext) -- HIGH confidence
- [web-ext Command Reference](https://extensionworkshop.com/documentation/develop/web-ext-command-reference/) -- HIGH confidence
- [Node.js SEA Documentation](https://nodejs.org/api/single-executable-applications.html) -- MEDIUM confidence (macOS-specific behavior less documented)
- [@vercel/ncc](https://github.com/vercel/ncc) -- HIGH confidence (well-established bundler)
- [Raycast Bitwarden Extension](https://github.com/raycast/extensions/tree/main/extensions/bitwarden) -- HIGH confidence (approved Store pattern for CLI binary dependency download)
- [GitHub Actions: Building and Testing Node.js](https://docs.github.com/en/actions/automating-builds-and-tests/building-and-testing-nodejs) -- HIGH confidence
