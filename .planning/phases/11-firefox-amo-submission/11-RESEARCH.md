# Phase 11: Firefox AMO Submission - Research

**Researched:** 2026-03-09
**Domain:** Firefox extension distribution, addons.mozilla.org (AMO) listing, web-ext tooling, data collection disclosure
**Confidence:** HIGH

## Summary

Phase 11 prepares and submits the existing Firefox WebExtension (`extension/`) to addons.mozilla.org (AMO) for public listing and Mozilla signing. The extension is a functional MV2 WebExtension with native messaging that already exists in the `extension/` directory. The work is primarily manifest changes (adding `data_collection_permissions`, renaming the extension), adding `web-ext` tooling for build/lint, and the actual manual AMO submission through Mozilla's Developer Hub web interface.

The key technical changes are: (1) adding the `data_collection_permissions` field to manifest.json declaring `"none"` since the extension communicates only with a local native host and does not transmit data to external servers, (2) renaming the extension from "Raycast Firefox" to a compliant name (the format "Raycast Tab Manager for Firefox" or simply "Raycast Tab Manager" avoids trademark issues), (3) upgrading `web-ext` from ^9.0.0 to ^9.4.0 and adding lint/build npm scripts (partially already done), and (4) creating an AMO metadata file for the `web-ext sign` command (future CI automation, deferred to DIST-02) or manual submission via the Developer Hub.

The actual AMO submission is a manual process through the web UI at `addons.mozilla.org/developers/`. The extension is uploaded as a `.zip` built by `web-ext build`, undergoes automated validation, and is typically signed within 24 hours. Manual code review may follow at any time after signing. Since the extension uses `nativeMessaging` permission, reviewers may give extra scrutiny -- reviewer notes should explain the native messaging architecture clearly.

**Primary recommendation:** Update manifest.json with `data_collection_permissions: { required: ["none"] }`, rename to "Raycast Tab Manager for Firefox", use `web-ext lint` to validate before submission, build with `web-ext build`, and submit manually through the AMO Developer Hub. The AMO listing description should mention "Companion extension for Raycast tab management" and link to the Raycast Store page (placeholder URL until Phase 13 completes).

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AMO-01 | Firefox extension is listed on addons.mozilla.org | Manual submission via AMO Developer Hub; `web-ext build` produces the uploadable .zip; signing typically completes within 24 hours |
| AMO-02 | Extension manifest includes `data_collection_permissions` | Add `browser_specific_settings.gecko.data_collection_permissions: { required: ["none"] }` to manifest.json; required for all new extensions since Nov 3 2025 |
| AMO-03 | Extension display name complies with AMO naming policy (no "Firefox" in name) | AMO policy requires format "<Add-on name> for Firefox"; rename from "Raycast Firefox" to "Raycast Tab Manager for Firefox" or simply remove "Firefox" |
| AMO-04 | `web-ext` tooling added as dev dependency for building/linting | Already present as `^9.0.0` in `extension/package.json`; upgrade to `^9.4.0`; lint/build scripts already exist |
| LINK-01 | AMO listing description links to Raycast Store page | Include link in AMO listing description field; use placeholder URL if Raycast Store listing (Phase 13) not yet live |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `web-ext` | ^9.4.0 | Build, lint, and (future) sign Firefox extensions | Mozilla's official CLI tool for WebExtension development and AMO submission |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `addons-linter` | (bundled in web-ext) | Validates manifest and source code for AMO compliance | Runs automatically via `web-ext lint`; checks permissions, manifest keys, API compatibility |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `web-ext build` | Manual `zip` command | `web-ext build` auto-excludes `.git`, `node_modules`, etc.; manual zip risks including unwanted files |
| `web-ext sign` (CLI submission) | AMO Developer Hub (web UI) | CLI requires API keys and is better for CI automation; web UI is simpler for first-time submission and allows filling in listing metadata interactively |
| Manual web submission | `web-ext sign --channel=listed` | For first submission, the web UI provides a better UX for filling in description, screenshots, categories; CLI submission is better for updates (deferred to DIST-02) |

**Installation:**
```bash
cd extension && npm install web-ext@^9.4.0 --save-dev
```

## Architecture Patterns

### Manifest Changes Required

The manifest.json needs two changes: `data_collection_permissions` and display name.

**Current manifest.json:**
```json
{
  "manifest_version": 2,
  "name": "Raycast Firefox",
  "version": "1.0.0",
  ...
  "browser_specific_settings": {
    "gecko": {
      "id": "raycast-firefox@lau.engineering",
      "strict_min_version": "91.0"
    }
  }
}
```

**Updated manifest.json:**
```json
{
  "manifest_version": 2,
  "name": "Raycast Tab Manager for Firefox",
  "version": "1.0.0",
  ...
  "browser_specific_settings": {
    "gecko": {
      "id": "raycast-firefox@lau.engineering",
      "strict_min_version": "91.0",
      "data_collection_permissions": {
        "required": ["none"]
      }
    }
  }
}
```

### Pattern 1: `data_collection_permissions` Declaration

**What:** Mandatory manifest field declaring what personal data the extension collects/transmits outside itself.
**When to use:** Required for ALL new extensions submitted to AMO since November 3, 2025.

**Decision rationale for `"none"`:**

The extension accesses tab URLs and titles via `browser.tabs.query({})` and sends them to a local native messaging host via `browser.runtime.connectNative()`. Mozilla defines "data transmission" as data "collected, used, transferred, shared, or handled outside the add-on or the local browser."

Arguments for `"none"`:
- Data never leaves the local machine
- Native messaging is a local IPC mechanism (stdin/stdout to a local process)
- The native host serves data on localhost only (port 26394)
- No external servers, no network requests, no telemetry

Arguments for `"browsingActivity"`:
- Tab URLs technically pass through native messaging (outside the browser process)
- Mozilla's policy says "Add-on Policies apply to any data sent to the native application as well"

**Recommendation:** Declare `"none"` first. Per STATE.md: "declare 'none' first, fallback to 'browsingActivity' if rejected." The extension genuinely does not transmit data externally. If AMO reviewers reject this declaration, update to `"browsingActivity"` and resubmit. Include reviewer notes explaining the native messaging architecture.

**Key constraints:**
- `"none"` CANNOT be mixed with other values in the `required` array
- The `optional` array is... optional (omit if not needed)
- This field is under `browser_specific_settings.gecko`, NOT at the top level

### Pattern 2: AMO-Compliant Extension Naming

**What:** Mozilla trademark policy requires the format `<Add-on name> for Firefox` when using "Firefox" in the extension name.
**When to use:** Always, when the display name contains a Mozilla trademark.

```
Bad:  "Raycast Firefox"         -- "Firefox" not in "<name> for Firefox" format
Bad:  "Firefox Raycast Tabs"    -- "Firefox" at the beginning
Good: "Raycast Tab Manager for Firefox"  -- compliant format
Good: "Raycast Tab Manager"     -- avoids trademark entirely
```

**Recommendation:** Use `"Raycast Tab Manager for Firefox"` -- it describes the extension's function, includes the browser name in the permitted format, and is discoverable on AMO when users search for tab management tools.

Source: [Add-on Policies](https://extensionworkshop.com/documentation/publish/add-on-policies/) -- "the naming standard the add-on is expected to follow is '<Add-on name> for Firefox'"

### Pattern 3: web-ext Build and Lint Workflow

**What:** Use `web-ext lint` to validate the extension before submission, and `web-ext build` to produce the uploadable `.zip`.
**When to use:** Before every AMO submission.

```bash
# Lint (catches manifest errors, permission issues, API compatibility)
cd extension && npx web-ext lint --source-dir .

# Build (creates .zip in web-ext-artifacts/)
cd extension && npx web-ext build --source-dir . --overwrite-dest

# Output: extension/web-ext-artifacts/raycast_tab_manager_for_firefox-1.0.0.zip
```

The `extension/package.json` already has these as npm scripts:
```json
{
  "scripts": {
    "lint": "web-ext lint --source-dir .",
    "build": "web-ext build --source-dir . --overwrite-dest"
  }
}
```

### Pattern 4: AMO Developer Hub Manual Submission

**What:** Upload the built `.zip` through the web interface at `addons.mozilla.org/developers/`.
**When to use:** For the initial AMO listing (first-time submission).

Steps:
1. Log in at `addons.mozilla.org` with a Mozilla account
2. Go to Developer Hub -> Submit a New Add-on
3. Select "On this site" for AMO distribution
4. Upload the `.zip` from `web-ext build`
5. Wait for automated validation
6. Fill in listing metadata:
   - **Name:** "Raycast Tab Manager for Firefox" (auto-detected from manifest)
   - **Summary:** "Companion extension for Raycast tab management. Enables searching and switching Firefox tabs from Raycast."
   - **Description:** Detailed description with Raycast Store link
   - **Categories:** Select "Tabs" (slug: `tabs`)
   - **License:** MIT (or whichever the project uses)
   - **Reviewer Notes:** Explain native messaging architecture (see Code Examples below)
7. Submit for review

### Pattern 5: AMO Metadata File (for future CLI submission)

**What:** JSON file used with `web-ext sign --amo-metadata=<path>` for automated submission.
**When to use:** Future CI automation (DIST-02, out of scope for this phase).

```json
{
  "version": {
    "license": "MIT"
  },
  "categories": {
    "firefox": ["tabs"]
  },
  "summary": {
    "en-US": "Companion extension for Raycast tab management. Enables searching and switching Firefox tabs from Raycast."
  }
}
```

This file can be created now for reference but is NOT needed for manual web submission.

### Anti-Patterns to Avoid

- **Submitting without running `web-ext lint` first:** The AMO automated validator uses the same `addons-linter` library. Running lint locally catches issues before upload, saving a submit-reject-fix cycle.
- **Using `web-ext sign` for the first submission:** The web UI is better for the initial listing because it lets you fill in description, categories, and screenshots interactively. CLI submission is better for updates.
- **Declaring `"browsingActivity"` preemptively:** This triggers Firefox's consent dialog on installation, asking users to accept browsing data collection. Since the extension only communicates locally, this creates unnecessary friction. Start with `"none"`.
- **Leaving "Raycast Firefox" as the name:** Will be flagged by AMO review for trademark violation.
- **Forgetting to include `128x128` icon:** AMO recommends a 128x128 icon for the listing page. The current manifest only has 48 and 96 sizes. Consider adding a 128px icon for the AMO listing (not required but recommended).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Extension packaging | Manual `zip` command | `web-ext build` | Auto-excludes `.git`, `node_modules`, `.DS_Store`, etc. |
| Manifest validation | Manual JSON checking | `web-ext lint` | Catches unknown permissions, deprecated APIs, missing fields |
| AMO API interaction | Custom HTTP API client | AMO Developer Hub web UI (or `web-ext sign` for future automation) | Handles auth, upload, validation, signing automatically |
| File exclusion for build | Custom `.zipignore` | `web-ext build` built-in exclusions | Standard exclusions are well-tested; customize with `--ignore-files` if needed |

**Key insight:** For a first-time AMO submission, almost everything is handled by either `web-ext` (build/lint) or the AMO web interface (submission/metadata). There is very little code to write -- this phase is primarily about manifest changes and a manual submission process.

## Common Pitfalls

### Pitfall 1: `data_collection_permissions` Wrong Location in Manifest

**What goes wrong:** Putting `data_collection_permissions` at the manifest root level or under `browser_specific_settings` (without `.gecko`) causes AMO validation to fail with "data_collection_permissions missing."
**Why it happens:** The property is deeply nested under `browser_specific_settings.gecko`, which is not intuitive.
**How to avoid:** Place it exactly at `browser_specific_settings.gecko.data_collection_permissions`.
**Warning signs:** AMO validator error: "data_collection_permissions missing" even though it appears to be present.

Source: [Mozilla Discourse report](https://discourse.mozilla.org/t/validation-says-data-collection-permissions-missing-but-exists-in-manifest/146012)

### Pitfall 2: "Firefox" in Extension Name Triggers Review Rejection

**What goes wrong:** Extensions with "Firefox" in the name that don't follow the `<name> for Firefox` format are flagged during AMO review.
**Why it happens:** Mozilla enforces trademark guidelines on all AMO listings.
**How to avoid:** Rename to `"Raycast Tab Manager for Firefox"` or remove "Firefox" entirely.
**Warning signs:** AMO review rejection citing trademark policy violation.

### Pitfall 3: Extension ID Must Be Consistent

**What goes wrong:** If the extension ID in `manifest.json` changes, AMO treats it as a completely new extension. Users of the old ID won't receive updates.
**Why it happens:** The `browser_specific_settings.gecko.id` is the unique identifier on AMO.
**How to avoid:** Keep the existing ID `raycast-firefox@lau.engineering` even if the display name changes. The extension ID does not need to match the display name.
**Warning signs:** AMO creates a new listing instead of updating the existing one.

### Pitfall 4: `nativeMessaging` Permission Triggers Extra Review Scrutiny

**What goes wrong:** Extensions requesting `nativeMessaging` permission may receive closer manual review because native messaging allows arbitrary local process execution.
**Why it happens:** Mozilla considers native messaging a high-privilege permission due to its ability to interact with the local system.
**How to avoid:** Include clear reviewer notes explaining: (1) what the native host does, (2) how it communicates (stdin/stdout, localhost HTTP), (3) that no data leaves the machine. Point reviewers to the public source code repository.
**Warning signs:** Extended review time, reviewer questions about native messaging.

### Pitfall 5: `web-ext build` Includes Unwanted Files

**What goes wrong:** Files like `node_modules/`, `package.json`, `.gitignore` end up in the built `.zip`, making it unnecessarily large or causing validation warnings.
**Why it happens:** `web-ext build` excludes common patterns but may not exclude everything.
**How to avoid:** Run `web-ext build` and inspect the resulting `.zip` contents before submission. Use `--ignore-files` to exclude additional patterns if needed. The `extension/package.json` and `extension/node_modules/` should be excluded since they are for development tooling, not the extension itself.
**Warning signs:** Built `.zip` is unexpectedly large (the actual extension should be ~15KB, not 15MB).

### Pitfall 6: Missing or Inadequate Listing Description

**What goes wrong:** AMO reviewers may request more information or reject listings with vague descriptions.
**Why it happens:** AMO requires descriptions that clearly explain what the extension does and what permissions it uses.
**How to avoid:** Write a clear description that covers: what the extension does, why it needs each permission (`tabs`, `nativeMessaging`, `contextualIdentities`, `cookies`), and how to set it up. Include a link to the Raycast Store page (LINK-01).
**Warning signs:** AMO reviewer asks for more description details.

### Pitfall 7: AMO Review Timing Unpredictability

**What goes wrong:** Automated signing can take up to 24 hours. Manual review can happen at any time after signing and may take days or weeks.
**Why it happens:** Mozilla's review queue volume varies. Extensions with `nativeMessaging` may receive higher priority for manual review.
**How to avoid:** Submit early in the milestone to parallelize the review wait time with other phase work (this aligns with STATE.md guidance). The extension becomes available after automated signing even before manual review.
**Warning signs:** Extension status stuck on "Awaiting review" for extended periods.

## Code Examples

### Updated manifest.json (Complete)

```json
{
  "manifest_version": 2,
  "name": "Raycast Tab Manager for Firefox",
  "version": "1.0.0",
  "description": "Companion extension for Raycast tab management",
  "browser_specific_settings": {
    "gecko": {
      "id": "raycast-firefox@lau.engineering",
      "strict_min_version": "91.0",
      "data_collection_permissions": {
        "required": ["none"]
      }
    }
  },
  "background": {
    "scripts": ["background.js"],
    "persistent": true
  },
  "permissions": [
    "tabs",
    "nativeMessaging",
    "contextualIdentities",
    "cookies"
  ],
  "icons": {
    "48": "icons/icon-48.png",
    "96": "icons/icon-96.png"
  }
}
```

Source: [MDN browser_specific_settings](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/browser_specific_settings), [Firefox data consent docs](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/)

### AMO Listing Description (Template)

```
Raycast Tab Manager for Firefox is a companion extension that enables
Raycast (https://raycast.com) to search and switch your Firefox tabs.

## What it does
- Allows Raycast to list all open Firefox tabs
- Enables instant tab switching from Raycast's search bar
- Supports Firefox Container Tabs (Multi-Account Containers)
- Supports tab closing from Raycast

## How it works
This extension communicates with a local native messaging host
(installed separately via Raycast). All communication stays on your
local machine -- no data is sent to any external server.

## Setup
Install the companion Raycast extension from the Raycast Store:
https://raycast.com/toshi38/firefox-tabs

Then run the "Setup Firefox Bridge" command in Raycast to complete
the setup.

## Permissions explained
- **tabs**: Read tab titles and URLs to display in Raycast
- **nativeMessaging**: Communicate with the local bridge process
- **contextualIdentities, cookies**: Show Firefox Container metadata

## Privacy
This extension does not collect, store, or transmit any personal data.
All communication occurs locally via native messaging (stdin/stdout)
and localhost HTTP.

Source code: https://github.com/toshi38/raycast-firefox
```

### Reviewer Notes (Template)

```
This extension is a companion to a Raycast (https://raycast.com)
extension for tab management. It communicates with a local native
messaging host via browser.runtime.connectNative().

Architecture:
1. Raycast extension sends HTTP request to localhost:26394
2. Native host forwards request to this Firefox extension via native
   messaging (stdin/stdout)
3. This extension queries browser.tabs and returns results
4. Native host sends response back to Raycast over localhost HTTP

No data leaves the user's machine. The native host source code is
available at: https://github.com/toshi38/raycast-firefox/tree/main/native-host

The extension uses "nativeMessaging" permission to communicate with
the local native host only. The "tabs" permission is used to read
tab metadata (titles, URLs) for display in Raycast's search interface.
"contextualIdentities" and "cookies" are used to show Firefox Container
tab metadata.

data_collection_permissions is set to "none" because all communication
is local (native messaging + localhost HTTP). No data is transmitted to
external servers.
```

### web-ext lint and build commands

```bash
# Validate extension before submission
cd extension && npm run lint
# Equivalent to: npx web-ext lint --source-dir .

# Build .zip for AMO upload
cd extension && npm run build
# Equivalent to: npx web-ext build --source-dir . --overwrite-dest
# Output: extension/web-ext-artifacts/raycast_tab_manager_for_firefox-1.0.0.zip

# Inspect built zip contents (verify no unwanted files)
unzip -l extension/web-ext-artifacts/*.zip
```

### .web-ext-config (Optional, for ignoring files)

If `web-ext build` includes unwanted files like `package.json` or `node_modules`, create:

```json
// extension/web-ext-config.json  (or add to package.json under "webExt")
{
  "ignoreFiles": [
    "package.json",
    "package-lock.json",
    "node_modules/**",
    "web-ext-artifacts/**"
  ]
}
```

Note: `web-ext` already excludes `node_modules` and `web-ext-artifacts` by default. Only add this if inspection reveals unwanted files.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No data collection disclosure | `data_collection_permissions` required in manifest | Nov 3, 2025 | All new AMO submissions must declare data collection; rejection if missing |
| Privacy policy required on AMO | Privacy policy optional (self-hosted encouraged) | Aug 2025 | Reduces submission friction; no longer need to host a privacy policy page |
| `web-ext sign --use-submission-api` | `web-ext sign` creates listed extensions by default | web-ext v8 (May 2024) | No special flag needed for listed submissions |
| Separate `web-ext-submit` package | `web-ext sign --channel=listed` handles everything | web-ext v8 | Single tool for both signing and submission |

**Deprecated/outdated:**
- `--use-submission-api` flag: Removed in web-ext v8; no longer needed
- AMO-hosted privacy policies: No longer required as of August 2025
- `web-ext-submit` npm package: Functionality merged into `web-ext sign`

## Open Questions

1. **Will AMO accept `data_collection_permissions: { required: ["none"] }` for a native messaging extension?**
   - What we know: The extension communicates only locally via native messaging and localhost HTTP. Mozilla's definition of "data transmission" is ambiguous for local IPC.
   - What's unclear: Whether AMO reviewers consider native messaging as "outside the add-on or the local browser" for the purposes of data_collection_permissions.
   - Recommendation: Submit with `"none"` first (per STATE.md decision). If rejected, change to `{ required: ["browsingActivity"] }` and resubmit. The fallback adds an install-time consent dialog but is more defensible.

2. **Should a 128x128 icon be added for the AMO listing?**
   - What we know: Current manifest has 48px and 96px icons. AMO displays icons at up to 128x128 on listing pages.
   - What's unclear: Whether AMO will reject or downscale the 96px icon.
   - Recommendation: Add a 128x128 icon for best appearance on the AMO listing page. This is cosmetic, not a blocker.

3. **What is the Raycast Store page URL for LINK-01?**
   - What we know: The Raycast Store listing (Phase 13) does not exist yet. The URL format is typically `https://raycast.com/{author}/{extension-slug}`.
   - What's unclear: The exact URL until the Raycast Store listing is created.
   - Recommendation: Use a placeholder or omit the link in the initial submission, then update the AMO listing description after Phase 13 completes. Alternatively, link to the GitHub repository as an interim setup guide.

## Validation Architecture

> Nyquist validation not explicitly disabled. Including validation section.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Manual validation (no automated test framework for the Firefox extension) |
| Config file | None |
| Quick run command | `cd extension && npm run lint` (web-ext lint) |
| Full suite command | `cd extension && npm run lint && npm run build && unzip -l web-ext-artifacts/*.zip` |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AMO-01 | Extension listed on AMO | manual | Manual: submit via AMO Developer Hub, verify listing URL | N/A |
| AMO-02 | Manifest includes `data_collection_permissions` | automated | `cd extension && npm run lint` (web-ext lint validates manifest) | Existing |
| AMO-03 | Display name complies with AMO naming policy | manual | Visual inspection of manifest.json `name` field | N/A |
| AMO-04 | `web-ext` tooling added as dev dependency | automated | `cd extension && npx web-ext --version` | Existing |
| LINK-01 | AMO listing links to Raycast Store page | manual | Visual inspection of AMO listing description | N/A |

### Sampling Rate

- **Per task commit:** `cd extension && npm run lint` (validates manifest and source)
- **Per wave merge:** `cd extension && npm run lint && npm run build` (build + inspect .zip)
- **Phase gate:** AMO listing URL accessible and extension downloadable

### Wave 0 Gaps

None -- existing `web-ext` infrastructure covers automated validation needs. Manual steps (AMO submission, listing verification) cannot be automated within this phase scope.

## Sources

### Primary (HIGH confidence)

- [Firefox built-in data consent docs](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/) -- `data_collection_permissions` format, valid values, constraints
- [MDN browser_specific_settings](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/browser_specific_settings) -- manifest property reference
- [Add-on Policies](https://extensionworkshop.com/documentation/publish/add-on-policies/) -- naming policy, data collection requirements, trademark guidelines
- [web-ext command reference](https://extensionworkshop.com/documentation/develop/web-ext-command-reference/) -- build, lint, sign command options
- [Submitting an add-on](https://extensionworkshop.com/documentation/publish/submitting-an-add-on/) -- AMO Developer Hub submission process
- [Signing and distribution overview](https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/) -- signing process, review timeline (up to 24 hours)
- [AMO addons-server API: categories](https://mozilla.github.io/addons-server/topics/api/categories.html) -- complete list of category slugs including `tabs`

### Secondary (MEDIUM confidence)

- [Mozilla Add-ons Blog: data collection changes](https://blog.mozilla.org/addons/2025/10/23/data-collection-consent-changes-for-new-firefox-extensions/) -- Nov 3 2025 enforcement date for `data_collection_permissions`
- [Mozilla Add-ons Blog: updated policies](https://blog.mozilla.org/addons/2025/06/23/updated-add-on-policies-simplified-clarified/) -- Aug 2025 policy simplification (privacy policy no longer required)
- [web-ext GitHub repository](https://github.com/mozilla/web-ext) -- current version 9.4.0

### Tertiary (LOW confidence)

- AMO review timing: "up to 24 hours" for automated signing is documented, but actual times vary; manual review timing is unpredictable
- Native messaging + `data_collection_permissions` interaction: No official guidance on whether local native messaging counts as "outside the add-on"; recommendation based on interpretation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- `web-ext` is already installed; AMO submission process is well-documented
- Architecture: HIGH -- manifest changes are straightforward and well-documented on MDN and Extension Workshop
- Pitfalls: HIGH -- derived from official docs, Mozilla Discourse reports, and AMO policy documentation
- `data_collection_permissions` value: MEDIUM -- `"none"` is the correct semantic choice but AMO reviewer interpretation of native messaging is uncertain

**Research date:** 2026-03-09
**Valid until:** 2026-04-09 (stable -- AMO policies and `web-ext` are mature, `data_collection_permissions` requirement is settled)
