# Phase 8: Setup Automation — Research

## Objective
Implement a "Setup Firefox Bridge" Raycast command that writes the native messaging host manifest to Firefox's expected location, replacing the manual `install.sh` workflow.

## Requirement Coverage
- **COMM-04**: Automated setup command to register native messaging host manifest with Firefox

## Current State Analysis

### Existing Manual Setup (install.sh)
The current `native-host/install.sh` does:
1. Resolves the script's own directory to get the absolute path to `run.sh`
2. Creates `~/Library/Application Support/Mozilla/NativeMessagingHosts/` if needed
3. Writes `raycast_firefox.json` manifest with:
   - `name`: "raycast_firefox"
   - `description`: "Raycast Firefox tab management bridge"
   - `path`: absolute path to `run.sh`
   - `type`: "stdio"
   - `allowed_extensions`: ["raycast-firefox@lau.engineering"]

### Key Paths
- **Native host directory**: `native-host/` (relative to project root)
- **run.sh**: `native-host/run.sh` — wrapper that finds `node` and launches `host.js`
- **Manifest target**: `~/Library/Application Support/Mozilla/NativeMessagingHosts/raycast_firefox.json`
- **Extension ID**: `raycast-firefox@lau.engineering` (from `extension/manifest.json`)
- **Port file**: `~/.raycast-firefox/port` — written by host on startup, removed on disconnect

### Raycast Extension Structure
- Package: `raycast-extension/package.json` — name "firefox-tabs"
- Single command: `search-tabs` (view mode)
- Source: `raycast-extension/src/search-tabs.tsx`
- Error lib: `raycast-extension/src/lib/errors.ts`
- Dependencies: `@raycast/api`, `@raycast/utils`

### Existing Error Handling Integration
The `search-tabs.tsx` already has a placeholder action for `HostNotRunning`:
```tsx
{classifiedError.mode === FailureMode.HostNotRunning && (
  <Action
    title="Set Up Native Host"
    icon={Icon.Terminal}
    onAction={async () => {
      await showToast({
        style: Toast.Style.Failure,
        title: "Setup Not Available Yet",
        message: "Install the companion extension in Firefox and register the native host manually",
      });
    }}
  />
)}
```
This should be updated to launch the actual setup command once it exists.

## Implementation Design

### Plan 1: Manifest Template & Path Resolution
**What**: Create the setup utility module that resolves paths and generates the manifest JSON.

**Key decisions:**
- The Raycast extension runs from `raycast-extension/` directory
- The native host lives in `native-host/` (sibling directory)
- Path to `run.sh` must be resolved at setup time using the extension's installed location
- Raycast extensions are installed to `~/Library/Application Support/com.raycast.macos/extensions/...`
- Need to resolve from extension install path → project root → `native-host/run.sh`

**Path resolution strategy:**
- Use `__dirname` (or `import.meta.url`) at runtime to find where the Raycast extension is running from
- Walk up from `raycast-extension/src/` or compiled output directory to project root
- Then resolve `native-host/run.sh` from there
- **IMPORTANT**: Raycast extensions are TypeScript compiled — the actual runtime path is from the compiled output, not source. Need to verify the runtime `__dirname` in a Raycast extension context.
- Alternative: Use `environment.assetsPath` from `@raycast/api` to locate the extension root, then navigate to sibling `native-host/`

**Manifest content** (deterministic, always safe to overwrite):
```json
{
  "name": "raycast_firefox",
  "description": "Raycast Firefox tab management bridge",
  "path": "<absolute-path-to-native-host/run.sh>",
  "type": "stdio",
  "allowed_extensions": ["raycast-firefox@lau.engineering"]
}
```

### Plan 2: Raycast Setup Command
**What**: The "Setup Firefox Bridge" command — a `no-view` mode command.

**Command registration** in `package.json`:
```json
{
  "name": "setup-bridge",
  "title": "Setup Firefox Bridge",
  "description": "Register the native messaging host with Firefox",
  "mode": "no-view"
}
```

**Flow:**
1. Pre-flight: Check Firefox.app exists (`/Applications/Firefox.app` or via `mdfind`)
2. Resolve absolute path to `native-host/run.sh`
3. Verify `run.sh` exists and is executable
4. Create `~/Library/Application Support/Mozilla/NativeMessagingHosts/` directory
5. Write `raycast_firefox.json` manifest
6. Success toast: "Firefox integration ready!"

**Error handling:**
- Firefox not found → "Firefox not detected. Install Firefox first."
- run.sh not found → "Native host files missing. Reinstall the extension."
- Permission error writing manifest → "Couldn't write manifest. Check permissions on ~/Library/Application Support/Mozilla/"

### Plan 3: Post-Setup Validation
**What**: Verify the full communication chain after manifest is written.

**Validation steps:**
1. Verify manifest file exists and contains valid JSON
2. Verify manifest `path` points to existing, executable `run.sh`
3. If Firefox is running: attempt chain verification (hit the HTTP bridge)
4. If Firefox not running: "Manifest installed. Start Firefox with the companion extension to complete setup."

**Integration with existing error handling:**
- Update the `HostNotRunning` action in `search-tabs.tsx` to use `launchCommand` to invoke the setup command
- The `launchCommand` API from `@raycast/api` can launch another command in the same extension

## Technical Considerations

### Path Resolution Challenge
The biggest technical challenge is reliably resolving the path from the Raycast extension's runtime location to `native-host/run.sh`. Options:

1. **Relative from extension root**: Use `environment.assetsPath` or `__dirname` and navigate up to the project root. This requires knowing the directory structure at build time.

2. **Store path during dev/install**: The extension knows where it's installed. Can compute and store the native-host path.

3. **Hardcoded project structure**: Since this is a personal extension (not distributed via Raycast Store), the directory layout is known: `raycast-extension/` and `native-host/` are siblings under the project root.

**Recommended approach**: Use `__dirname` at runtime, walk up to find the project root (look for `native-host/run.sh` as a marker), then resolve the absolute path. This works both in dev (`ray develop`) and after build.

### Firefox.app Detection
- Simple: `existsSync("/Applications/Firefox.app")`
- Handles edge cases: also check `/Applications/Firefox Developer Edition.app` or use `mdfind "kMDItemCFBundleIdentifier == 'org.mozilla.firefox'"` for any install location
- Per context decision: simple path check is fine for macOS-only

### Raycast `no-view` Commands
- Return nothing from the default export (or return `null`)
- Use `showToast` and `showHUD` for feedback
- Command runs and exits — no persistent UI
- Can use `async` default export for async operations

## Dependencies
- Phase 2 (Native Messaging Bridge) — complete ✓
- No other phase dependencies

## Risk Assessment
- **Low risk**: Manifest is deterministic and idempotent (overwrite is safe)
- **Medium risk**: Path resolution across dev/installed modes needs testing
- **Low risk**: All macOS-only, no cross-platform concerns

---
*Research completed: 2026-02-22*
