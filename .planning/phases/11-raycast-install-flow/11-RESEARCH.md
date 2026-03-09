# Phase 11: Raycast Install Flow - Research

**Researched:** 2026-03-09
**Domain:** Raycast extension setup automation, GitHub Releases download, SHA256 verification, native messaging host registration
**Confidence:** HIGH

## Summary

Phase 11 transforms the existing `setup-bridge.tsx` no-view command from a manifest-only writer into a full download-verify-install pipeline. The current command assumes the native host already exists at either a dev checkout path (via `project-root.txt`) or the production path (`~/.raycast-firefox/bin/run.sh`). Phase 11 fills the gap: when the production path does not exist, the command downloads `host.bundle.js`, `run.sh`, and `SHA256SUMS.txt` from GitHub Releases, verifies integrity, installs to `~/.raycast-firefox/bin/`, creates a Node.js symlink, writes `version.txt`, and then continues with the existing manifest-write and chain-verification flow.

The entire implementation uses Node.js built-in modules (`crypto`, `fs`, `path`, `os`) plus the global `fetch()` API available in Node 22 (which is what Raycast bundles). No additional npm dependencies are needed. The download source is the public GitHub Releases API (`api.github.com/repos/toshi38/raycast-firefox/releases/latest`), which satisfies Raycast Store policy because GitHub is a server the developer does not control in the binary-serving sense. SHA256 verification using the published `SHA256SUMS.txt` provides integrity assurance.

The Node.js symlink at `~/.raycast-firefox/node` is the critical reliability improvement. Every Raycast user has Node.js at `~/Library/Application Support/com.raycast.macos/NodeJS/runtime/{version}/bin/node` because Raycast auto-installs it. During setup, `process.execPath` gives the exact path to this binary. The symlink ensures the `run.sh` wrapper always finds Node.js even when Firefox launches the native host without any user PATH. The existing `run.sh` already has a discovery chain (Raycast bundled, Homebrew, nvm, PATH) but relies on `find` to locate Raycast's Node.js -- the symlink makes this deterministic.

**Primary recommendation:** Download from GitHub Releases with SHA256 verification. Use `process.execPath` for the Node.js symlink. Keep the command as `no-view` mode with animated toast progress updates. Structure the installer as a pure function library (`lib/installer.ts`) separate from the command UI (`setup-bridge.tsx`).

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| INST-01 | User can install native host from Raycast setup command without cloning the repo | Download-Verify-Install pattern using GitHub Releases API + built-in fetch/crypto |
| INST-02 | Setup command downloads native host bundle from GitHub Releases | GitHub API `releases/latest` endpoint returns `browser_download_url` for each asset; verified working for this repo |
| INST-03 | Setup command verifies SHA256 hash of downloaded bundle | `crypto.createHash('sha256')` on downloaded buffer, compared against parsed `SHA256SUMS.txt` |
| INST-04 | Setup command extracts bundle to `~/.raycast-firefox/bin/` | `fs.mkdirSync` + `fs.writeFileSync` + `fs.chmodSync` for executable permissions |
| INST-05 | Setup command registers native messaging manifest pointing to installed bundle | Existing `generateManifest()` and `writeManifest()` in `lib/setup.ts` already handle this; path changes from dev path to `~/.raycast-firefox/bin/run.sh` |
| INST-06 | Setup command creates Node.js symlink for reliable wrapper script execution | `fs.symlinkSync(process.execPath, ~/.raycast-firefox/node)` creates deterministic Node.js discovery |
| INST-07 | Setup command verifies full chain after installation | Existing `verifyChain()` in `lib/setup.ts` already does health + tabs check on localhost |
| INST-08 | Installed bundle tracks version via `version.txt` | Write release tag to `~/.raycast-firefox/bin/version.txt` after successful install |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `node:crypto` | Built-in (Node 22) | SHA256 hash computation | Core module, zero deps, `createHash('sha256').update(buffer).digest('hex')` |
| `node:fs` | Built-in (Node 22) | File I/O, symlinks, chmod, mkdir | Core module for all filesystem operations |
| `node:path` | Built-in (Node 22) | Path joining, resolution | Core module for cross-platform paths |
| `node:os` | Built-in (Node 22) | `homedir()` for `~/.raycast-firefox` | Core module, already used in existing code |
| `fetch()` | Built-in (Node 22) | HTTP downloads from GitHub Releases | Global API in Node 18+, no `node-fetch` needed |
| `@raycast/api` | ^1.104.0 | `showToast`, `environment`, `showHUD` | Already a dependency; provides toast progress, `environment.isDevelopment` |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@raycast/api` environment | ^1.104.0 | `environment.supportPath` for temp downloads | Use as temp directory for downloads before moving to final location |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Built-in `fetch()` | `node-fetch` or `got` | No benefit -- built-in fetch works, avoids new dependency |
| `crypto.createHash` | `shasum` via execFile | Slower, fragile, no benefit -- crypto module is cleaner |
| GitHub Releases download | Bundle in `assets/` directory | Would avoid network dependency but complicates updates; ~167KB asset bloats extension download for all users; GitHub Releases is the pattern used by approved Raycast Store extensions (Bitwarden, Speedtest) |

**Installation:**
No new dependencies required. All functionality uses Node.js built-ins and existing `@raycast/api`.

## Architecture Patterns

### Recommended Project Structure

```
raycast-extension/src/
├── setup-bridge.tsx         # Command entry point (orchestrates steps, shows toasts)
├── lib/
│   ├── installer.ts         # NEW: download, verify, install, symlink logic
│   ├── setup.ts             # EXISTING: manifest generation, writing, validation, chain verify
│   └── errors.ts            # EXISTING: error classification (no changes needed)
```

### Pattern 1: Download-Verify-Install Pipeline

**What:** A sequential pipeline that downloads release assets, verifies their SHA256 checksums, installs files to a known location, and tracks the installed version.

**When to use:** When the extension needs to install an external binary/script that cannot be bundled.

**Example:**

```typescript
// Source: Node.js crypto docs + GitHub REST API docs
import { createHash } from "crypto";
import { mkdirSync, writeFileSync, chmodSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const REPO = "toshi38/raycast-firefox";
const INSTALL_DIR = join(homedir(), ".raycast-firefox", "bin");

interface ReleaseAsset {
  name: string;
  browser_download_url: string;
}

interface ReleaseInfo {
  tag_name: string;
  assets: ReleaseAsset[];
}

async function getLatestRelease(): Promise<ReleaseInfo> {
  const res = await fetch(
    `https://api.github.com/repos/${REPO}/releases/latest`,
    { headers: { Accept: "application/vnd.github.v3+json" } }
  );
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
  return res.json() as Promise<ReleaseInfo>;
}

async function downloadAsset(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

function verifySha256(buffer: Buffer, expectedHash: string): boolean {
  const actual = createHash("sha256").update(buffer).digest("hex");
  return actual === expectedHash;
}

function parseSha256Sums(content: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of content.trim().split("\n")) {
    // Format: "<hash>  <filename>" (double-space separator from shasum -a 256)
    const match = line.match(/^([a-f0-9]{64})\s+(.+)$/);
    if (match) map.set(match[2], match[1]);
  }
  return map;
}
```

### Pattern 2: Node.js Symlink Creation

**What:** Create a symlink at `~/.raycast-firefox/node` pointing to the Raycast runtime's Node.js binary, so the wrapper script has a deterministic Node.js path.

**When to use:** During setup, after file installation.

**Example:**

```typescript
// Source: Node.js fs docs
import { symlinkSync, unlinkSync, existsSync, lstatSync } from "fs";
import { join } from "path";
import { homedir } from "os";

function createNodeSymlink(): void {
  const symlinkPath = join(homedir(), ".raycast-firefox", "node");
  const nodeExecPath = process.execPath;

  // Remove existing symlink (idempotent)
  if (existsSync(symlinkPath)) {
    const stat = lstatSync(symlinkPath);
    if (stat.isSymbolicLink()) {
      unlinkSync(symlinkPath);
    }
  }

  symlinkSync(nodeExecPath, symlinkPath);
}
```

### Pattern 3: Animated Toast Progress

**What:** Show an animated toast during the download/install, then update it to success or failure.

**When to use:** In the no-view setup command during multi-step operations.

**Example:**

```typescript
// Source: Raycast Toast API docs
import { showToast, Toast } from "@raycast/api";

const toast = await showToast({
  style: Toast.Style.Animated,
  title: "Installing Firefox Bridge",
  message: "Downloading native host...",
});

// ... download happens ...

toast.message = "Verifying checksum...";

// ... verify happens ...

toast.message = "Installing files...";

// ... install happens ...

toast.style = Toast.Style.Success;
toast.title = "Firefox Bridge Installed";
toast.message = "Run 'Search Firefox Tabs' to get started";
```

### Pattern 4: Idempotent Install (Reinstall/Update)

**What:** The installer checks whether files already exist and either skips or overwrites. Running setup twice does not break anything.

**When to use:** For INST-05 (second run succeeds cleanly) and update scenarios.

**Key behaviors:**
- If `~/.raycast-firefox/bin/version.txt` matches the latest release tag, skip download but still re-register manifest and re-verify symlink
- If version differs or files are missing, download and install fresh
- Always re-create the Node.js symlink (Raycast may have updated its Node.js)
- Always re-write the native messaging manifest (ensures correctness)

### Anti-Patterns to Avoid

- **Shelling out to `curl` or `shasum`:** Use built-in `fetch()` and `crypto` instead. Subprocess invocation is slower, harder to handle errors from, and introduces shell-injection risk if paths contain special characters.
- **Hardcoding the release version in source code:** Fetch the latest release from the GitHub API at runtime. The version is tracked in `version.txt` after install, not baked into the extension source.
- **Writing files directly to the final location during download:** Download to a temp directory first, verify checksums, then move to the install directory. This prevents half-installed states if the download is interrupted.
- **Forgetting `chmod +x` on `run.sh`:** The downloaded `run.sh` must be executable. GitHub Releases strips file permissions from uploads.
- **Creating the symlink to a versioned Raycast Node.js path:** Use `process.execPath` which is the actual binary path. Do NOT hardcode `~/Library/Application Support/com.raycast.macos/NodeJS/runtime/22.14.0/bin/node` because the version number changes when Raycast updates.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SHA256 checksum verification | Custom hash implementation | `crypto.createHash('sha256')` | Crypto-quality implementation in Node core; 3 lines of code |
| HTTP downloads | Subprocess invocation of curl | Built-in `fetch()` | Async, promise-based, proper error handling, no shell risks |
| GitHub release discovery | Scraping GitHub HTML pages | GitHub REST API `/repos/{owner}/{repo}/releases/latest` | Stable JSON API, returns `tag_name` and `assets[].browser_download_url` |
| File permissions | Subprocess invocation of chmod | `fs.chmodSync(path, 0o755)` | Synchronous, no shell, proper error propagation |
| Symlink management | Manual path concatenation for Raycast Node.js | `process.execPath` | Always correct regardless of Raycast Node.js version changes |
| Temp file cleanup | Manual tracking of temp files | Download to `environment.supportPath` + `rmSync` on completion | Raycast manages supportPath lifecycle |

**Key insight:** Every operation in this phase uses Node.js built-in modules. Zero external dependencies are needed. The complexity is in orchestration (step ordering, error handling, idempotency), not in any individual operation.

## Common Pitfalls

### Pitfall 1: GitHub API Rate Limiting

**What goes wrong:** The GitHub REST API has a rate limit of 60 requests/hour for unauthenticated requests. If users re-run setup many times or many users share an IP (corporate network), they hit 403 responses.
**Why it happens:** The `/repos/{owner}/{repo}/releases/latest` endpoint is unauthenticated.
**How to avoid:** Include proper error handling for 403/429 responses with a user-friendly message ("GitHub rate limit reached, try again in a few minutes"). Consider caching the release info in `environment.supportPath` for a short period. The actual asset downloads go through `github.com` CDN, not the API, so they are not rate-limited.
**Warning signs:** 403 status code from `api.github.com`.

### Pitfall 2: GitHub Releases Asset Download Redirects

**What goes wrong:** The `browser_download_url` for GitHub Release assets (e.g., `https://github.com/toshi38/raycast-firefox/releases/download/native-host%401.1.0/host.bundle.js`) returns a 302 redirect to a CDN URL. If fetch does not follow redirects, the download fails.
**Why it happens:** GitHub serves release assets through a CDN redirect.
**How to avoid:** Node.js built-in `fetch()` follows redirects by default (`redirect: 'follow'` is the default). No special handling needed. But verify with a test.
**Warning signs:** Getting HTML instead of binary content, or a 302 status.

### Pitfall 3: Downloaded `run.sh` Loses Execute Permission

**What goes wrong:** `run.sh` is downloaded as a regular file without the execute bit. When Firefox tries to launch the native messaging host, it fails silently because `run.sh` is not executable.
**Why it happens:** GitHub Releases does not preserve Unix file permissions. All downloaded files have default permissions (0644).
**How to avoid:** After writing `run.sh` to disk, always call `chmodSync(path, 0o755)`.
**Warning signs:** Native messaging host fails to start. `wrapper.log` is empty (never even ran). Firefox developer console shows native messaging errors.

### Pitfall 4: Symlink Target Becomes Stale After Raycast Node.js Update

**What goes wrong:** The symlink at `~/.raycast-firefox/node` points to `~/Library/Application Support/com.raycast.macos/NodeJS/runtime/22.14.0/bin/node`. When Raycast updates to Node 22.15.0, the old path no longer exists and the symlink is broken.
**Why it happens:** Raycast auto-updates its Node.js runtime, changing the versioned directory name.
**How to avoid:** The `run.sh` wrapper script's priority chain should treat the symlink as one option, not the only option. If the symlink is broken, fall back to the `find` command (existing behavior) or Homebrew paths. Additionally, re-running the setup command re-creates the symlink to the current `process.execPath`.
**Warning signs:** `~/.raycast-firefox/node` is a broken symlink. `ls -la ~/.raycast-firefox/node` shows red in terminal.

### Pitfall 5: Partial Install State From Interrupted Download

**What goes wrong:** Download completes for `host.bundle.js` but fails for `run.sh` (network interruption). The install directory has an incomplete set of files. Next run sees `host.bundle.js` exists and may skip download.
**Why it happens:** Files are written individually; a crash between writes leaves partial state.
**How to avoid:** Use an atomic install pattern: download all files to a temp directory, verify ALL checksums, then move everything to the install directory in one batch. Write `version.txt` last as a "commit marker" -- its presence signals a complete install.
**Warning signs:** `~/.raycast-firefox/bin/host.bundle.js` exists but `run.sh` or `version.txt` does not.

### Pitfall 6: `run.sh` Wrapper Script Inconsistency With Installed Version

**What goes wrong:** The `run.sh` in the GitHub Release may have different content than the `run.sh` currently in the install directory. If setup only checks `version.txt` and the wrapper script evolves between releases, the old wrapper script remains.
**Why it happens:** The installer might skip download if version matches, but the user may have a corrupted or manually edited `run.sh`.
**How to avoid:** Always overwrite all files during install (even if version matches). The download is tiny (~167KB total). The cost of re-downloading is negligible compared to the debugging cost of stale files.
**Warning signs:** `run.sh` behavior differs from what the release tag expects.

### Pitfall 7: NativeMessagingHosts Directory Does Not Exist on Fresh Firefox

**What goes wrong:** `~/Library/Application Support/Mozilla/NativeMessagingHosts/` does not exist until either Firefox or another extension creates it. Writing the manifest fails.
**Why it happens:** Fresh Firefox installations do not create this directory by default.
**How to avoid:** The existing `writeManifest()` in `lib/setup.ts` already uses `mkdirSync(targetDir, { recursive: true })`. No change needed, but verify this path is still correct.
**Warning signs:** `ENOENT` error when writing the manifest file.

### Pitfall 8: `process.execPath` Returns Unexpected Path in Development Mode

**What goes wrong:** During `ray develop`, `process.execPath` might return a different Node.js binary than in production (Store-installed) mode.
**Why it happens:** In dev mode, Raycast may use the system Node.js or a different runtime path.
**How to avoid:** Check `environment.isDevelopment` and handle accordingly. In dev mode, the symlink is less critical because the developer likely has Node.js on PATH. Still create it, but log which path was used.
**Warning signs:** Symlink points to `/usr/local/bin/node` instead of the Raycast bundled path.

## Code Examples

Verified patterns from official sources:

### Fetching Latest Release from GitHub API

```typescript
// Source: GitHub REST API docs (https://docs.github.com/en/rest/releases/releases)
// Verified: curl https://api.github.com/repos/toshi38/raycast-firefox/releases/latest
// returns { tag_name: "native-host@1.1.0", assets: [{name, browser_download_url}] }

const GITHUB_API = "https://api.github.com/repos/toshi38/raycast-firefox/releases/latest";

async function getLatestRelease(): Promise<{
  tag: string;
  version: string;
  assets: Map<string, string>;
}> {
  const res = await fetch(GITHUB_API, {
    headers: {
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "raycast-firefox-setup",
    },
    signal: AbortSignal.timeout(10000),
  });
  if (res.status === 403) {
    throw new Error(
      "GitHub API rate limit reached. Please try again in a few minutes."
    );
  }
  if (!res.ok) {
    throw new Error(`Failed to check for updates (HTTP ${res.status})`);
  }
  const data = (await res.json()) as {
    tag_name: string;
    assets: { name: string; browser_download_url: string }[];
  };
  const assets = new Map<string, string>();
  for (const asset of data.assets) {
    assets.set(asset.name, asset.browser_download_url);
  }
  // tag_name is "native-host@1.1.0", version is "1.1.0"
  const version = data.tag_name.replace("native-host@", "");
  return { tag: data.tag_name, version, assets };
}
```

### SHA256 Verification of Downloaded Files

```typescript
// Source: Node.js crypto docs (https://nodejs.org/api/crypto.html)
import { createHash } from "crypto";

function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function parseSha256Sums(content: string): Map<string, string> {
  // Format from `shasum -a 256`: "<hash>  <filename>\n"
  // Double-space separator is the standard shasum output
  const map = new Map<string, string>();
  for (const line of content.trim().split("\n")) {
    const match = line.match(/^([a-f0-9]{64})\s{1,2}(.+)$/);
    if (match) map.set(match[2].trim(), match[1]);
  }
  return map;
}

function verifyFile(
  buffer: Buffer,
  filename: string,
  checksums: Map<string, string>
): void {
  const expected = checksums.get(filename);
  if (!expected) {
    throw new Error(`No checksum found for ${filename} in SHA256SUMS.txt`);
  }
  const actual = sha256(buffer);
  if (actual !== expected) {
    throw new Error(
      `Checksum mismatch for ${filename}.\n` +
        `Expected: ${expected}\n` +
        `Got: ${actual}\n` +
        `The download may be corrupted. Please try again.`
    );
  }
}
```

### Atomic Install to ~/.raycast-firefox/bin/

```typescript
// Source: Node.js fs docs (https://nodejs.org/api/fs.html)
import { mkdirSync, writeFileSync, chmodSync } from "fs";
import { join } from "path";
import { homedir } from "os";

interface InstallFiles {
  hostBundle: Buffer;
  runSh: Buffer;
  version: string;
}

function installFiles({ hostBundle, runSh, version }: InstallFiles): string {
  const installDir = join(homedir(), ".raycast-firefox", "bin");
  mkdirSync(installDir, { recursive: true });

  // Write files
  writeFileSync(join(installDir, "host.bundle.js"), hostBundle);
  writeFileSync(join(installDir, "run.sh"), runSh);
  chmodSync(join(installDir, "run.sh"), 0o755);

  // version.txt written last as "install complete" marker
  writeFileSync(join(installDir, "version.txt"), version, "utf-8");

  return installDir;
}
```

### Modifying run.sh Priority Chain for Symlink

The existing `run.sh` already has a priority chain. The only change needed is adding the symlink as Priority 0 (before the Raycast `find` command):

```bash
# NEW Priority 0: Symlink created by Raycast setup (fastest, most reliable)
if [ -x "$HOME/.raycast-firefox/node" ]; then
  try_node "$HOME/.raycast-firefox/node" "Raycast symlink"
fi

# Existing Priority 1: Raycast bundled Node.js (find command -- slower fallback)
RAYCAST_NODE=$(find "$HOME/Library/Application Support/com.raycast.macos/NodeJS/runtime" \
  -name "node" -type f 2>/dev/null | head -1)
```

**Important:** The `run.sh` in the repo source needs to be updated to include this symlink check BEFORE the next release, so the downloaded version includes the symlink priority. This change is additive and backward-compatible.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `project-root.txt` path resolution | Dual-mode: dev path + production path (`~/.raycast-firefox/bin/run.sh`) | Phase 9 (2026-02-27) | Production path already supported but not populated |
| Manual `install.sh` terminal script | Automated Raycast setup command | Phase 8 (v1.0, 2026-02-23) | Setup command exists but only writes manifest |
| `node-fetch` or `got` for HTTP | Built-in `fetch()` in Node 18+ | Node.js 18 (2022) | No extra dependencies needed |

**Deprecated/outdated:**
- `project-root.txt` pattern: Still exists in `prebuild`/`predev` scripts for dev mode, but production code no longer depends on it (Phase 9 change)
- `install.sh`: The manual terminal installer script still exists in the repo but will be superseded by the Raycast setup command for end users

## Open Questions

1. **Should the command mode change from `no-view` to `view`?**
   - What we know: `no-view` commands stay alive until the async function resolves. Animated toasts update during execution. The download is ~167KB and should complete in 1-2 seconds.
   - What's unclear: Whether users will find toast-only progress sufficient for a multi-step operation, or if a `Detail` view with markdown steps would be better UX.
   - Recommendation: Keep `no-view` mode. The operation is fast enough that toast updates are sufficient. Converting to a `view` command would require rethinking the entire UX flow and add complexity. If user feedback indicates confusion, convert in a later phase.

2. **Should `run.sh` in the repo be updated to include the symlink check before the next release?**
   - What we know: The `run.sh` published to GitHub Releases is the one from `native-host/dist/run.sh`, which is copied from `native-host/run.sh` during the esbuild step. Currently it does NOT have the symlink check.
   - What's unclear: Whether to update `run.sh` as part of this phase or as a prerequisite.
   - Recommendation: Update `run.sh` as part of this phase. The change is additive (new priority 0 before existing priority 1) and backward-compatible. The next release will include it.

3. **How should the installer handle the case where the GitHub API is unreachable?**
   - What we know: The download requires internet access. First-time install cannot work offline.
   - What's unclear: Whether to show a "try again later" message or attempt to use a previously cached download.
   - Recommendation: Show a clear error message with "Check your internet connection and try again" guidance. Do not cache downloads -- the files are small enough that re-downloading is fast.

## Validation Architecture

> Nyquist validation enabled (workflow.nyquist_validation not explicitly false).

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Manual testing (no automated test framework currently configured for the Raycast extension) |
| Config file | None |
| Quick run command | `cd raycast-extension && npm run build` (type-check) |
| Full suite command | Manual: run setup command in Raycast, verify chain |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INST-01 | Setup command installs without cloning repo | e2e / manual | Manual: remove `~/.raycast-firefox/bin/`, run setup | N/A |
| INST-02 | Downloads from GitHub Releases | integration / manual | Manual: monitor network, run setup | N/A |
| INST-03 | Verifies SHA256 hash | unit | `node -e "require('./src/lib/installer').verifySha256(...)"` | Wave 0 |
| INST-04 | Extracts to `~/.raycast-firefox/bin/` | integration / manual | `ls -la ~/.raycast-firefox/bin/` after setup | N/A |
| INST-05 | Registers native messaging manifest | integration / manual | `cat ~/Library/Application\ Support/Mozilla/NativeMessagingHosts/raycast_firefox.json` | N/A |
| INST-06 | Creates Node.js symlink | integration / manual | `ls -la ~/.raycast-firefox/node` after setup | N/A |
| INST-07 | Verifies full chain | integration / manual | Manual: run setup with Firefox + extension running | N/A |
| INST-08 | Tracks version in `version.txt` | integration / manual | `cat ~/.raycast-firefox/bin/version.txt` after setup | N/A |

### Sampling Rate

- **Per task commit:** `cd raycast-extension && npm run build` (TypeScript compilation check)
- **Per wave merge:** Manual end-to-end: clean install on fresh `~/.raycast-firefox/` directory
- **Phase gate:** Full chain verification: Raycast -> native host -> Firefox extension, including second-run idempotency

### Wave 0 Gaps

- [ ] No unit test infrastructure exists for the Raycast extension -- the SHA256 verification logic is the only piece that can be meaningfully unit-tested without Raycast runtime
- [ ] TypeScript compilation (`npm run build`) serves as the primary automated validation
- [ ] Manual testing checklist should be documented in the plan for each requirement

## Sources

### Primary (HIGH confidence)

- GitHub REST API Releases endpoint -- verified by `curl https://api.github.com/repos/toshi38/raycast-firefox/releases/latest` (returns tag_name, assets with browser_download_url)
- SHA256SUMS.txt format -- verified by downloading actual release asset; format is `<hash>  <filename>` (shasum -a 256 output)
- Raycast Node.js runtime path -- verified on local machine: `~/Library/Application Support/com.raycast.macos/NodeJS/runtime/22.14.0/bin/node`
- Node.js `crypto.createHash` -- verified working in Raycast's Node 22.14.0 runtime
- Raycast Toast API -- official docs at https://developers.raycast.com/api-reference/feedback/toast
- Raycast Environment API -- official docs at https://developers.raycast.com/api-reference/environment
- Existing codebase: `lib/setup.ts`, `setup-bridge.tsx`, `native-host/run.sh`, `native-host/dist/run.sh`
- Prior project research: `.planning/research/ARCHITECTURE.md`, `.planning/research/SUMMARY.md`

### Secondary (MEDIUM confidence)

- Raycast Store binary download policy -- https://developers.raycast.com/basics/prepare-an-extension-for-store ("Trusted sources with verification" is permitted; "Self-hosted downloads" prohibited; GitHub Releases is analogous to Speedtest/Bitwarden pattern)
- Raycast no-view command lifecycle -- https://developers.raycast.com/information/lifecycle (stays alive until async function resolves)
- `process.execPath` in Raycast context -- inferred from Raycast architecture blog post (https://www.raycast.com/blog/how-raycast-api-extensions-work) and Node.js docs; needs runtime verification

### Tertiary (LOW confidence)

- GitHub API rate limit behavior (60 req/hr unauthenticated) -- well-known but not verified for this specific use case pattern

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all Node.js built-in modules, verified on target runtime
- Architecture: HIGH -- follows patterns from prior project research, verified against existing codebase, matches Raycast-approved patterns (Bitwarden, Speedtest)
- Pitfalls: HIGH -- derived from concrete investigation of the release pipeline, download mechanics, and file permission behavior
- Code examples: HIGH -- verified against actual GitHub API responses and Node.js crypto module

**Research date:** 2026-03-09
**Valid until:** 2026-04-09 (stable -- Node.js built-ins, GitHub API, and Raycast API are all mature)
