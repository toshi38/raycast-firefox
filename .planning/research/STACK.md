# Stack Research: v1.1 Store Publishing & Distribution

**Domain:** Native host bundling, CI/CD releases, store submissions, automated install flow
**Researched:** 2026-02-24
**Confidence:** HIGH (overall)

This document covers ONLY the stack additions needed for v1.1. The existing v1.0 stack (Raycast extension, Firefox WebExtension MV2, Node.js native host, pino logging) is validated and unchanged.

---

## 1. Native Host Bundling

The native host currently runs as a Node.js script (`host.js`) requiring `node` on the user's PATH plus `node_modules/` (pino, pino-roll). For store distribution, end users should not need to clone a repo or run `npm install`. Two viable approaches exist.

### RECOMMENDED: Node.js Single Executable Application (SEA)

Bundle the native host into a standalone macOS binary that includes the Node.js runtime. No `node` installation required by the end user.

| Component | Version | Purpose | Why |
|-----------|---------|---------|-----|
| **Node.js SEA** | Node 22 LTS (22.x Maintenance) | Single executable bundling | Built into Node.js core. No third-party packager needed. Produces a native macOS binary with the Node runtime embedded. |
| **esbuild** | 0.24.x | Bundle all JS into one CJS file | SEA requires a single entry script. esbuild bundles host.js + all dependencies (pino, pino-roll, all src/*.js) into one CommonJS file. Fast, zero-config for this use case. |
| **postject** | 1.0.x | Inject blob into Node binary | Required by SEA on Node 22 LTS to inject the preparation blob into the copied node binary. (Node 25.5+ has `--build-sea` which eliminates this step, but we target 22 LTS for stability.) |

**Build process (Node 22 LTS):**

```bash
# 1. Bundle all JS into single CJS file
npx esbuild host.js --bundle --platform=node --format=cjs \
  --outfile=dist/host-bundle.js

# 2. Generate SEA preparation blob
node --experimental-sea-config sea-config.json

# 3. Copy node binary
cp $(command -v node) dist/raycast-firefox-host

# 4. Remove existing signature (macOS required)
codesign --remove-signature dist/raycast-firefox-host

# 5. Inject blob
npx postject dist/raycast-firefox-host NODE_SEA_BLOB dist/sea-prep.blob \
  --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 \
  --macho-segment-name NODE_SEA

# 6. Re-sign (ad-hoc, macOS required)
codesign --sign - dist/raycast-firefox-host
```

**sea-config.json:**

```json
{
  "main": "dist/host-bundle.js",
  "output": "dist/sea-prep.blob",
  "disableExperimentalSEAWarning": true,
  "useCodeCache": false,
  "useSnapshot": false
}
```

**Why `useCodeCache: false` and `useSnapshot: false`:** Cross-architecture safety. The CI builds for arm64, and code cache/snapshots compiled on one architecture cannot run on another. Setting both to false is the safe default.

**Binary size:** The Node 22 binary is approximately 80-90MB. This is large but acceptable for a macOS desktop tool (comparable to Electron helper binaries). The alternative (requiring users to have Node.js installed) is worse for UX.

**Confidence: HIGH** -- Node.js SEA is in Active Development stability (1.1) but the core workflow has been stable since Node 19.7 and is widely used. Verified via official Node.js docs.

### Critical: Pino Bundling with esbuild

Pino uses Worker Threads internally for async logging (thread-stream). When bundled into a single file, the worker thread paths break because they cannot resolve from inside the bundle.

**Solution: Use `pino.destination({ sync: true })` and eliminate worker thread dependency.**

The native host currently uses pino with `pino-roll` transport (which runs in a worker thread). For the bundled SEA version:

1. **Replace pino-roll transport with `pino.destination()`** -- write logs synchronously to a file using `pino.destination({ dest: logFilePath, sync: true })`. This avoids worker threads entirely.
2. **Implement manual log rotation** -- a simple size-check on startup (if log > 5MB, rename to `.old` and start fresh). This replaces pino-roll's rotation.
3. **Use `esbuild-plugin-pino` as fallback** -- if sync logging causes unacceptable performance, use `esbuild-plugin-pino@2.3.3` which generates separate bundle files for pino's workers. But sync logging is fine for this use case (the native host handles <100 log writes per session).

**Why not keep pino-roll:** It requires separate worker JS files alongside the binary, defeating the purpose of a single executable. Sync pino.destination() to a file is simpler and sufficient.

**Confidence: HIGH** -- pino's sync destination mode is well-documented and is the recommended approach for bundled/SEA applications. Verified via pino bundling docs.

### Alternative Considered: Distribute JS + Bundled node_modules (No SEA)

| Approach | Pros | Cons |
|----------|------|------|
| tar.gz of host.js + node_modules + run.sh | Simpler build, no SEA complexity | Requires Node.js on user's machine. run.sh must probe for node (already does this). Larger download (node_modules). |
| SEA binary | Single file, no Node.js dependency, clean | ~85MB binary, experimental-ish API, pino bundling work |

**Verdict:** Use SEA. The entire point of v1.1 is making installation trivial. Requiring Node.js defeats that goal. The 85MB binary is acceptable (users download it once).

---

## 2. GitHub Actions CI/CD

### Core Workflow: Build + Release on Tag

| Component | Version/Config | Purpose | Why |
|-----------|----------------|---------|-----|
| **GitHub Actions** | N/A | CI/CD platform | Already using GitHub for hosting. Free for public repos. Native macOS ARM64 runners available. |
| **macos-14 runner** | ARM64 (M1) | Build the SEA binary | macOS 14 runners are ARM64 Apple Silicon (M1). This is the target architecture for Raycast users (macOS-only). Free for public repos. |
| **actions/checkout@v4** | v4 | Checkout code | Standard. |
| **actions/setup-node@v4** | v4 | Install Node.js 22 LTS | Provides consistent Node.js version in CI. |
| **softprops/action-gh-release@v2** | v2 | Create GitHub Release + upload binary | The standard community action for GitHub Releases. Creates release from tag, uploads assets. Handles idempotent updates (re-running won't duplicate). |

**Workflow trigger:** `on: push: tags: ['v*']`

**Architecture strategy:** Build ONLY for arm64 (Apple Silicon). Rationale:
- Raycast is macOS-only
- All Macs sold since late 2020 are Apple Silicon
- Intel Macs can run arm64 binaries via Rosetta 2
- Building a universal binary (arm64 + x64 via `lipo`) is possible but adds complexity for a shrinking user base
- If Intel support is explicitly requested later, add a `macos-13` (Intel) runner to the matrix and combine with `lipo`

**Workflow outline:**

```yaml
name: Release Native Host
on:
  push:
    tags: ['v*']

jobs:
  build:
    runs-on: macos-14  # ARM64 Apple Silicon
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - name: Install dependencies
        run: cd native-host && npm ci
      - name: Bundle with esbuild
        run: npx esbuild native-host/host.js --bundle --platform=node --format=cjs --outfile=dist/host-bundle.js
      - name: Build SEA
        run: |
          node --experimental-sea-config sea-config.json
          cp $(command -v node) dist/raycast-firefox-host
          codesign --remove-signature dist/raycast-firefox-host
          npx postject dist/raycast-firefox-host NODE_SEA_BLOB dist/sea-prep.blob \
            --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 \
            --macho-segment-name NODE_SEA
          codesign --sign - dist/raycast-firefox-host
      - name: Create Release
        uses: softprops/action-gh-release@v2
        with:
          files: dist/raycast-firefox-host
          generate_release_notes: true
```

**Confidence: HIGH** -- All components are well-established. GitHub Actions macos-14 ARM64 runners are GA since April 2025. softprops/action-gh-release@v2 is the most widely used release action.

### Firefox Extension Build + AMO Submission (Separate Job)

```yaml
  amo-submit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - name: Build and sign
        run: npx web-ext sign --channel=listed --api-key=${{ secrets.AMO_JWT_ISSUER }} --api-secret=${{ secrets.AMO_JWT_SECRET }}
        working-directory: extension
```

---

## 3. Firefox AMO Submission

| Component | Version | Purpose | Why |
|-----------|---------|---------|-----|
| **web-ext** | 9.x | Build, lint, and sign the Firefox extension | Mozilla's official CLI. `web-ext sign` handles submission to AMO and signing in one command. Version 8+ supports both listed and unlisted channels without extra flags. |
| **AMO API credentials** | JWT issuer + secret | Authenticate with AMO for signing | Generated at https://addons.mozilla.org/developers/addon/api/key/. Stored as GitHub Actions secrets. |

**Submission requirements:**
- Extension must have a valid `manifest.json` with `browser_specific_settings.gecko.id` (already have: `raycast-firefox@lau.engineering`)
- Source code must be reviewable (our code is not minified/transpiled, so no source upload needed)
- Icons: 48px and 96px PNG (already in `extension/icons/`)
- Description and screenshots for the AMO listing page

**Commands:**

```bash
# Lint before submission
npx web-ext lint --source-dir=extension

# Build .zip for manual upload (alternative to CLI sign)
npx web-ext build --source-dir=extension --overwrite-dest

# Sign and submit to AMO (listed)
npx web-ext sign --source-dir=extension --channel=listed \
  --api-key=<JWT_ISSUER> --api-secret=<JWT_SECRET>
```

**Review timeline:** Automated signing takes up to 24 hours. Manual review (if selected) can take longer. First submission is more likely to get manual review.

**Confidence: HIGH** -- web-ext 9.x is actively maintained by Mozilla. The extension is simple MV2 with standard permissions. No anticipated review issues.

---

## 4. Raycast Store Submission

No new dependencies needed. This is a process/metadata requirement, not a code change.

| Requirement | Current Status | Action Needed |
|-------------|----------------|---------------|
| **MIT license** | `"license": "MIT"` in package.json | Already set |
| **Author field** | `"author": "stelau"` | Already set |
| **Icon (512x512 PNG)** | Has `icon.png` | Verify dimensions are 512x512, works in light+dark themes |
| **Categories** | `["Applications", "Productivity"]` | Already set |
| **package-lock.json** | Exists | Already committed |
| **npm run build** passes | Yes | Verified |
| **npm run lint** passes | Yes | Verified |
| **Screenshots** | None | Need 3-6 screenshots at 2000x1250 PNG |
| **README.md** | Needed | Must explain setup: install Firefox extension from AMO, run Setup command |
| **CHANGELOG.md** | None | Recommended, create with initial version |

**Submission process:**
1. Run `npm run publish` from `raycast-extension/` directory
2. Authenticates with GitHub, creates PR to `raycast/extensions` monorepo
3. Raycast team reviews (first-contact within 1 week)
4. After merge, extension auto-publishes to Raycast Store

**Critical consideration:** The Raycast extension currently uses `project-root.txt` to locate the native host relative to the source repo. For the Store version, this must be replaced with downloading the native host binary from GitHub Releases. The `resolveNativeHostPath()` function in `setup.ts` must be rewritten.

**Confidence: HIGH** -- Requirements are straightforward and mostly already met.

---

## 5. Automated Install Flow (Raycast Downloads Native Host from GitHub Releases)

This is the most architecturally significant change. The Raycast extension must detect whether the native host binary is installed, and if not, download it from a GitHub Release.

### New Dependencies

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| **None (use Node.js built-ins)** | N/A | Download binary from GitHub | Node 22 has native `fetch()` (globally available, stable). Use it to download from `https://github.com/<owner>/<repo>/releases/download/<tag>/raycast-firefox-host`. No need for `node-fetch` or `axios`. |

**No new npm dependencies are needed.** The Raycast extension already has access to:
- `fetch()` -- global in Node 22, for downloading the binary
- `fs` -- for writing the binary to disk, checking existence, setting permissions
- `child_process` -- for `chmod +x` (or use `fs.chmodSync`)
- `@raycast/api` -- for `showToast`, `showHUD`, progress indicators

### Install Flow Architecture

**Binary location:** `~/.raycast-firefox/bin/raycast-firefox-host`

**Version tracking:** `~/.raycast-firefox/bin/version.txt` (contains the installed version tag)

**Flow:**

```
1. User opens "Search Firefox Tabs" or runs "Setup Firefox Bridge"
2. Check: does ~/.raycast-firefox/bin/raycast-firefox-host exist?
   YES -> Check version.txt, optionally check for updates (background)
   NO  -> Show toast: "Installing Firefox bridge..."
3. Fetch latest release from GitHub API:
   GET https://api.github.com/repos/<owner>/raycast-firefox/releases/latest
4. Download binary asset:
   GET https://github.com/<owner>/raycast-firefox/releases/download/<tag>/raycast-firefox-host
5. Write to ~/.raycast-firefox/bin/raycast-firefox-host
6. chmod +x
7. Write version.txt
8. Register native messaging manifest (reuse existing writeManifest())
9. Show toast: "Firefox bridge installed! Restart Firefox to activate."
```

**GitHub API considerations:**
- Public repos: no auth needed for release API, 60 requests/hour rate limit (more than enough)
- Download URL is a redirect -- `fetch()` follows redirects by default
- Check `Content-Length` header for progress indication (optional)

### Native Messaging Manifest Update

The manifest's `path` field must point to the downloaded binary instead of `run.sh`. The `generateManifest()` function already accepts a path parameter, so the only change is passing the new binary path.

New manifest will look like:

```json
{
  "name": "raycast_firefox",
  "description": "Raycast Firefox tab management bridge",
  "path": "/Users/<user>/.raycast-firefox/bin/raycast-firefox-host",
  "type": "stdio",
  "allowed_extensions": ["raycast-firefox@lau.engineering"]
}
```

**Key change:** No more `run.sh` wrapper. The SEA binary IS the executable -- it does not need Node.js on PATH.

**Confidence: HIGH** -- This is a straightforward download-and-place pattern. No exotic APIs needed.

---

## 6. Development Dependencies (New for v1.1)

| Package | Version | Where | Purpose |
|---------|---------|-------|---------|
| **esbuild** | 0.24.x | native-host (dev) | Bundle JS for SEA. Also useful if we want to optimize the Raycast extension build. |
| **postject** | 1.0.x | native-host (dev) / CI only | Inject SEA blob into node binary. Only needed during build. |
| **web-ext** | 9.x | extension (dev) | Lint, build, sign Firefox extension for AMO. |

### Installation

```bash
# Native host build tooling
cd native-host
npm install -D esbuild postject

# Firefox extension tooling
cd extension
npm install -D web-ext
```

**Note:** `postject` and `esbuild` are only needed in CI and during local development builds. They are not shipped to end users.

---

## 7. What NOT to Add

| Technology | Why Not | What to Do Instead |
|------------|---------|-------------------|
| **vercel/pkg** | Deprecated as of January 2024. Project recommends Node.js SEA instead. | Use Node.js SEA |
| **nexe** | Unmaintained since 2023. Does not support Node 22. | Use Node.js SEA |
| **node-fetch / axios** | Node 22 has global `fetch()` built in. Adding a fetch library is unnecessary weight. | Use native `fetch()` |
| **esbuild-plugin-pino** | Generates multiple extra files alongside the bundle, complicating SEA. | Switch pino to sync destination mode, eliminating worker thread dependency |
| **pino-roll (in bundled version)** | Runs in a worker thread which cannot resolve paths inside a SEA bundle. | Manual log rotation (size check on startup) with `pino.destination()` |
| **Homebrew formula** | Over-engineering for v1.1. The Raycast extension auto-downloads the binary. Homebrew adds a second distribution channel to maintain. | Auto-download from GitHub Releases |
| **Universal binary (arm64+x64)** | All modern Macs are ARM64. Intel Macs run ARM64 via Rosetta 2. Building universal adds CI complexity for diminishing returns. | ARM64-only binary. Add Intel if explicitly requested. |
| **Node.js 25.x / --build-sea flag** | Node 25 is Current (not LTS). The `--build-sea` flag simplifies the build but is only in 25.5+. Using non-LTS in CI is risky. | Use Node 22 LTS with the established postject workflow. Upgrade to `--build-sea` when Node 24 LTS gets the backport. |
| **Auto-update daemon** | Users do not expect or want a background process checking for updates. | Check for updates when the Raycast extension runs (once per day, non-blocking). Show a toast if update available. |

---

## 8. Version Compatibility Matrix

| Component | Requires | Notes |
|-----------|----------|-------|
| Node.js SEA | Node >= 20.0 (blob generation), Node >= 19.7 (feature exists) | Target Node 22 LTS for CI builds. The embedded runtime is the Node 22 binary itself. |
| esbuild 0.24.x | Node >= 18 | Build-time only |
| postject 1.0.x | Node >= 18 | Build-time only |
| web-ext 9.x | Node >= 18 LTS | Dev/CI dependency |
| @raycast/api 1.104.x | Node >= 22.14.0 | Already satisfied |
| softprops/action-gh-release@v2 | GitHub Actions runner | No version constraint beyond actions runner |
| macos-14 runner | N/A | ARM64 Apple Silicon (M1), GA since April 2025 |

---

## 9. Migration Path: v1.0 Development Mode to v1.1 Store Mode

The Raycast extension must support two modes:

| Mode | When | Native Host Location | Manifest Path Points To |
|------|------|---------------------|------------------------|
| **Development** | Developer clones repo, runs `npm run dev` | `<repo>/native-host/run.sh` (via project-root.txt) | `<repo>/native-host/run.sh` |
| **Store/Production** | User installs from Raycast Store | `~/.raycast-firefox/bin/raycast-firefox-host` (downloaded SEA binary) | `~/.raycast-firefox/bin/raycast-firefox-host` |

**Detection logic in setup.ts:**

```typescript
function resolveNativeHostPath(): string {
  // 1. Check for downloaded binary (Store mode)
  const binaryPath = join(homedir(), '.raycast-firefox', 'bin', 'raycast-firefox-host');
  if (existsSync(binaryPath)) {
    return binaryPath;
  }

  // 2. Fall back to development mode (project-root.txt)
  const rootFile = join(environment.assetsPath, 'project-root.txt');
  if (existsSync(rootFile)) {
    const projectRoot = readFileSync(rootFile, 'utf-8').trim();
    const candidate = join(projectRoot, 'native-host', 'run.sh');
    if (existsSync(candidate)) return resolve(candidate);
  }

  // 3. Not installed -- trigger download flow
  throw new Error('native-host-not-installed');
}
```

This preserves backward compatibility for development while enabling the Store install flow.

---

## 10. Summary of New Stack Additions

| Decision | Choice | Confidence |
|----------|--------|------------|
| Native host bundling | Node.js SEA (Node 22 LTS) + esbuild + postject | HIGH |
| Pino in bundled host | Switch from pino-roll transport to `pino.destination({ sync: true })` | HIGH |
| CI/CD platform | GitHub Actions, macos-14 ARM64 runner | HIGH |
| Release creation | softprops/action-gh-release@v2, triggered on `v*` tags | HIGH |
| Firefox AMO signing | web-ext 9.x CLI with `--channel=listed` | HIGH |
| Raycast Store submission | `npm run publish` to raycast/extensions monorepo | HIGH |
| Binary download in Raycast | Native `fetch()` from GitHub Releases API | HIGH |
| Binary install location | `~/.raycast-firefox/bin/raycast-firefox-host` | HIGH |
| Target architecture | ARM64 only (Rosetta 2 covers Intel) | HIGH |
| Log rotation in SEA | Manual size-check rotation replacing pino-roll | MEDIUM |

---

## Sources

- [Node.js SEA Documentation (v25.x, current)](https://nodejs.org/api/single-executable-applications.html) -- full SEA API and build process
- [Node.js SEA Documentation (v20.x LTS)](https://nodejs.org/docs/latest-v20.x/api/single-executable-applications.html) -- LTS-specific build steps with postject
- [Node.js 25.5.0 --build-sea announcement](https://nodejs.org/en/blog/release/v25.5.0) -- simplified build flag (future upgrade path)
- [Pino bundling documentation](https://github.com/pinojs/pino/blob/HEAD/docs/bundling.md) -- official guidance on worker thread bundling issues
- [esbuild-plugin-pino](https://github.com/wd-David/esbuild-plugin-pino) -- esbuild plugin for pino worker files (considered but not recommended)
- [esbuild API documentation](https://esbuild.github.io/api/) -- bundling configuration
- [softprops/action-gh-release@v2](https://github.com/softprops/action-gh-release) -- GitHub release action
- [GitHub Actions macos-14 ARM64 runners](https://github.blog/news-insights/product-news/introducing-the-new-apple-silicon-powered-m1-macos-larger-runner-for-github-actions/) -- runner availability
- [Raycast Store preparation guide](https://developers.raycast.com/basics/prepare-an-extension-for-store) -- submission requirements
- [Raycast Store publish guide](https://developers.raycast.com/basics/publish-an-extension) -- PR process
- [Firefox extension signing overview](https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/) -- AMO submission process
- [web-ext command reference](https://extensionworkshop.com/documentation/develop/web-ext-command-reference/) -- sign and build commands
- [web-ext on npm](https://www.npmjs.com/package/web-ext) -- current version 9.2.0
- [vercel/pkg deprecation](https://github.com/vercel/pkg) -- deprecated in favor of Node.js SEA
- [Node.js releases](https://nodejs.org/en/about/previous-releases) -- Node 22 Maintenance LTS, Node 24 Active LTS

---
*Stack research for: v1.1 Store Publishing & Distribution*
*Researched: 2026-02-24*
