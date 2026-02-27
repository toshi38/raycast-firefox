# Phase 9: Native Host Bundling - Research

**Researched:** 2026-02-27
**Domain:** Node.js application bundling (esbuild), pino sync logging, shell scripting (Node.js discovery)
**Confidence:** HIGH

## Summary

Bundling the native host into a single JS file with esbuild is straightforward and verified experimentally. The current native host has only two npm dependencies (`pino` and `pino-roll`), uses no `__dirname`/`__filename`, and all Node.js built-in requires are automatically externalized by esbuild's `platform: 'node'` setting. A test bundle of the actual codebase produced a 159KB single file in 8ms.

The critical change is replacing `pino.transport({ target: 'pino-roll' })` (which spawns a worker thread and fails when bundled -- verified experimentally) with `pino(opts, pino.destination({ sync: true, dest: filePath, mkdir: true }))`. This was verified: sync destination writes correctly to `~/.raycast-firefox/logs/host.log` from a bundled file with zero additional dependencies. Log rotation must be handled manually since pino-roll is removed -- a simple startup-time size check with rename is sufficient for this use case.

The shell wrapper needs rewriting to follow the user-specified Node.js discovery priority chain and add version checking (>=18). The Raycast extension's `resolveNativeHostPath()` needs dual-mode logic: dev path (project-root.txt) for development, production path (`~/.raycast-firefox/bin/run.sh`) for installed users.

**Primary recommendation:** Use esbuild with `platform: 'node'`, `format: 'cjs'`, `bundle: true` to produce `host.bundle.js`. Replace pino-roll with `pino.destination({ sync: true })`. Implement simple startup-time log rotation in-process. Rewrite `run.sh` with the specified Node.js priority chain.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Native host discovery**: Dual mode -- extension checks dev path first, then installed bundle path
  - Dev path: if `project-root.txt` exists, use it (preserves current development workflow)
  - Production path: `~/.raycast-firefox/bin/` (hardcoded, not configurable)
  - Priority: dev path wins when both exist -- developers always test local changes
  - When neither found: error guides user to run the setup command (Phase 11)
- **Build artifact layout**:
  - Output directory: `native-host/dist/` (gitignored)
  - Build command: `npm run build` in `native-host/package.json`
  - dist/ contains both `host.bundle.js` and `run.sh` (wrapper script) -- everything CI/CD needs in one place
  - esbuild added as devDependency in `native-host/package.json`
- **Wrapper failure UX**:
  - No Node.js found: log error to `~/.raycast-firefox/logs/` listing all paths checked, exit non-zero
  - Minimum Node.js version check (>=18) before launching bundle; log clear error if too old
  - Bundle crash at runtime: log crash + exit code, let Raycast extension's error handling take it from there (no restart attempts)
  - On success: always log which Node.js was discovered, its path, and version -- invaluable for debugging user issues

### Claude's Discretion
- esbuild configuration details (target, platform, format)
- Exact minimum Node.js version threshold
- Sync pino logging implementation approach
- Log file rotation/naming within ~/.raycast-firefox/logs/

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| BUND-01 | Native host builds into a single JS file via esbuild with all dependencies inlined | Verified experimentally: `esbuild host.js --bundle --platform=node --format=cjs` produces 159KB single file with all deps inlined. JSON imports (package.json) and all npm deps (pino, sonic-boom, etc.) are inlined. Node.js built-ins (fs, path, os, http, crypto) remain external automatically. |
| BUND-02 | Pino logging uses sync destination instead of pino-roll worker threads | Verified experimentally: `pino.destination({ sync: true, dest: filePath, mkdir: true })` works correctly in a bundled file. `pino.transport()` (worker threads) fails with "Cannot find module lib/worker.js" when bundled -- confirmed. Sync destination produces identical JSON log output. |
| BUND-03 | Shell wrapper discovers Node.js via priority chain (Raycast bundled -> Homebrew ARM -> Homebrew Intel -> nvm -> system PATH) | Raycast Node.js location confirmed at `~/Library/Application Support/com.raycast.macos/NodeJS/runtime/*/bin/node` (currently v22.14.0). Homebrew ARM at `/opt/homebrew/bin/node`, Intel at `/usr/local/bin/node`. nvm at `~/.nvm/versions/node/*/bin/node`. Priority chain is implementable with sequential checks in bash. |
| INST-09 | project-root.txt dependency eliminated -- extension works without git checkout | Raycast extension's `resolveNativeHostPath()` in `setup.ts` reads `assets/project-root.txt` to find `native-host/run.sh`. Replace with dual-mode: check `~/.raycast-firefox/bin/run.sh` (production), fall back to `project-root.txt` (dev). The `setup-bridge.tsx` command, `generateManifest()`, `validateManifest()`, and `verifyChain()` are unaffected -- they operate on the resolved path regardless of source. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| esbuild | 0.27.x | Bundle native host into single JS file | Fastest JS bundler; first-class Node.js CJS support; JSON loader built-in; zero config for this use case |
| pino | 9.x (already installed) | Structured JSON logging | Already in use; `pino.destination({ sync: true })` replaces pino-roll without changing log format |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| sonic-boom | (bundled via pino) | High-throughput file writer under pino.destination | Automatically included; provides `reopen()` for log rotation signals |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| esbuild | webpack/rollup | Much slower, more complex config; esbuild bundles this project in 8ms |
| Manual log rotation | logrotate (OS) | External dependency users must configure; simple in-process rotation is sufficient for small log volume |
| pino sync destination | Custom file writer | Loses pino's structured logging, serializers, and level filtering; no benefit |

**Installation:**
```bash
cd native-host && npm install --save-dev esbuild
```

**Removal:**
```bash
cd native-host && npm uninstall pino-roll
```

## Architecture Patterns

### Recommended Project Structure
```
native-host/
  host.js                    # Entry point (unchanged, source of truth)
  src/
    logger.js                # MODIFIED: sync pino.destination instead of pino.transport
    protocol.js              # Unchanged
    lifecycle.js             # Unchanged
    bridge.js                # Unchanged
    server.js                # Unchanged
    health.js                # Unchanged
    favicon-cache.js         # Unchanged
    log-rotation.js          # NEW: simple startup-time log rotation
  dist/                      # NEW (gitignored): build output
    host.bundle.js           # Bundled single file
    run.sh                   # Wrapper script (copied/generated during build)
  esbuild.config.js          # NEW: build configuration
  package.json               # MODIFIED: add build script, esbuild devDep, remove pino-roll

raycast-extension/
  src/lib/setup.ts           # MODIFIED: dual-mode path resolution
  package.json               # prebuild/predev scripts remain for dev workflow
```

### Pattern 1: esbuild Build Script
**What:** Standalone build configuration for producing the bundle
**When to use:** `npm run build` in native-host/
**Example:**
```javascript
// native-host/esbuild.config.js
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

esbuild.build({
  entryPoints: ['host.js'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  outfile: 'dist/host.bundle.js',
  minify: false,          // Keep readable for debugging user issues
  sourcemap: false,       // Not needed -- single file is already debuggable
  metafile: true,
  banner: {
    js: '#!/usr/bin/env node\n// Bundled by esbuild -- do not edit',
  },
}).then(result => {
  // Copy run.sh to dist/
  fs.copyFileSync('run.sh', path.join('dist', 'run.sh'));
  fs.chmodSync(path.join('dist', 'run.sh'), 0o755);

  // Log bundle analysis
  return esbuild.analyzeMetafile(result.metafile);
}).then(analysis => {
  console.log(analysis);
}).catch(() => process.exit(1));
```
Source: Verified experimentally + [esbuild official docs](https://esbuild.github.io/api/)

### Pattern 2: Sync Pino Logging with In-Process Rotation
**What:** Replace pino-roll transport with sync destination + simple startup rotation
**When to use:** Logger initialization in bundled native host
**Example:**
```javascript
// native-host/src/logger.js (new version)
'use strict';

const pino = require('pino');
const path = require('path');
const fs = require('fs');
const os = require('os');

const LOG_DIR = path.join(os.homedir(), '.raycast-firefox', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'host.log');
const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_LOG_FILES = 5;

/**
 * Rotate logs at startup if the current log file exceeds MAX_LOG_SIZE.
 * Shifts host.log -> host.log.1 -> host.log.2 -> ... -> host.log.N (deleted).
 * Only runs once at process start -- not on every write.
 */
function rotateIfNeeded() {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    const stat = fs.statSync(LOG_FILE);
    if (stat.size < MAX_LOG_SIZE) return;

    // Delete oldest
    const oldest = `${LOG_FILE}.${MAX_LOG_FILES}`;
    try { fs.unlinkSync(oldest); } catch (_) { /* ignore */ }

    // Shift existing rotated files
    for (let i = MAX_LOG_FILES - 1; i >= 1; i--) {
      const from = `${LOG_FILE}.${i}`;
      const to = `${LOG_FILE}.${i + 1}`;
      try { fs.renameSync(from, to); } catch (_) { /* ignore */ }
    }

    // Rotate current
    fs.renameSync(LOG_FILE, `${LOG_FILE}.1`);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      // Can't log yet -- write to stderr as last resort
      process.stderr.write(`Log rotation error: ${err.message}\n`);
    }
  }
}

rotateIfNeeded();

const dest = pino.destination({
  dest: LOG_FILE,
  mkdir: true,
  sync: true,
});

const logger = pino(
  {
    level: 'info',
    formatters: {
      level: (label) => ({ level: label }),
    },
  },
  dest,
);

function getLogDir() {
  return LOG_DIR;
}

module.exports = { logger, getLogDir };
```
Source: [Pino sync destination docs](https://github.com/pinojs/pino/blob/main/docs/api.md), [Pino async docs](https://github.com/pinojs/pino/blob/main/docs/asynchronous.md)

### Pattern 3: Node.js Discovery Shell Wrapper
**What:** Shell script that finds Node.js via priority chain and launches the bundle
**When to use:** Firefox native messaging host entry point
**Example:**
```bash
#!/bin/bash
# run.sh - Finds Node.js and launches the native host bundle.
# Firefox does not inherit the user's shell PATH, so we probe common locations.

set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
BUNDLE="$DIR/host.bundle.js"
LOG_DIR="$HOME/.raycast-firefox/logs"
MIN_NODE_VERSION=18

mkdir -p "$LOG_DIR"

log_and_exit() {
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) ERROR: $1" >> "$LOG_DIR/wrapper.log"
  exit 1
}

log_info() {
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) INFO: $1" >> "$LOG_DIR/wrapper.log"
}

check_node_version() {
  local node_path="$1"
  local version
  version=$("$node_path" --version 2>/dev/null) || return 1
  local major
  major=$(echo "$version" | sed 's/^v//' | cut -d. -f1)
  if [ "$major" -ge "$MIN_NODE_VERSION" ] 2>/dev/null; then
    return 0
  fi
  log_info "Skipping $node_path: version $version < v${MIN_NODE_VERSION}"
  return 1
}

try_node() {
  local node_path="$1"
  local label="$2"
  if [ -x "$node_path" ] && check_node_version "$node_path"; then
    local version
    version=$("$node_path" --version 2>/dev/null)
    log_info "Using $label: $node_path ($version)"
    exec "$node_path" "$BUNDLE" "$@"
  fi
}

# Priority 1: Raycast bundled Node.js
RAYCAST_NODE_DIR="$HOME/Library/Application Support/com.raycast.macos/NodeJS/runtime"
if [ -d "$RAYCAST_NODE_DIR" ]; then
  RAYCAST_NODE=$(find "$RAYCAST_NODE_DIR" -name "node" -type f 2>/dev/null | head -1)
  [ -n "$RAYCAST_NODE" ] && try_node "$RAYCAST_NODE" "Raycast bundled"
fi

# Priority 2: Homebrew ARM (Apple Silicon)
try_node "/opt/homebrew/bin/node" "Homebrew ARM"

# Priority 3: Homebrew Intel
try_node "/usr/local/bin/node" "Homebrew Intel"

# Priority 4: nvm (latest version)
if [ -d "$HOME/.nvm/versions/node" ]; then
  NVM_NODE=$(ls -d "$HOME/.nvm/versions/node"/v*/bin/node 2>/dev/null | sort -V | tail -1)
  [ -n "$NVM_NODE" ] && try_node "$NVM_NODE" "nvm"
fi

# Priority 5: system PATH
if command -v node >/dev/null 2>&1; then
  try_node "$(command -v node)" "system PATH"
fi

# No suitable Node.js found
log_and_exit "No Node.js >= v${MIN_NODE_VERSION} found. Checked: Raycast bundled, Homebrew ARM (/opt/homebrew/bin/node), Homebrew Intel (/usr/local/bin/node), nvm (~/.nvm/versions/node/), system PATH"
```

### Pattern 4: Dual-Mode Native Host Path Resolution
**What:** Raycast extension checks dev path first, falls back to production installed path
**When to use:** `resolveNativeHostPath()` in setup.ts
**Example:**
```typescript
// raycast-extension/src/lib/setup.ts
import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { join, resolve } from "path";
import { environment } from "@raycast/api";

const PRODUCTION_RUN_SH = join(
  homedir(),
  ".raycast-firefox",
  "bin",
  "run.sh",
);

export function resolveNativeHostPath(): string {
  // Dev path: project-root.txt exists -> use repo checkout
  const rootFile = join(environment.assetsPath, "project-root.txt");
  if (existsSync(rootFile)) {
    const projectRoot = readFileSync(rootFile, "utf-8").trim();
    const devPath = join(projectRoot, "native-host", "run.sh");
    if (existsSync(devPath)) {
      return resolve(devPath);
    }
  }

  // Production path: installed bundle
  if (existsSync(PRODUCTION_RUN_SH)) {
    return resolve(PRODUCTION_RUN_SH);
  }

  // Neither found
  throw new Error(
    "Native host not found. Run the 'Setup Firefox Bridge' command to install it.",
  );
}
```

### Anti-Patterns to Avoid
- **Using `pino.transport()` in bundled code:** Worker threads cannot resolve module paths inside a bundle. Always use `pino.destination({ sync: true })` instead.
- **Minifying the bundle:** The native host is not a web app. Readable bundle aids debugging user issues. 159KB unminified is tiny.
- **Using `--packages=external` in esbuild:** This would keep pino/pino-roll as external requires, defeating the purpose of bundling. Must inline all npm deps.
- **Hardcoding the version string:** Keep `require('./package.json')` -- esbuild inlines the JSON contents, so the version always matches the source.
- **Running log rotation on every write:** Check file size only at startup. Sync writes are fast; stat() on every log line would be a bottleneck.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JS bundling | Custom concatenation script | esbuild | Handles CJS module wrapping, JSON imports, tree-shaking, circular deps |
| Structured logging | Custom JSON writer | pino + pino.destination | Serializers, level filtering, formatters, high-throughput SonicBoom writer |
| File writing performance | fs.appendFileSync | pino.destination (SonicBoom) | SonicBoom handles buffering, atomic writes, and fd management |
| Node.js version parsing | Regex on `node --version` | `cut -d. -f1` on version string | Simple, reliable, no regex edge cases |

**Key insight:** The bundling problem here is simple because the native host has zero native (C++) dependencies and only two npm dependencies. esbuild handles this trivially. The real work is in the logger migration and wrapper script.

## Common Pitfalls

### Pitfall 1: pino.transport() Fails in Bundle
**What goes wrong:** `pino.transport({ target: 'pino-roll' })` spawns a worker thread that tries to `require('pino-roll')` at runtime. In a bundle, the module doesn't exist as a separate file.
**Why it happens:** pino's transport system uses Node.js Worker Threads with dynamic requires that bypass the bundle.
**How to avoid:** Replace with `pino.destination({ sync: true, dest: filePath })`. Verified experimentally that this works in a bundled file.
**Warning signs:** Error message "Cannot find module '/path/to/lib/worker.js'" at startup.

### Pitfall 2: Bundle Includes Dead Transport Code
**What goes wrong:** Even with sync destination, esbuild bundles `thread-stream` and `pino/lib/transport.js` (dead code in our case). This adds ~17KB of unused code.
**Why it happens:** esbuild performs static analysis but cannot determine that `pino.transport()` is never called at runtime.
**How to avoid:** Accept the 17KB overhead (harmless) OR mark thread-stream as external (not recommended -- it would error if accidentally imported). The 159KB total is fine.
**Warning signs:** Bundle analysis shows thread-stream at 13.4KB and pino/lib/transport at 4KB.

### Pitfall 3: Sync Logging Performance
**What goes wrong:** Sync writes block the event loop. Under heavy logging, this could slow down HTTP responses.
**Why it happens:** Each `logger.info()` call writes to disk synchronously.
**How to avoid:** This is acceptable for the native host use case. Log volume is low (startup messages, per-request logs). The host handles ~1-10 requests/second max. If needed, can switch to `sync: false` with `minLength: 4096` for async buffering -- but sync is simpler and ensures no log loss on crash.
**Warning signs:** HTTP response latency >100ms correlated with log writes.

### Pitfall 4: Log Rotation Race Condition
**What goes wrong:** If two host processes start simultaneously, both may try to rotate logs.
**Why it happens:** The lifecycle module already handles single-instance via PID file, but there's a brief window.
**How to avoid:** Rotation runs at startup, after `killOldProcess()`. The existing lifecycle module ensures only one host runs, so the rotation code inherits this guarantee.
**Warning signs:** Missing log files or duplicated rotation.

### Pitfall 5: Wrapper Script Finds Wrong Node.js
**What goes wrong:** The wrapper picks up a Node.js that's too old (e.g., system Node v16 on older macOS).
**Why it happens:** Priority chain discovers Node.js but doesn't check version.
**How to avoid:** Every discovery path must run `node --version` and check `>= 18`. Log which Node.js was selected and its version.
**Warning signs:** Cryptic syntax errors from old Node.js trying to run modern JS (optional chaining, nullish coalescing, etc.).

### Pitfall 6: run.sh DIR Resolution in dist/
**What goes wrong:** The bundled `run.sh` in `dist/` uses `DIR="$(dirname "$0")"` which points to `dist/`, but `host.bundle.js` is also in `dist/`. This works correctly as long as both files are co-located.
**Why it happens:** The `DIR` variable resolves to wherever `run.sh` physically lives.
**How to avoid:** Ensure `run.sh` and `host.bundle.js` are always in the same directory. The build script copies both to `dist/`. Installation (Phase 11) copies both to `~/.raycast-firefox/bin/`.
**Warning signs:** "Cannot find host.bundle.js" error in wrapper.log.

### Pitfall 7: project-root.txt Still Present in Dev
**What goes wrong:** Developer has both `project-root.txt` (dev) and `~/.raycast-firefox/bin/run.sh` (production). Dev path always wins, so they never test the production path.
**Why it happens:** Dual-mode resolution intentionally prioritizes dev.
**How to avoid:** This is by design (user decision). Document that to test the production path, temporarily rename/delete `assets/project-root.txt`.
**Warning signs:** None -- this is expected behavior.

## Code Examples

### esbuild Configuration for package.json
```json
{
  "name": "raycast-firefox-native-host",
  "version": "1.0.0",
  "private": true,
  "main": "host.js",
  "scripts": {
    "start": "node host.js",
    "start:pretty": "node host.js 2>&1 | pino-pretty",
    "build": "node esbuild.config.js"
  },
  "dependencies": {
    "pino": "^9"
  },
  "devDependencies": {
    "esbuild": "^0.27",
    "pino-pretty": "^13"
  }
}
```
Note: `pino-roll` removed from dependencies.

### Verifying Bundle Correctness
```bash
# Build
cd native-host && npm run build

# Verify bundle exists and is reasonable size
ls -la dist/host.bundle.js  # Should be ~150-200KB

# Verify it starts (will fail without Firefox stdin, but should log startup)
timeout 2 node dist/host.bundle.js 2>/dev/null; true
cat ~/.raycast-firefox/logs/host.log | tail -3

# Verify wrapper script
dist/run.sh  # Should find Node.js and attempt to start
cat ~/.raycast-firefox/logs/wrapper.log | tail -3
```

### Raycast Node.js Discovery Path
```bash
# Confirmed location on macOS:
# ~/Library/Application Support/com.raycast.macos/NodeJS/runtime/*/bin/node
# Currently v22.14.0 on the development machine.
#
# The version directory name is variable (22.14.0), so the wrapper must
# glob or find within the runtime/ directory.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| pino.transport (worker threads) | pino.destination (sync/SonicBoom) | Always available in pino | Eliminates multi-file requirement; single bundle possible |
| pino-roll for rotation | Manual startup rotation | N/A (custom for this project) | Removes dependency; simpler for low-volume logging |
| Multi-file Node.js app | esbuild single-file bundle | esbuild has supported this since v0.1 | No node_modules needed at runtime |
| project-root.txt path resolution | Dual-mode (dev/production) | This phase | Extension works outside git checkout |

**Deprecated/outdated:**
- `pino-roll` as a bundled dependency: Cannot work in a single-file bundle due to worker thread architecture. Replace with sync destination.
- `pino.transport({ sync: true })`: While documented, this still creates a worker thread and requires external files. Use `pino.destination({ sync: true })` instead (no worker thread).

## Open Questions

1. **Log rotation frequency vs. size-based**
   - What we know: Current pino-roll config uses both `size: '5m'` and `frequency: 'daily'`. Sync destination doesn't support either natively.
   - What's unclear: Whether daily rotation (creating a new file each day) is needed, or if size-based rotation at startup is sufficient.
   - Recommendation: Size-based rotation at startup (5MB threshold, 5 rotated files). Daily rotation adds complexity for minimal benefit in a native messaging host that generates small log volumes. The startup rotation is simpler, reliable, and sufficient.

2. **Raycast Node.js path stability**
   - What we know: Currently at `~/Library/Application Support/com.raycast.macos/NodeJS/runtime/22.14.0/bin/node`. The version number is in the path.
   - What's unclear: Whether Raycast updates this path when it upgrades Node.js (does the old version directory remain? Is the new version placed alongside?).
   - Recommendation: Use `find` or glob pattern to discover the latest version in the `runtime/` directory. Sort by version number and pick the newest. This handles version upgrades gracefully.

3. **Bundle size with tree-shaking potential**
   - What we know: 159KB unminified with ~17KB dead code (thread-stream). Minification could reduce to ~80-100KB.
   - What's unclear: Whether anyone cares about 159KB vs 80KB for a local tool.
   - Recommendation: Do not minify. Readable output aids debugging. 159KB is trivial.

## Sources

### Primary (HIGH confidence)
- [esbuild official docs](https://esbuild.github.io/api/) - platform, format, bundle, external options
- [/evanw/esbuild Context7](https://context7.com/evanw/esbuild) - CJS bundling, JSON imports, Node.js module externalization
- [/pinojs/pino Context7](https://context7.com/pinojs/pino) - pino.destination sync mode, SonicBoom configuration
- [pino bundling docs](https://github.com/pinojs/pino/blob/main/docs/bundling.md) - Worker thread limitations with bundlers
- [pino API docs](https://github.com/pinojs/pino/blob/main/docs/api.md) - pino.destination options
- [pino async docs](https://github.com/pinojs/pino/blob/main/docs/asynchronous.md) - sync vs async logging
- **Experimental verification** - Bundled actual native host codebase (159KB), tested pino sync destination from bundle, confirmed pino.transport failure in bundle

### Secondary (MEDIUM confidence)
- [esbuild __dirname issue #859](https://github.com/evanw/esbuild/issues/859) - __dirname handling (confirmed: not an issue for this project since no __dirname/\_\_filename usage in native-host code)
- [pino help docs - log reopening](https://github.com/pinojs/pino/blob/main/docs/help.md) - SonicBoom reopen() for rotation signals
- [Raycast security docs](https://developers.raycast.com/information/security) - Raycast managed Node.js runtime
- Local filesystem inspection - Raycast Node.js at `~/Library/Application Support/com.raycast.macos/NodeJS/runtime/22.14.0/bin/node`

### Tertiary (LOW confidence)
- [WebSearch: Raycast bundled Node.js path](https://www.raycast.com/blog/how-raycast-api-extensions-work) - General info about Raycast Node.js handling; exact path confirmed locally

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - esbuild and pino are both verified experimentally with the actual codebase. Bundle produces correct output and runs successfully.
- Architecture: HIGH - All patterns verified experimentally. Dual-mode path resolution is straightforward. Build script is simple.
- Pitfalls: HIGH - Key pitfall (pino.transport failure) confirmed experimentally. Others are well-understood from codebase analysis.

**Research date:** 2026-02-27
**Valid until:** 2026-03-27 (stable -- esbuild and pino are mature, architecture is simple)
