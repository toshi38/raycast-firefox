---
phase: 12-raycast-install-flow
verified: 2026-03-14T11:22:27Z
status: passed
score: 13/13 must-haves verified
re_verification: false
---

# Phase 12: Raycast Install Flow — Verification Report

**Phase Goal:** Any Raycast user can install the native host through the setup command without touching a terminal
**Verified:** 2026-03-14T11:22:27Z
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1  | Running the setup command downloads native host files from GitHub Releases | VERIFIED | `installer.ts` fetches `https://api.github.com/repos/toshi38/raycast-firefox/releases`, finds first `native-host@` tagged release, downloads `host.bundle.js`, `run.sh`, `SHA256SUMS.txt` in parallel |
| 2  | Downloaded files are SHA256-verified against SHA256SUMS.txt before installation | VERIFIED | `parseSha256Sums()` + `verifyChecksum()` called for `host.bundle.js` and `run.sh` before any file is written to disk (lines 272-274) |
| 3  | Files are installed atomically to `~/.raycast-firefox/bin/` (temp dir first, then move) | VERIFIED | `atomicInstall()` writes to `mkdtempSync` in `environment.supportPath`, then `renameSync` (with `copyFileSync` fallback) to `INSTALL_DIR` |
| 4  | `version.txt` is written last as install-complete marker | VERIFIED | `writeFileSync(join(INSTALL_DIR, "version.txt"), version, "utf-8")` is the final statement in `atomicInstall()` after all files are moved |
| 5  | Node.js symlink is created at `~/.raycast-firefox/node` pointing to `process.execPath` | VERIFIED | `createNodeSymlink()` removes any existing symlink then calls `symlinkSync(process.execPath, SYMLINK_PATH)` |
| 6  | Post-install verification distinguishes full chain success from partial states | VERIFIED | Four-branch logic on `chain.reachable` + `chain.tabsOk` + `isFirefoxRunning()`: full success (HUD), extension not connected (AMO link), needs restart, Firefox not running (AMO link) |
| 7  | Re-running setup overwrites all files cleanly (no skip logic) | VERIFIED | No version comparison or skip logic found in `installer.ts`; always downloads and overwrites |
| 8  | Toast shows step-by-step progress during installation | VERIFIED | `Toast.Style.Animated` shown on start; `onProgress` callback updates `toast.message` with "Downloading native host...", "Verifying checksum...", "Installing files..." |
| 9  | `run.sh` checks `~/.raycast-firefox/node` symlink as Priority 0 before all other Node.js discovery methods | VERIFIED | Priority 0 block at line 64-67 of `native-host/run.sh`, before Priority 1 (Raycast bundled) |
| 10 | The symlink check uses the existing `try_node` function with full version validation | VERIFIED | `try_node "$HOME/.raycast-firefox/node" "Raycast symlink"` reuses existing function with `check_node_version` validation |
| 11 | The change is backward-compatible — if symlink does not exist, all existing priorities work as before | VERIFIED | Priority 0 block guarded by `[ -x "$HOME/.raycast-firefox/node" ]`; no effect if symlink absent |
| 12 | Both source `run.sh` and `dist/run.sh` include the new priority | VERIFIED | `diff native-host/run.sh native-host/dist/run.sh` returns no differences — files are identical |
| 13 | A native-host changeset is created for the patch bump | VERIFIED | `.changeset/add-node-symlink-priority.md` targets `"raycast-firefox-native-host": patch` |

**Score:** 13/13 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `raycast-extension/src/lib/installer.ts` | Download, verify, install, symlink logic; min 80 lines; exports `installNativeHost` | VERIFIED | 309 lines; exports `installNativeHost` and `InstallResult`; full pipeline implemented |
| `raycast-extension/src/setup-bridge.tsx` | Updated setup command with installer integration and toast UX; min 50 lines | VERIFIED | 141 lines; integrates installer, animated toast, four-state post-install guidance |
| `native-host/run.sh` | Shell wrapper with Priority 0 symlink check; contains `raycast-firefox/node` | VERIFIED | Priority 0 block present at line 64; contains `$HOME/.raycast-firefox/node`; shell syntax valid |
| `native-host/dist/run.sh` | Distributed shell wrapper matching source | VERIFIED | Exists; identical to source `run.sh` |
| `.changeset/add-node-symlink-priority.md` | Patch changeset for native-host | VERIFIED | Exists; targets `raycast-firefox-native-host: patch` |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `setup-bridge.tsx` | `lib/installer.ts` | `import { installNativeHost }` | VERIFIED | Line 9: `import { installNativeHost } from "./lib/installer"` — called at line 44 |
| `installer.ts` | GitHub Releases API | `fetch()` to `/releases` endpoint | VERIFIED | `GITHUB_API = "https://api.github.com/repos/toshi38/raycast-firefox/releases"` — fetched at line 50 |
| `setup-bridge.tsx` | `lib/setup.ts` | `import { verifyChain, generateManifest, writeManifest }` | VERIFIED | Lines 12-18 import all three; all called in command flow (lines 77-78, 99) |
| `setup-bridge.tsx` | `lib/errors.ts` | `import { isFirefoxRunning }` | VERIFIED | Line 10; called at line 116 in post-install branching |
| `native-host/run.sh` | `~/.raycast-firefox/node` | Priority 0 symlink check | VERIFIED | Lines 64-67: checks `-x "$HOME/.raycast-firefox/node"` then calls `try_node` |
| `installer.ts` | `native-host/dist/run.sh` | Downloaded `run.sh` includes symlink priority | VERIFIED | `dist/run.sh` is identical to `run.sh` which contains Priority 0; installer downloads this file from GitHub Release |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| INST-01 | 12-01 | User can install native host from Raycast setup command without cloning the repo | SATISFIED | Full download-verify-install pipeline in `installer.ts`; no git or terminal needed |
| INST-02 | 12-01 | Setup command downloads native host bundle from GitHub Releases | SATISFIED | `getLatestNativeHostRelease()` fetches GitHub Releases API; assets downloaded via `downloadAsset()` |
| INST-03 | 12-01 | Setup command verifies SHA256 hash of downloaded bundle | SATISFIED | `parseSha256Sums()` + `verifyChecksum()` for both `host.bundle.js` and `run.sh` |
| INST-04 | 12-01 | Setup command extracts bundle to `~/.raycast-firefox/bin/` | SATISFIED | `atomicInstall()` writes to `INSTALL_DIR = join(homedir(), ".raycast-firefox", "bin")` |
| INST-05 | 12-01 | Setup command registers native messaging manifest pointing to installed bundle | SATISFIED | `generateManifest()` + `writeManifest()` called after install; `resolveNativeHostPath()` finds the newly installed `run.sh` |
| INST-06 | 12-01, 12-02 | Setup command creates Node.js symlink for reliable wrapper script execution | SATISFIED | `createNodeSymlink()` in `installer.ts`; Priority 0 in `run.sh` consumes it |
| INST-07 | 12-01 | Setup command verifies full chain after installation | SATISFIED | `verifyChain(port)` called at line 99; four-branch outcome handling |
| INST-08 | 12-01 | Installed bundle tracks version via `version.txt` | SATISFIED | `writeFileSync(join(INSTALL_DIR, "version.txt"), version, "utf-8")` written last in `atomicInstall()` |

All 8 INST requirements (INST-01 through INST-08) are satisfied. No orphaned requirements.

Note: INST-09 (`project-root.txt` elimination) is mapped to Phase 9 in REQUIREMENTS.md and is correctly absent from Phase 12 plans.

---

### Anti-Patterns Found

None. No TODO/FIXME/placeholder comments, empty returns, or stub implementations found in any modified file.

---

### Human Verification Required

#### 1. End-to-end install on a clean machine

**Test:** On a machine without `~/.raycast-firefox/` existing, run "Setup Firefox Bridge" from Raycast.
**Expected:** Animated toast appears, progresses through "Downloading native host...", "Verifying checksum...", "Installing files...", then chain verification completes with appropriate guidance toast.
**Why human:** Cannot simulate GitHub Release download, filesystem writes to `~`, or Raycast toast rendering in static analysis.

#### 2. "Try Again" action on network failure

**Test:** Disconnect from internet, run "Setup Firefox Bridge", observe failure toast, click "Try Again".
**Expected:** Command re-launches and attempts installation again.
**Why human:** Real network failure and Raycast action button invocation cannot be triggered programmatically.

#### 3. Partial success states produce correct guidance

**Test:** Install with Firefox not running; install with Firefox running but extension not installed; install with everything connected.
**Expected:** Correct toast message and AMO link action (or HUD) for each state.
**Why human:** Requires controlling Firefox process state and extension connectivity at test time.

---

### Summary

Phase 12 goal is fully achieved. The implementation is complete, substantive, and correctly wired:

- `installer.ts` (309 lines) implements the complete download-verify-install pipeline: GitHub Releases API with native-host tag filtering, parallel asset downloads, SHA256 verification, atomic installation via temp dir, version.txt sentinel, and Node.js symlink creation.
- `setup-bridge.tsx` (141 lines) integrates the installer into the setup command with animated toast progress, four-state post-install guidance, and "Try Again" error recovery.
- `native-host/run.sh` has Priority 0 symlink check before all existing Node.js discovery methods; `dist/run.sh` is identical.
- Changeset `.changeset/add-node-symlink-priority.md` is present and correctly targets a patch bump for `raycast-firefox-native-host`.
- TypeScript compilation passes with no errors.
- Shell syntax validation passes with no errors.
- All 8 required INST requirements are satisfied with implementation evidence.

---

_Verified: 2026-03-14T11:22:27Z_
_Verifier: Claude (gsd-verifier)_
