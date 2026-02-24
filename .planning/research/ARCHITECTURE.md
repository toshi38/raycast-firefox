# Architecture Research: v1.1 Store Publishing & Distribution

**Domain:** Multi-component browser extension distribution (Raycast Store + Firefox AMO + native host binary)
**Researched:** 2026-02-24
**Confidence:** HIGH (verified against official docs for all three distribution targets)

## Existing Architecture (v1.0 -- What We Have)

```
  Raycast                  Native Host              Firefox
  ┌──────────────┐        ┌──────────────┐        ┌──────────────┐
  │ search-tabs  │        │  host.js     │        │ background.js│
  │ setup-bridge │  HTTP  │  (Node.js)   │ stdio  │ (MV2)        │
  │              │───────>│              │<──────>│              │
  │ TypeScript   │ :26394 │  bridge.js   │ native │  tabs API    │
  │ + React      │        │  server.js   │ msg    │  nativeMsgng │
  └──────────────┘        └──────────────┘        └──────────────┘
        │                       │                       │
        │                       │                       │
  Raycast copies ext       run.sh finds node       Installed from
  to sandboxed dir         host.js has deps         .xpi sideload
  project-root.txt ───>   (pino, pino-roll)
  resolves native-host    node_modules in-tree
```

**Current install flow (developer-only, manual):**
1. Clone repo
2. `cd native-host && npm install`
3. `cd raycast-extension && npm install && npm run dev`
4. Run "Setup Firefox Bridge" command (writes native messaging manifest)
5. Sideload `extension/` folder into Firefox via `about:debugging`

**Key coupling points that must change:**
- `project-root.txt` asset ties Raycast extension to repo checkout location
- `run.sh` depends on finding `node` in user's PATH/nvm/homebrew
- `host.js` requires `node_modules/` (pino, pino-roll) at sibling path
- Firefox extension is sideloaded, not signed

---

## Target Architecture (v1.1 -- What We Need)

```
  Raycast Store             GitHub Releases           Firefox AMO
  ┌──────────────┐        ┌──────────────┐        ┌──────────────┐
  │ raycast-ext  │        │ native-host  │        │ WebExtension │
  │  published   │        │  binary      │        │  .xpi signed │
  │  via PR to   │        │  (Node SEA   │        │  reviewed    │
  │  raycast/    │        │   or bundled │        │              │
  │  extensions) │        │   + node)    │        │              │
  └──────┬───────┘        └──────┬───────┘        └──────┬───────┘
         │                       │                       │
    User installs           Raycast ext              User installs
    from Store              downloads &              from AMO
         │                  registers                    │
         v                       v                       v
  ┌──────────────┐        ┌──────────────┐        ┌──────────────┐
  │ Raycast ext  │  HTTP  │ Native host  │ stdio  │ WebExtension │
  │ search-tabs  │───────>│ standalone   │<──────>│ background.js│
  │ setup-bridge │ :26394 │ binary       │ native │              │
  └──────────────┘        └──────────────┘  msg   └──────────────┘
```

### What Changes vs. What Stays

| Component | Changes | Stays Same |
|-----------|---------|------------|
| **Raycast extension** | Setup flow downloads binary from GitHub Releases; removes project-root.txt dependency; adds README for Store | All tab search/switch/close logic; HTTP communication; error classification; port file watching |
| **Native host** | Bundled into single file (esbuild) then wrapped as standalone binary; CI builds on tag push | All protocol, bridge, server, lifecycle, favicon logic |
| **Firefox extension** | Signed and listed on AMO; AMO description guides users to Raycast Store | All background.js logic; manifest.json; native messaging |
| **CI/CD (NEW)** | GitHub Actions workflow builds native host binary and publishes to Releases | N/A (new component) |
| **Communication** | Unchanged | HTTP on localhost:26394; native messaging stdio; port file at ~/.raycast-firefox/port |

---

## Component Boundaries

### Component 1: Native Host Build Pipeline (NEW)

**Responsibility:** Bundle `native-host/` into a standalone macOS binary that runs without Node.js or npm installed.

**Architecture decision: esbuild + Node.js SEA**

The native host uses CommonJS (`require`) with two npm dependencies (pino, pino-roll). The build pipeline is:

```
native-host/host.js + src/*.js + node_modules/
        │
        v  (esbuild --bundle --platform=node --format=cjs)
  dist/host.bundle.js  (single file, all deps inlined)
        │
        v  (node --build-sea sea-config.json)
  dist/raycast-firefox-host  (standalone macOS binary)
        │
        v  (codesign --sign -)
  dist/raycast-firefox-host  (ad-hoc signed for macOS)
```

**Why esbuild + SEA over alternatives:**

| Option | Verdict | Reason |
|--------|---------|--------|
| **esbuild + Node.js SEA** | RECOMMENDED | esbuild handles CJS bundling perfectly; SEA is built into Node.js core (v25.5+ has `--build-sea`); no third-party tooling; produces genuine native binary |
| **vercel/pkg** | REJECTED | Deprecated, no longer maintained, broken on Node.js 22+ |
| **nexe** | REJECTED | Unmaintained since 2017, no support for modern Node.js |
| **Just esbuild (no SEA)** | FALLBACK | Bundle to single .js file, use Raycast's `process.execPath` (Node 22.14+) to run it. Smaller download (~50KB vs ~80MB) but requires Raycast to be the launcher, which breaks native messaging (Firefox launches the host, not Raycast) |
| **Ship run.sh + bundle.js** | VIABLE ALTERNATIVE | esbuild bundles to single .js, ship with a shell script that finds node. Avoids 80MB binary. But still requires Node.js on user's machine |

**Critical size consideration:** Node.js SEA binaries are ~80MB on macOS arm64 because they embed the entire Node.js runtime. This is the main downside. However:
- Users download once, cached in `~/.raycast-firefox/bin/`
- GitHub Releases serves via CDN (fast)
- Alternative: ship the esbuild bundle + detect/use system Node.js, falling back to download

**Recommended approach: Tiered strategy**

1. **Primary (preferred):** esbuild bundle (~50KB) + use Raycast's Node.js (`process.execPath`) for the setup command registration. But the native messaging manifest `path` must point to something Firefox can launch independently -- so we need a thin wrapper script that finds Node.js.
2. **For users without system Node.js:** Ship a small shell wrapper (`raycast-firefox-host.sh`) that: (a) tries system node, (b) tries Raycast's node at known paths, (c) if neither found, tells user to install Node.js or falls back to SEA binary download.

**Final recommendation:** Ship an **esbuild-bundled single JS file** via GitHub Releases (~50KB compressed), with a **shell wrapper** that locates Node.js. This is the same pattern as v1.0's `run.sh` but eliminates the `node_modules` dependency. Only fall back to the full SEA binary if the project later needs to support users with zero Node.js installation.

**Rationale for NOT starting with SEA:**
- 80MB download per user is excessive for a tab switcher
- Raycast requires Node.js anyway (it auto-installs Node 22.14+), so every Raycast user already has Node.js
- The shell wrapper + bundle approach worked well in v1.0
- SEA can be added later if demand exists

### Component 2: GitHub Actions CI/CD (NEW)

**Responsibility:** Build the bundled native host, create GitHub Releases with assets, and compute checksums.

**Trigger:** Git tag push matching `v*` pattern.

**Workflow structure:**

```yaml
# .github/workflows/release.yml
on:
  push:
    tags: ['v*']

jobs:
  build-native-host:
    runs-on: macos-latest  # arm64 runner
    steps:
      - checkout
      - setup-node (22.x)
      - npm ci (in native-host/)
      - npx esbuild host.js --bundle --platform=node --format=cjs --outfile=dist/host.bundle.js
      - Generate SHA256 checksum
      - Upload artifacts

  create-release:
    needs: build-native-host
    steps:
      - Download artifacts
      - Create GitHub Release with:
        - raycast-firefox-host.js (bundled JS)
        - raycast-firefox-host.sh (wrapper script)
        - checksums.txt (SHA256)

  # Future: build-sea job if SEA binary is needed
```

**Assets published per release:**

| Asset | Size (est.) | Purpose |
|-------|-------------|---------|
| `raycast-firefox-host.js` | ~50KB | esbuild-bundled native host (single file, zero deps) |
| `raycast-firefox-host.sh` | ~1KB | Shell wrapper (finds node, runs bundle) |
| `checksums.sha256` | ~200B | SHA256 hashes for integrity verification |

### Component 3: Raycast Install Flow (MODIFIED: setup-bridge.tsx)

**Responsibility:** Detect missing native host, download from GitHub Releases, register native messaging manifest -- all automated.

**Current flow (v1.0):**
```
resolveNativeHostPath() → reads project-root.txt → finds run.sh in checkout
```

**New flow (v1.1):**
```
1. Check if host already installed at ~/.raycast-firefox/bin/host.bundle.js
   │
   ├─ YES: Check version (compare with expected version from package.json)
   │       └─ Up to date? → Skip to step 4
   │       └─ Outdated? → Continue to step 2
   │
   └─ NO: Continue to step 2
   │
2. Download from GitHub Releases
   │  URL: https://github.com/<owner>/<repo>/releases/download/v{version}/raycast-firefox-host.js
   │  Download to: {environment.supportPath}/tmp/host.bundle.js
   │
3. Verify SHA256 checksum
   │  Download checksums.sha256 from same release
   │  Compare hash of downloaded file
   │  On mismatch → error, delete file, abort
   │
4. Install to ~/.raycast-firefox/bin/
   │  Copy host.bundle.js
   │  Copy/generate wrapper script
   │  chmod +x wrapper script
   │
5. Write native messaging manifest
   │  path: ~/.raycast-firefox/bin/raycast-firefox-host.sh
   │  (replaces old path that pointed to repo checkout)
   │
6. Verify chain (existing logic)
```

**Key architectural decisions for the install flow:**

1. **Install location:** `~/.raycast-firefox/bin/` -- already using `~/.raycast-firefox/` for port and PID files; extending it is natural.

2. **Download source: GitHub Releases** -- Raycast Store review policy says "done from a server that you don't have access to" is fine. GitHub Releases for a public repo with open-source build pipeline satisfies this: the CI builds are reproducible, the source is available, and checksums provide integrity verification. The Speedtest extension pattern (downloading from `install.speedtest.net`) is analogous.

3. **Version tracking:** Write `~/.raycast-firefox/bin/version.txt` with the installed version. Compare against expected version embedded in the Raycast extension at build time.

4. **Node.js discovery in wrapper script:** The wrapper script (`raycast-firefox-host.sh`) needs to find Node.js when launched by Firefox's native messaging (which does NOT inherit user PATH). Discovery order:
   - `$HOME/.raycast-firefox/node` (symlink to Raycast's node, created during setup)
   - Common paths: `/opt/homebrew/bin/node`, `/usr/local/bin/node`
   - nvm paths (same as current `run.sh`)

5. **Symlink Raycast's Node.js:** During setup, create `~/.raycast-firefox/node` as a symlink to `process.execPath`. This is the most reliable approach because every Raycast user has this Node.js.

**File layout after install:**
```
~/.raycast-firefox/
├── bin/
│   ├── host.bundle.js          # Downloaded from GitHub Releases
│   ├── raycast-firefox-host.sh  # Wrapper script (finds node, runs bundle)
│   └── version.txt              # Installed version
├── node -> /path/to/raycast/node  # Symlink to Raycast's Node.js
├── host.pid                     # Existing: PID of running host
├── port                         # Existing: HTTP server port
└── logs/                        # Existing: pino log files
```

### Component 4: Firefox AMO Listing (MODIFIED: extension/)

**Responsibility:** Package and submit the Firefox WebExtension to addons.mozilla.org.

**What changes:**
- Extension is signed by AMO (currently sideloaded unsigned)
- AMO listing description must guide users to install the Raycast companion
- Extension ID (`raycast-firefox@lau.engineering`) is already set -- good, required for AMO

**What stays the same:**
- All `background.js` logic
- `manifest.json` structure (MV2 is fully supported on AMO, Firefox committed to continued MV2 support)
- Native messaging permission and protocol

**AMO submission requirements:**

| Requirement | Status | Notes |
|-------------|--------|-------|
| Extension ID set | Done | `raycast-firefox@lau.engineering` in manifest.json |
| MV2 supported | Yes | Firefox confirmed continued MV2 support alongside MV3 |
| Source code submission | Needed | Must upload source .zip if code is minified/bundled (ours is plain JS, may not need it) |
| Max file size | Fine | Extension is tiny (<200KB) |
| Privacy policy | Not required | No data collection, August 2025 policy update removed AMO-hosted privacy policy requirement |
| AMO listing description | NEW | Must explain that this is a companion to a Raycast extension and link to Raycast Store |

**AMO listing cross-link strategy:**
```
Extension description on AMO:
"Companion extension for the Raycast Firefox Tabs extension.
This extension enables tab search and switching from Raycast.

Setup:
1. Install this Firefox extension
2. Install "Firefox Tabs" from the Raycast Store
3. Run "Setup Firefox Bridge" in Raycast
4. You're ready! Search your tabs with Cmd+Space → 'tabs'"
```

### Component 5: Raycast Store Listing (MODIFIED: raycast-extension/)

**Responsibility:** Submit the Raycast extension to the Raycast Store.

**What changes:**
- Extension published via `npm run publish` (creates PR to `raycast/extensions` repo)
- Must have 512x512 icon, README, screenshots, MIT license
- `project-root.txt` pattern REMOVED -- replaced by GitHub Releases download flow
- README added explaining the Firefox extension requirement

**Raycast Store submission requirements:**

| Requirement | Status | Action Needed |
|-------------|--------|---------------|
| 512x512 icon (PNG) | Exists (icon.png) | Verify size and quality |
| MIT license | Set in package.json | Done |
| README.md | Missing | Create with setup instructions |
| CHANGELOG.md | Missing | Create |
| Screenshots (2000x1250) | Missing | Create 3-6 screenshots |
| npm run build passes | Need to verify | Must work without project-root.txt |
| Latest @raycast/api | ^1.104.0 | Check if newer available |
| No bundled binaries | Correct | Binary downloaded at runtime |

**Raycast Store cross-link strategy:**
- README explains Firefox extension requirement
- Error states in search-tabs.tsx link directly to AMO listing
- Setup command automates everything except Firefox extension install

---

## Data Flow Changes

### Current (v1.0): Setup Flow

```
User runs "Setup Firefox Bridge"
    │
    v
resolveNativeHostPath()
    │  reads assets/project-root.txt
    │  resolves to /Users/xxx/code/raycast-firefox/native-host/run.sh
    v
generateManifest(runShPath)
    │  writes JSON with path to run.sh
    v
writeManifest()  →  ~/Library/.../NativeMessagingHosts/raycast_firefox.json
    │
    v
verifyChain()  →  ping localhost:26394/health
```

### New (v1.1): Setup Flow

```
User runs "Setup Firefox Bridge"
    │
    v
checkInstalledVersion()
    │  reads ~/.raycast-firefox/bin/version.txt
    │  compares with expected version
    │
    ├─ Missing or outdated ──────────────────────────────┐
    │                                                     v
    │                                              downloadFromGitHub()
    │                                                │  fetch host.bundle.js
    │                                                │  fetch checksums.sha256
    │                                                │  verify SHA256
    │                                                │  write to ~/.raycast-firefox/bin/
    │                                                │  write version.txt
    │                                                v
    │                                              installWrapper()
    │                                                │  write raycast-firefox-host.sh
    │                                                │  chmod +x
    │                                                │  symlink node → process.execPath
    │                                                v
    ├─ Up to date ───────────────────────────────────┤
    │                                                 │
    v                                                 v
generateManifest(wrapperPath)
    │  path: ~/.raycast-firefox/bin/raycast-firefox-host.sh
    v
writeManifest()  →  ~/Library/.../NativeMessagingHosts/raycast_firefox.json
    │
    v
verifyChain()  →  ping localhost:26394/health
```

### Unchanged: Runtime Data Flow

The runtime communication between Raycast, native host, and Firefox remains identical:

```
Raycast ──HTTP GET /tabs──> Native Host ──native msg──> Firefox
Raycast <──JSON response─── Native Host <──tab data──── Firefox
```

---

## Architectural Patterns

### Pattern 1: Download-Verify-Install (for native host binary)

**What:** Download an external binary at setup time, verify its integrity, install to a known location.
**When to use:** When the Raycast Store prohibits bundling binaries and the binary is needed by an external process (Firefox).
**Trade-offs:** Extra setup step, but automated; needs internet on first setup; version management needed.

**Implementation sketch:**
```typescript
async function downloadAndInstall(version: string): Promise<string> {
  const baseUrl = `https://github.com/user/repo/releases/download/v${version}`;
  const tmpDir = join(environment.supportPath, "tmp");
  mkdirSync(tmpDir, { recursive: true });

  // Download bundle and checksums
  const bundlePath = join(tmpDir, "host.bundle.js");
  const bundleRes = await fetch(`${baseUrl}/raycast-firefox-host.js`);
  writeFileSync(bundlePath, Buffer.from(await bundleRes.arrayBuffer()));

  const checksumRes = await fetch(`${baseUrl}/checksums.sha256`);
  const checksums = await checksumRes.text();

  // Verify SHA256
  const hash = createHash("sha256").update(readFileSync(bundlePath)).digest("hex");
  const expectedHash = checksums.split("\n")
    .find(l => l.includes("raycast-firefox-host.js"))
    ?.split(" ")[0];
  if (hash !== expectedHash) {
    throw new Error("Checksum mismatch -- download may be corrupted");
  }

  // Install
  const installDir = join(homedir(), ".raycast-firefox", "bin");
  mkdirSync(installDir, { recursive: true });
  copyFileSync(bundlePath, join(installDir, "host.bundle.js"));

  // Clean up temp
  rmSync(tmpDir, { recursive: true, force: true });

  return installDir;
}
```

### Pattern 2: Node.js Discovery Chain (for native messaging)

**What:** A shell wrapper that finds a working Node.js binary through multiple fallback paths, used when Firefox launches the native messaging host (no user PATH available).
**When to use:** When the binary needs to be launched by a process (Firefox) that does not inherit the user's shell environment.

**Implementation sketch (raycast-firefox-host.sh):**
```bash
#!/bin/bash
DIR="$(cd "$(dirname "$0")" && pwd)"
BUNDLE="$DIR/host.bundle.js"

# 1. Symlink created by Raycast setup (most reliable)
if [ -x "$HOME/.raycast-firefox/node" ]; then
  exec "$HOME/.raycast-firefox/node" "$BUNDLE" "$@"
fi

# 2. Homebrew Apple Silicon
if [ -x "/opt/homebrew/bin/node" ]; then
  exec /opt/homebrew/bin/node "$BUNDLE" "$@"
fi

# 3. Homebrew Intel
if [ -x "/usr/local/bin/node" ]; then
  exec /usr/local/bin/node "$BUNDLE" "$@"
fi

# 4. nvm (if available)
if [ -d "$HOME/.nvm/versions/node" ]; then
  NVM_NODE=$(ls -d "$HOME/.nvm/versions/node"/v*/bin/node 2>/dev/null | sort -V | tail -1)
  [ -n "$NVM_NODE" ] && [ -x "$NVM_NODE" ] && exec "$NVM_NODE" "$BUNDLE" "$@"
fi

echo "ERROR: node not found" >&2
exit 1
```

### Pattern 3: Cross-Component Error Detection with Recovery Actions

**What:** Each component detects missing siblings and guides the user to install them.
**When to use:** Multi-component systems where components are installed separately from different stores.

**Already implemented in v1.0** (error classification in `errors.ts`), needs extension for v1.1:

| Error State | Detected By | Recovery Action |
|-------------|-------------|-----------------|
| Firefox not running | Raycast (pgrep) | "Launch Firefox" button |
| Native host not running | Raycast (ECONNREFUSED) | "Set Up Native Host" → setup-bridge |
| WebExtension not connected | Raycast (HTTP 502) | "Install WebExtension" → AMO URL |
| Native host binary missing | setup-bridge (file check) | Download from GitHub Releases |
| Host binary outdated | setup-bridge (version check) | Re-download from GitHub Releases |

---

## Anti-Patterns

### Anti-Pattern 1: Bundling the Native Host Binary in the Raycast Extension

**What people do:** Include the native host binary in the extension's `assets/` directory.
**Why it's wrong:** Raycast Store rejects extensions with opaque/heavy bundled binaries. The ~50KB JS bundle alone might be acceptable, but the 80MB SEA binary absolutely would not be. More importantly, updates to the native host would require a Raycast extension update cycle (PR review).
**Do this instead:** Download from GitHub Releases at setup time with checksum verification.

### Anti-Pattern 2: Depending on project-root.txt for Store Distribution

**What people do:** Keep the build-time path resolution (`project-root.txt`) for finding the native host.
**Why it's wrong:** When installed from the Raycast Store, the extension is sandboxed -- it doesn't live in a git checkout. The path would be meaningless. This is the #1 thing that must change for v1.1.
**Do this instead:** Install native host to a well-known location (`~/.raycast-firefox/bin/`) and resolve from there.

### Anti-Pattern 3: Requiring Manual CLI Steps After Store Install

**What people do:** Tell users "run `npm install` and `./install.sh` in the terminal."
**Why it's wrong:** Raycast Store users are not necessarily developers. The whole point of the Store is zero-friction install.
**Do this instead:** Automate everything from the setup-bridge command. The only manual step should be installing the Firefox extension from AMO (which is a one-click browser action).

### Anti-Pattern 4: Using a Custom Server for Binary Distribution

**What people do:** Host the native host binary on a personal server or S3 bucket.
**Why it's wrong:** Raycast Store explicitly rejects this pattern -- "make sure it's done from a server that you don't have access to." A personal server means you could swap the binary with malicious code after review.
**Do this instead:** Use GitHub Releases for a public, open-source repository. The CI pipeline is transparent, and the checksums are published alongside the binaries.

---

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| GitHub Releases | HTTP download at setup time | Public URL, SHA256 checksums, CDN-backed |
| Firefox AMO | WebExtension upload via web UI | One-time submission, auto-updates on new versions |
| Raycast Store | PR to `raycast/extensions` repo | Review process, must pass `npm run build` |
| GitHub Actions | CI on tag push | Builds esbuild bundle, creates Release |

### Internal Boundaries

| Boundary | Communication | v1.1 Changes |
|----------|---------------|--------------|
| Raycast ext <-> Native host | HTTP on localhost:26394 | No change |
| Firefox ext <-> Native host | Native messaging (stdio) | No change |
| Raycast ext <-> GitHub Releases | HTTPS download | NEW: setup-bridge downloads binary |
| setup-bridge <-> filesystem | Read/write ~/.raycast-firefox/ | MODIFIED: new bin/ subdirectory |
| Native messaging manifest | JSON file in ~/Library/... | MODIFIED: path points to ~/.raycast-firefox/bin/ instead of repo checkout |

---

## Build Order (Dependency-Aware)

The components have a strict dependency order:

```
Phase 1: Native Host Bundling (esbuild)
   │  Produces: host.bundle.js (single file, zero deps)
   │  No external dependencies, can be tested locally
   │
Phase 2: CI/CD Pipeline (GitHub Actions)
   │  Depends on: Phase 1 (needs esbuild config to build)
   │  Produces: GitHub Releases with versioned assets
   │
Phase 3: Raycast Install Flow (setup-bridge rewrite)
   │  Depends on: Phase 2 (needs Releases URL to download from)
   │  Produces: automated download + register flow
   │  BREAKS: project-root.txt dependency (intentional)
   │
Phase 4: Firefox AMO Submission
   │  Depends on: Nothing (extension code is unchanged)
   │  BUT: should happen after Phase 3 so AMO listing can
   │  reference the correct Raycast setup instructions
   │
Phase 5: Raycast Store Submission
   │  Depends on: Phase 3 (setup flow must work without git checkout)
   │  Depends on: Phase 4 (AMO URL needed for error state links)
   │  Produces: listed extension in Raycast Store
```

**Phase ordering rationale:**
- Phases 1-2 are pure infrastructure with no user-facing changes
- Phase 3 is the critical pivot: after this, the extension works for non-developers
- Phase 4 is mostly a packaging/submission task, low risk
- Phase 5 must be last because it's the final "published" state; everything must work end-to-end first

---

## Sources

- [Node.js SEA Documentation](https://nodejs.org/api/single-executable-applications.html) -- single executable application API, --build-sea flag (v25.5+), configuration options, limitations
- [Raycast: Prepare Extension for Store](https://developers.raycast.com/basics/prepare-an-extension-for-store) -- binary download policy, icon requirements, README requirements, review criteria
- [Raycast: Environment API](https://developers.raycast.com/api-reference/environment) -- supportPath, assetsPath properties
- [Firefox Extension Workshop: Submitting an Add-on](https://extensionworkshop.com/documentation/publish/submitting-an-add-on/) -- AMO submission steps, source code requirements
- [Firefox Extension Workshop: Distribute MV2 and MV3](https://extensionworkshop.com/documentation/publish/distribute-manifest-versions/) -- Firefox continues MV2 support alongside MV3
- [Mozilla Add-ons Policy Update (August 2025)](https://blog.mozilla.org/addons/2025/06/23/updated-add-on-policies-simplified-clarified/) -- privacy policy no longer required on AMO
- [MDN: Native Messaging](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Native_messaging) -- native messaging host manifest format, host locations
- [esbuild: Getting Started](https://esbuild.github.io/getting-started/) -- bundling for Node.js with --platform=node
- [Raycast Speedtest Extension](https://github.com/raycast/extensions/tree/main/extensions/speedtest) -- reference implementation for downloading CLI binary from trusted source with SHA256 verification

---
*Architecture research for: v1.1 Store Publishing & Distribution*
*Researched: 2026-02-24*
