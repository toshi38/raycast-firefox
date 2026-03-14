# Phase 12: Raycast Install Flow - Context

**Gathered:** 2026-03-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Setup command downloads, verifies, and installs the native host from GitHub Releases — no terminal needed. User runs the Raycast setup command and the native host is downloaded, hash-verified, extracted to `~/.raycast-firefox/bin/`, and registered as a native messaging host. Also updates `run.sh` with a Node.js symlink priority and ships a native-host patch release.

</domain>

<decisions>
## Implementation Decisions

### Setup UX flow
- Keep `no-view` command mode with animated toast progress updates
- Toast steps: "Downloading native host..." → "Verifying checksum..." → "Installing files..." → success/failure
- Error toasts show specific failure reason (checksum mismatch, rate limit, network error) with a "Try Again" primary action button that re-runs setup
- Success: HUD ("Firefox integration ready!") if full chain verifies; toast with guidance if partial (Firefox not running or extension not connected)
- Pre-flight: check Firefox installed before downloading (no point downloading if Firefox isn't there)

### Post-install guidance
- Use existing `verifyChain()` to detect whether Firefox extension is working
- If chain fully verifies (reachable + tabsOk): showHUD, close Raycast — no AMO link needed
- If chain partial (host installed, Firefox not running): success toast + "Install Firefox Extension" action → opens AMO listing
- If chain partial (host installed, extension not connected): success toast with different message + "Install Firefox Extension" action → opens AMO listing
- AMO URL: `https://addons.mozilla.org/en-US/firefox/addon/raycast-tab-manager-for-firefox/`
- Distinguish "Firefox not running" vs "extension not connected" in toast messaging (matches existing error classification pattern)

### Update behavior
- Always re-download and overwrite — no version comparison, no skip logic
- Download is ~167KB, always fetch latest release, verify, and overwrite
- Same toast messaging for first-time install and reinstall ("Installing Firefox Bridge" → "Firefox Bridge Installed")
- version.txt written for informational/debugging purposes, not used for skip logic
- Atomic install: download all files to `environment.supportPath` temp dir, verify ALL checksums, then move to `~/.raycast-firefox/bin/`. version.txt written last as "install complete" marker. Temp files cleaned up on verification failure.

### run.sh changes
- Add `~/.raycast-firefox/node` symlink check as Priority 0 (before existing Raycast `find` command)
- Use existing `try_node` function — full version check (executability + >=18), consistent with all other priorities
- Change is part of Phase 12 (same phase that creates the symlink)
- Requires a native-host changeset: patch bump (1.1.0 → 1.1.1), backward-compatible additive change

### Node.js symlink
- Always create symlink regardless of dev/production mode
- Points to `process.execPath` (Raycast's bundled Node.js in production, system Node in dev)
- run.sh has fallback priorities if symlink is stale — no special dev-mode handling needed
- Re-create symlink on every setup run (Raycast may update its Node.js)

### Claude's Discretion
- `lib/installer.ts` internal structure and function signatures
- Exact error message wording (following the patterns shown in discussion)
- Temp directory cleanup details
- GitHub API request headers and timeout values
- How to handle the move from temp dir to install dir (rename vs copy+delete)

</decisions>

<specifics>
## Specific Ideas

- Toast flow matches the preview mockups discussed: animated "Installing Firefox Bridge" with step-by-step message updates
- Error toasts include "Try Again" action button for all download/verification failures
- AMO link action button only appears when chain verification is partial — not when everything works

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `setup-bridge.tsx`: Current no-view setup command — orchestrates pre-flight, manifest write, chain verify. Will be extended with installer step before manifest write.
- `lib/setup.ts`: `resolveNativeHostPath()`, `generateManifest()`, `writeManifest()`, `validateManifest()`, `verifyChain()`, `getPort()` — all reusable as-is
- `lib/errors.ts`: Error classification pattern, `fetchWithRetry()`, `showActionError()` — pattern reference for installer error handling
- `native-host/dist/run.sh`: Current 5-priority Node.js discovery chain — needs Priority 0 symlink added

### Established Patterns
- No-view command with animated toast: already used in `setup-bridge.tsx`
- Dual-mode path resolution: dev path (project-root.txt) vs production path (~/.raycast-firefox/bin/run.sh)
- Chain verification: /health + /tabs endpoints for detecting full connectivity
- Error classification with user-friendly messages and action buttons

### Integration Points
- `setup-bridge.tsx`: Add installer call between Firefox check and manifest write
- `lib/setup.ts`: `resolveNativeHostPath()` already handles the production path — installer populates it
- `native-host/run.sh` + `native-host/dist/run.sh`: Add symlink priority, rebuild bundle
- GitHub Releases API: `api.github.com/repos/toshi38/raycast-firefox/releases/latest`
- Release assets: `host.bundle.js`, `run.sh`, `SHA256SUMS.txt` (generic names, from Phase 10)

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 12-raycast-install-flow*
*Context gathered: 2026-03-14*
