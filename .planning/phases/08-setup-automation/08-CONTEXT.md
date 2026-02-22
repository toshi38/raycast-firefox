# Phase 8: Setup Automation - Context

**Gathered:** 2026-02-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Single Raycast command to register the native messaging host manifest with Firefox. Replaces the manual `install.sh` workflow. Includes pre-flight checks, manifest writing, and full-chain verification. macOS only (Raycast is macOS-only).

</domain>

<decisions>
## Implementation Decisions

### Command experience
- One-click action: user runs command, sees toast with progress, done. No forms, no wizard steps.
- Command named "Setup Firefox Bridge" — separate from "Search Firefox Tabs" so it's clearly a one-time action
- Success: green checkmark toast "Firefox integration ready!" — minimal, Raycast closes
- Failure: actionable error toast with what went wrong + what to do (e.g., "Couldn't write manifest. Check permissions on ~/Library/Application Support/Mozilla/")

### Post-setup validation
- Full chain verification after writing manifest: check manifest file + host process + WebExtension responding
- If Firefox not running: "Manifest installed. Firefox not running — start Firefox with the companion extension to complete setup."
- If host not responding: treat as failure with guidance — "Setup incomplete — host not responding. Ensure Firefox is running and the companion extension is installed."
- Verification reports specifically what's missing, not just generic "failed"

### Existing setup handling
- Overwrite silently on re-run — manifest content is deterministic from install path, so always safe to rewrite
- No uninstall command — out of scope, users can delete manifest manually
- Stale path detection: if extension is moved after setup, Search Tabs (Phase 7) should detect stale manifest paths and suggest re-running setup. The setup command itself just always rewrites fresh.

### Setup scope
- Pre-flight check: verify Firefox.app is installed before writing manifest. If not found: "Firefox not detected. Install Firefox first."
- macOS only — Raycast is macOS-only, no need for cross-platform
- After manifest setup, if WebExtension isn't detected in the chain verification, include guidance: "Don't forget to install the companion Firefox extension."
- Manifest path: `~/Library/Application Support/Mozilla/NativeMessagingHosts/raycast_firefox.json`

### Claude's Discretion
- Exact toast message wording and formatting
- How to detect Firefox.app on the system (bundle check vs path check)
- How to structure the verification ping to the native host
- Whether to reuse existing install.sh logic or rewrite in TypeScript within the Raycast extension

</decisions>

<specifics>
## Specific Ideas

- Existing `native-host/install.sh` already has the core logic — writes manifest JSON with absolute path to `run.sh`
- Manifest structure is known: name, description, path, type (stdio), allowed_extensions
- Extension ID: `raycast-firefox@lau.engineering`

</specifics>

<deferred>
## Deferred Ideas

- Uninstall/remove command — user can manually delete manifest if needed
- Windows registry support — not applicable since Raycast is macOS only
- Linux support — not applicable since Raycast is macOS only

</deferred>

---

*Phase: 08-setup-automation*
*Context gathered: 2026-02-22*
