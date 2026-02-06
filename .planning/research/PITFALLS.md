# Pitfalls: Raycast Firefox Extension

Common mistakes, gotchas, and failure modes specific to building a Raycast extension that communicates with Firefox on macOS. Each pitfall includes warning signs, prevention strategies, and the project phase where it should be addressed.

---

## 1. Firefox Communication Architecture

### 1.1 Choosing the Wrong Communication Method

**The Pitfall**: Picking a Firefox communication approach based on what seems simplest rather than what actually works for the tab-switching use case. The three main options (native messaging, direct SQLite reads, AppleScript/accessibility) each have fundamental constraints that can invalidate an approach late in development.

**Warning Signs**:
- Starting implementation without a spike/prototype for the chosen method
- Assuming Firefox exposes tab data the same way Chrome/Safari do
- Not testing with a realistic number of tabs (100+)

**Prevention Strategy**:
- Build a minimal proof-of-concept for each viable communication method before committing (Phase: Research/Spike)
- Key constraints to validate per method:
  - **Native messaging**: Requires a companion WebExtension installed in Firefox + a native messaging host manifest + a host process. The WebExtension can enumerate tabs via `browser.tabs.query()`, but native messaging only works when the extension's background script is running. Firefox Manifest V3 uses non-persistent background pages (Event Pages) that may be suspended.
  - **Direct SQLite (`places.sqlite`)**: Contains history and bookmarks but **not** open tabs. Open tabs are in `sessionstore-backups/recovery.jsonlz4` -- a Mozilla-proprietary LZ4 format with a custom header (mozLz4). This file is only written periodically (every ~15 seconds), so data is stale.
  - **`recovery.jsonlz4` parsing**: Gives open tab data without a companion extension, but tab switching is impossible from this data alone -- you still need a way to activate a specific tab in Firefox.
  - **AppleScript**: Firefox has essentially no AppleScript support. You cannot enumerate tabs or switch tabs via AppleScript. You can only do basic window-level operations (`activate`).
  - **Accessibility API (AX)**: Technically possible to navigate Firefox's UI tree, but extremely fragile, breaks across Firefox updates, and slow.

- The likely winning architecture is: **companion WebExtension + native messaging** for both reading tabs and switching to them. Validate this first.

**Phase**: Research/Spike (before any real implementation)

---

### 1.2 Native Messaging Host Registration Failures

**The Pitfall**: The native messaging host manifest must be placed in a very specific location and have exact JSON structure, or Firefox silently ignores it. There are no helpful error messages.

**Warning Signs**:
- Native messaging connection attempts fail with generic errors
- Works on your machine but not others
- `runtime.connectNative()` or `runtime.sendNativeMessage()` returns undefined or throws

**Prevention Strategy**:
- The manifest JSON file must be placed at `~/Library/Application Support/Mozilla/NativeMessagingHosts/<name>.json` on macOS
- The `name` field in the manifest must match the filename (without `.json`)
- The `path` field must be an **absolute path** to the host executable -- no `~`, no `$HOME`, no relative paths
- The `allowed_extensions` array must contain the exact extension ID (for Firefox, this is the `browser_specific_settings.gecko.id` from the WebExtension's `manifest.json`)
- The host executable must have executable permissions (`chmod +x`)
- The host executable's first line must be a valid shebang (e.g., `#!/usr/bin/env node`) if it's a script
- Test with `about:debugging` in Firefox to see if the extension loads and can connect

**Phase**: Implementation (when building the native messaging bridge)

---

### 1.3 Native Messaging Protocol Framing Errors

**The Pitfall**: Native messaging uses a specific binary protocol -- messages are framed with a 4-byte little-endian length prefix followed by JSON. Getting the framing wrong produces silent failures or garbled data.

**Warning Signs**:
- Messages appear to send but nothing is received
- Partial JSON parsing errors on the host side
- Works for short messages but fails for longer ones

**Prevention Strategy**:
- Read stdin as binary, not text-mode with line buffering
- Always read exactly 4 bytes for the length prefix, decode as unsigned 32-bit little-endian integer, then read exactly that many bytes for the JSON payload
- When writing responses, encode JSON to a buffer first, write the 4-byte length prefix, then write the JSON buffer
- Firefox has a **1 MB message size limit** per message -- if you have hundreds of tabs, the serialized tab list can approach this. Paginate or compress if needed
- Use a well-tested native messaging library rather than hand-rolling the protocol (e.g., there are npm packages for this)

**Phase**: Implementation

---

### 1.4 Firefox Manifest V3 Background Script Lifecycle

**The Pitfall**: Firefox's Manifest V3 (MV3) uses Event Pages for background scripts, which can be suspended after 30 seconds of inactivity. If the background script is suspended, native messaging connections are dropped. The Raycast extension may try to query tabs and find no one listening.

**Warning Signs**:
- Tab queries work immediately after Firefox starts or after interacting with the WebExtension, but fail after the extension has been idle
- Intermittent "connection refused" or "no such native application" errors

**Prevention Strategy**:
- Option A: Use Manifest V2 (still supported in Firefox, unlike Chrome). MV2 persistent background scripts stay alive. This is simpler and Firefox has not announced MV2 deprecation.
- Option B: If using MV3, handle the lifecycle: the native messaging host should gracefully handle disconnection and reconnection. The Raycast extension should retry on failure.
- Option C: Use `browser.runtime.sendNativeMessage()` (one-shot messages) instead of `browser.runtime.connectNative()` (long-lived port). One-shot messages wake the background script automatically.
- Test the idle-then-query scenario explicitly

**Phase**: Architecture decision (Research/Spike), implementation detail (Implementation)

---

### 1.5 `recovery.jsonlz4` Custom Compression Format

**The Pitfall**: If attempting to read Firefox session data directly (without a companion extension), `recovery.jsonlz4` uses Mozilla's custom `mozLz4` format, not standard LZ4. Standard LZ4 decompression libraries will fail.

**Warning Signs**:
- LZ4 decompression throws errors or produces garbage
- The file starts with bytes `mozLz40\0` instead of a standard LZ4 frame header

**Prevention Strategy**:
- If using this approach, strip the 8-byte `mozLz40\0` header and 4-byte uncompressed size, then decompress the remainder as an LZ4 block (not frame)
- Use a library that supports LZ4 block decompression (e.g., `lz4js` in npm)
- Remember: this file is written every ~15 seconds, so data may be stale
- The file is locked while Firefox is writing to it -- handle EBUSY/EACCES errors
- This approach gives you tab URLs and titles but **cannot switch tabs** -- you still need a mechanism to activate a tab

**Phase**: Research/Spike (if evaluating this approach), otherwise N/A

---

### 1.6 Firefox Profile Path Discovery

**The Pitfall**: Firefox profile directories have auto-generated names (e.g., `xxxxxxxx.default-release`) that differ per installation. Hardcoding a path will break on any other machine.

**Warning Signs**:
- Extension works on your machine but fails for others
- Path-not-found errors in production

**Prevention Strategy**:
- Parse `~/Library/Application Support/Firefox/profiles.ini` to find the active profile directory
- Handle multiple profiles: look for the profile with `Default=1` or the one marked as `[Install...]` default
- Firefox ESR, Developer Edition, and Nightly use different base directories (`Firefox`, `Firefox Developer Edition`, etc.) -- decide if you need to support these
- Cache the resolved profile path but invalidate if Firefox is reinstalled

**Phase**: Implementation (if reading any Firefox files directly)

---

## 2. Raycast Extension Development

### 2.1 Blocking the Main Thread with Synchronous Operations

**The Pitfall**: Raycast extensions run in a Node.js environment but the UI is React-based and expects responsive rendering. Synchronous I/O (reading files, spawning processes with `execSync`, etc.) blocks the UI and causes Raycast to show a loading state or even kill the extension.

**Warning Signs**:
- Raycast shows "Extension took too long to respond" errors
- UI feels sluggish or list items appear with a noticeable delay
- Extension crashes on larger datasets

**Prevention Strategy**:
- Use `async/await` with non-blocking APIs everywhere: `execFile` (not `execSync`), `fs.promises` (not `fs`), etc.
- Use Raycast's built-in `useFetch` or `useExec` hooks where applicable, or `usePromise` for async operations
- For the native messaging communication, use an async message-response pattern
- Profile with realistic tab counts (test with 200+ tabs)

**Phase**: Implementation (from day one)

---

### 2.2 Not Using Raycast's Built-in List Filtering

**The Pitfall**: Implementing custom fuzzy search when Raycast's `<List>` component already provides built-in fuzzy filtering. Custom filtering is slower, doesn't match user expectations for Raycast-standard behavior, and is unnecessary work.

**Warning Signs**:
- Building a custom fuzzy search algorithm
- Filtering results in your code instead of letting Raycast handle it
- Search behavior feels different from other Raycast extensions

**Prevention Strategy**:
- Use `<List>` with `isLoading` and provide items with `title`, `subtitle`, and `keywords` props. Raycast filters natively on these fields.
- If you need to search on URL (which users expect), put the URL in `keywords` or `subtitle` so Raycast's built-in filter matches it
- Only implement custom filtering if Raycast's built-in filtering is provably insufficient (e.g., you need weighted scoring across title vs. URL)
- If custom filtering IS needed, set `<List filtering={false}>` and use `onSearchTextChange` to do your own filtering, but understand this means you own the entire search experience

**Phase**: Implementation

---

### 2.3 Extension Entry Point and Command Structure Misconfiguration

**The Pitfall**: Raycast's `package.json` has a specific schema for declaring commands. Mismatches between the `commands` array in `package.json` and the actual TypeScript entry points cause the extension to fail to load with unhelpful errors.

**Warning Signs**:
- Extension builds but commands don't appear in Raycast
- "Command not found" errors when trying to run the extension
- TypeScript files exist but aren't wired up

**Prevention Strategy**:
- Each command in `package.json` must have a `name` that matches a file in the `src/` directory (e.g., `"name": "search-tabs"` requires `src/search-tabs.tsx`)
- Use `ray create` to scaffold the initial project structure -- don't copy from another project and modify
- The exported default from each command file must be a React component (for `view` mode) or a function (for `no-view` mode)
- Validate by running `npm run dev` early and often -- Raycast's dev mode gives faster feedback than building and installing

**Phase**: Setup/Scaffolding

---

### 2.4 Ignoring Raycast's `environment` and `preferences` API

**The Pitfall**: Hardcoding configuration values (like the path to the native messaging host, or Firefox profile path) instead of using Raycast's built-in preferences system. This makes the extension impossible to configure for other users.

**Warning Signs**:
- Hardcoded paths in source code
- No preferences declared in `package.json`
- Users would need to modify source to configure the extension

**Prevention Strategy**:
- Declare user-configurable values as `preferences` in `package.json` (e.g., Firefox profile path, Firefox variant)
- Use `getPreferenceValues()` from the Raycast API to read them
- Provide sensible defaults that work for the common case (default Firefox installation)
- For the native messaging host path, consider auto-detecting rather than requiring user configuration

**Phase**: Implementation (design for it early, implement when adding user-facing configuration)

---

### 2.5 Not Handling the "Firefox Not Running" State

**The Pitfall**: The extension assumes Firefox is always running. When it's not, the native messaging host can't connect, tab queries fail, and the user sees cryptic errors.

**Warning Signs**:
- Unhandled promise rejections when Firefox is closed
- Blank list with no explanation
- Extension crashes on launch if Firefox isn't running

**Prevention Strategy**:
- Check if Firefox is running before attempting communication (e.g., `pgrep -x firefox` or checking for the process via `ps`)
- Show a clear, actionable message: "Firefox is not running. Please start Firefox and try again."
- Use Raycast's `<List.EmptyView>` component to display this message with an action to open Firefox
- Handle the case where Firefox starts/stops while the extension is open

**Phase**: Implementation (error handling pass)

---

### 2.6 Memory Leaks from Long-Running Native Messaging Connections

**The Pitfall**: Keeping a persistent native messaging connection open between the Raycast extension and the Firefox companion extension. Raycast may keep the extension process alive in the background, and a persistent connection consumes resources in both the Raycast extension and Firefox.

**Warning Signs**:
- Firefox memory usage grows over time
- Raycast extension process doesn't clean up
- File descriptors leak

**Prevention Strategy**:
- Prefer a request-response pattern over a persistent connection: spawn the native messaging host, send a query, get a response, and exit
- If using a persistent connection, implement proper cleanup in the extension's `onUnmount`/cleanup lifecycle
- Set timeouts on native messaging requests -- if Firefox doesn't respond within 2-3 seconds, fail gracefully
- Test by opening and closing the extension repeatedly

**Phase**: Implementation, testing

---

## 3. Raycast Store Publishing

### 3.1 Store Requires All Dependencies to be Self-Contained

**The Pitfall**: If the extension requires a companion Firefox extension + native messaging host to be installed separately, the Raycast Store review team may reject it or require extremely clear setup instructions. Users will abandon the extension if setup is complex.

**Warning Signs**:
- Multi-step setup instructions
- Dependency on external installation steps that can't be automated
- Reviewers asking "how does the user install the Firefox part?"

**Prevention Strategy**:
- Provide a setup command within the Raycast extension that automates as much as possible (install the native messaging host manifest, provide a direct link to install the Firefox companion extension)
- Use Raycast's `onboarding` or initial-run detection to guide users through setup
- Write the companion Firefox extension to be as minimal as possible -- ideally submit it to addons.mozilla.org (AMO) so users can install with one click
- Document the setup clearly in the extension's README (required for Store submission)
- Consider whether the approach that avoids a companion extension (if viable for the use case) is worth the tradeoff

**Phase**: Pre-publishing (but design for this from the start)

---

### 3.2 Raycast Store Review: Metadata and Screenshot Requirements

**The Pitfall**: Store submissions are rejected for missing or non-compliant metadata, not code issues. The Raycast Store has specific requirements for `package.json` fields, icons, and screenshots.

**Warning Signs**:
- PR to `raycast/extensions` repo is rejected with metadata feedback
- Missing required fields in `package.json`
- Screenshots don't match Raycast's format requirements

**Prevention Strategy**:
- Required `package.json` fields: `title`, `description`, `icon`, `author`, `license`, `commands` with proper `title`, `subtitle`, and `description` for each command
- Icon must be a 512x512 PNG or use a Raycast-provided icon name
- Screenshots should show the extension in action, at standard Raycast dimensions
- Run `ray lint` before submitting -- it catches most metadata issues
- Review existing published extensions in the `raycast/extensions` repo for format examples (look at browser-related ones like the Chrome or Arc extensions)
- The Store submission is a PR to the `raycast/extensions` monorepo -- follow their contribution guidelines exactly

**Phase**: Pre-publishing

---

### 3.3 Store Review: No Native Binaries or Shell Scripts

**The Pitfall**: Raycast Store extensions cannot bundle arbitrary native executables. If the native messaging host is a compiled binary or requires compilation at install time, the Store will reject it.

**Warning Signs**:
- The architecture requires a compiled native messaging host (e.g., a Swift or Rust binary)
- Using node-gyp or native Node modules

**Prevention Strategy**:
- Write the native messaging host as a Node.js script (JavaScript/TypeScript) -- it can be bundled as part of the Raycast extension's assets
- If the host must be installed to a specific path (for native messaging registration), provide a setup command that copies it and registers the manifest
- Avoid native Node modules (`node-gyp`, `.node` files) -- Raycast's build system may not handle them, and they won't work across different macOS architectures (Intel vs. Apple Silicon)
- The Raycast extension itself runs in a sandboxed Node.js environment with access to child_process -- use this to spawn the host script

**Phase**: Architecture decision (Research/Spike)

---

### 3.4 Store Naming Conflicts

**The Pitfall**: The extension name or command names conflict with existing published extensions. The `raycast/extensions` monorepo already has browser-related extensions.

**Warning Signs**:
- PR rejected due to naming conflict
- Discovering an existing Firefox extension too late

**Prevention Strategy**:
- Search the `raycast/extensions` repo for existing Firefox-related extensions before starting
- Choose a distinctive, specific name (e.g., "Firefox Tab Search" rather than "Firefox" or "Browser Tabs")
- Check that command names are specific (e.g., `search-tabs` not `search`)

**Phase**: Planning/Setup

---

## 4. macOS-Specific Gotchas

### 4.1 macOS Sandbox and File Access

**The Pitfall**: Raycast extensions run in a Node.js environment that may have restricted file access. Reading Firefox profile data directly may fail due to macOS privacy protections (TCC/Full Disk Access).

**Warning Signs**:
- `EACCES` errors reading files in `~/Library/Application Support/Firefox/`
- Works in development (`npm run dev`) but fails when installed from the Store
- Permission dialogs that users don't expect

**Prevention Strategy**:
- Test file access in the actual Raycast environment, not just a standalone Node.js script
- If reading Firefox files directly, be aware that macOS may require Full Disk Access for Raycast -- this is a terrible user experience for a tab switcher
- The native messaging approach avoids this entirely: the companion WebExtension has full access to Firefox's tab API, and the native messaging host is spawned by Firefox itself (inheriting Firefox's permissions)
- This is another strong argument for the native messaging architecture

**Phase**: Research/Spike (validate file access early)

---

### 4.2 Activating Firefox Windows: Focus and Tab Switching

**The Pitfall**: Even after identifying the target tab via native messaging, actually switching to it requires the companion WebExtension to call `browser.tabs.update(tabId, {active: true})` AND `browser.windows.update(windowId, {focused: true})`. The Raycast extension also needs to bring Firefox to the foreground at the OS level.

**Warning Signs**:
- Tab switches in Firefox but the window doesn't come to the front
- Firefox comes to the front but the wrong tab is active
- Works in single-window Firefox but breaks with multiple windows

**Prevention Strategy**:
- The full tab-switch sequence is:
  1. Raycast extension sends "switch to tab X" message to native messaging host
  2. Native messaging host relays to the companion WebExtension
  3. Companion extension calls `browser.tabs.update(tabId, {active: true})` and `browser.windows.update(windowId, {focused: true})`
  4. Raycast extension runs `open -a Firefox` or uses Raycast's `popToRoot()` + AppleScript `tell application "Firefox" to activate` to bring Firefox to the foreground
- Test with multiple Firefox windows -- `windows.update({focused: true})` is necessary, not just `tabs.update`
- Handle the race condition: the OS focus switch and the tab switch in Firefox happen asynchronously. The user should see the correct tab when Firefox comes to the front.

**Phase**: Implementation (core feature)

---

### 4.3 Process Spawning and PATH Issues

**The Pitfall**: When the Raycast extension spawns the native messaging host process, the `PATH` environment variable may not include expected locations (e.g., Homebrew's `/opt/homebrew/bin` for Apple Silicon Macs, or `/usr/local/bin` for Intel Macs). If the host is a Node.js script, `node` might not be found.

**Warning Signs**:
- "Command not found" errors when spawning the host
- Works in terminal but not from Raycast
- Works on Intel Macs but not Apple Silicon (or vice versa)

**Prevention Strategy**:
- Use absolute paths when spawning processes from the Raycast extension
- In the native messaging host manifest, use an absolute path to the host script AND an absolute shebang (e.g., `#!/usr/local/bin/node` or detect the Node.js path at setup time)
- Alternatively, use Raycast's built-in `environment.assetsPath` to locate bundled scripts and `process.execPath` to find the Node.js binary
- Test on both Intel and Apple Silicon Macs if publishing to the Store

**Phase**: Implementation, testing

---

## 5. Development Workflow Pitfalls

### 5.1 Not Using `npm run dev` During Development

**The Pitfall**: Building and installing the extension manually instead of using Raycast's dev mode. This makes the feedback loop painfully slow.

**Warning Signs**:
- Running `npm run build` and manually loading the extension
- Not seeing live changes

**Prevention Strategy**:
- Use `npm run dev` from the extension directory -- this enables hot-reloading in Raycast
- Keep the Raycast window open alongside your editor
- Use `console.log` and check Raycast's developer console (Command+Option+J in dev mode) for debugging

**Phase**: Setup (from the first day)

---

### 5.2 Testing Only the Happy Path

**The Pitfall**: Only testing with Firefox running, a few tabs open, and a stable connection. Real-world usage includes edge cases that will cause crashes.

**Warning Signs**:
- No error handling for communication failures
- Never tested with Firefox closed, restarting, or with the companion extension disabled
- Never tested with extreme tab counts or tabs with unusual characters in titles/URLs

**Prevention Strategy**:
- Test matrix should include:
  - Firefox not running
  - Firefox running with 0 tabs (new profile)
  - Firefox running with 500+ tabs
  - Tab titles/URLs with Unicode, emoji, extremely long strings
  - Companion WebExtension disabled or not installed
  - Native messaging host not registered
  - Firefox updated to a new version (does the companion extension still work?)
  - Multiple Firefox windows, including private browsing windows (companion extension may not have access to private tabs by default)
  - macOS sleep/wake cycle (does the connection survive?)

**Phase**: Testing (dedicated pass before publishing)

---

### 5.3 Companion WebExtension: AMO Review Delays

**The Pitfall**: If publishing the companion Firefox extension to addons.mozilla.org (AMO), the review process can take days to weeks. Manual review is triggered if the extension uses certain APIs (like native messaging). This blocks your users from installing.

**Warning Signs**:
- Companion extension submitted to AMO but stuck in review
- Users can't complete setup because the companion isn't available yet
- Using permissions that trigger manual review (nativeMessaging, tabs, all_urls)

**Prevention Strategy**:
- Submit the companion extension to AMO early -- don't wait until the Raycast extension is done
- Keep the companion extension minimal to reduce review surface area
- Required permissions (`tabs`, `nativeMessaging`) will likely trigger manual review -- factor this into the timeline
- As a fallback, provide instructions for self-installation (loading as a temporary add-on via `about:debugging`), but this is poor UX for regular users since temporary add-ons are removed on Firefox restart
- Consider distributing as a self-hosted XPI (signed but not on AMO) as an alternative -- but this requires an AMO developer account for signing

**Phase**: Pre-publishing (submit companion extension to AMO well before Raycast Store submission)

---

## Summary: Phase Mapping

| Phase | Pitfalls to Address |
|-------|-------------------|
| **Research/Spike** | 1.1 (communication method), 1.4 (MV3 lifecycle), 1.5 (mozLz4 format), 3.3 (no native binaries), 4.1 (sandbox/file access) |
| **Planning/Setup** | 3.4 (naming conflicts), 5.1 (dev workflow) |
| **Scaffolding** | 2.3 (command structure), 2.4 (preferences API design) |
| **Implementation** | 1.2 (host registration), 1.3 (protocol framing), 2.1 (async operations), 2.2 (list filtering), 2.5 (Firefox not running), 2.6 (memory leaks), 4.2 (focus/tab switching), 4.3 (PATH issues) |
| **Testing** | 5.2 (edge cases and error paths) |
| **Pre-Publishing** | 3.1 (self-contained setup), 3.2 (metadata/screenshots), 5.3 (AMO review timeline) |

---

*Generated: 2026-02-06 | Source: Domain expertise on Raycast API, Firefox WebExtensions, native messaging protocol, macOS development*
