# Domain Pitfalls

**Domain:** Store publishing and distribution for a multi-component system (Firefox extension + native messaging host + Raycast extension)
**Researched:** 2026-02-24
**Milestone:** v1.1 Store Publishing & Distribution

---

## Critical Pitfalls

Mistakes that cause store rejections, broken install flows, or require architectural rework.

---

### Pitfall 1: AMO Rejects Extension Due to Missing `data_collection_permissions`

**What goes wrong:** Since November 3, 2025, all NEW Firefox extensions submitted to AMO must include a `data_collection_permissions` key in `browser_specific_settings.gecko` in the manifest. Extensions without this key are blocked from signing. Our extension has never been on AMO, so it counts as new.

**Why it happens:** This is a recent (late 2025) requirement that most tutorials and examples predate. The extension currently uses `browser_specific_settings.gecko` with only `id` and `strict_min_version` -- no `data_collection_permissions`.

**Consequences:** AMO rejects the submission outright before it even reaches human review. No signing means no listed extension.

**Prevention:**
Add the `data_collection_permissions` key to `extension/manifest.json`. Since our extension does NOT collect or transmit personal data (all communication stays local between the browser extension and native host), declare this explicitly:

```json
{
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

**IMPORTANT caveat from AMO policy:** "If the add-on uses native messaging, the Add-on Policies (including those related to user consent and control) apply to any data sent to the native application as well." Our native messaging bridge transmits tab titles, URLs, and favicon data. This is `browsingActivity` data under AMO's taxonomy. However, since this data stays entirely local (localhost HTTP, never transmitted to remote servers), the `none` declaration should be defensible -- but write a clear AMO description explaining the architecture. If AMO reviewers push back, declare `browsingActivity` as required and explain local-only usage.

**Detection:** Submission attempt returns an error before the review stage.
**Confidence:** HIGH -- sourced from official Firefox Extension Workshop docs and Mozilla Add-ons blog (Oct 2025).

**Phase to address:** Firefox AMO submission phase (first thing)

---

### Pitfall 2: AMO Source Code Submission Required for Review

**What goes wrong:** AMO requires source code upload alongside the extension if ANY build tooling, minification, or bundling is used. Without the source code and reproducible build instructions, the review is delayed or rejected.

**Why it happens:** Our Firefox extension (`extension/background.js`) is currently plain JavaScript with no build step, which is good. But if we add any build step (e.g., bundling, minification, TypeScript compilation) or include ANY third-party library in the extension package, AMO reviewers need to verify the code matches the source.

**Consequences:** Review delays of days to weeks. Rejection if source is missing or build instructions are incomplete.

**Prevention:**
- Keep the Firefox WebExtension as plain, unbundled JavaScript (current approach is ideal).
- If a build step is ever added, provide: (1) a ZIP of the full source, (2) build instructions specifying the exact environment (AMO reviewers use Ubuntu 24.04 LTS ARM64 with Node 22 LTS, npm 10), (3) a `package-lock.json` for reproducible builds.
- All third-party libraries must be official releases from npm or other package managers -- no modified copies.
- No obfuscated code whatsoever. Minification is allowed only with source upload.

**Detection:** AMO review feedback asking for source code, or long delays in review queue.
**Confidence:** HIGH -- sourced from Firefox Extension Workshop source-code-submission docs.

**Phase to address:** Firefox AMO submission phase

---

### Pitfall 3: Raycast Store Rejects Binary Download from Developer-Controlled Server

**What goes wrong:** The Raycast Store has explicit policy: downloaded executable binaries MUST come from a server the developer doesn't control. Downloading a native host binary from your own GitHub Releases is in a gray area -- GitHub is a third party, but you control the release artifacts. If Raycast reviewers interpret this as "developer-controlled," the extension is rejected.

**Why it happens:** Raycast's security model requires that post-review, the developer cannot silently swap out a binary with malicious code. The Speedtest extension passes review because it downloads from `install.speedtest.net` (not the extension developer's server).

**Consequences:** Raycast Store rejection. Must redesign the install flow.

**Prevention:**
- **Option A (safest):** Bundle the native host as a Node.js script in the Raycast extension's `assets/` directory. Since the native host is already JavaScript/Node.js, this is architecturally feasible. The Raycast extension copies it to the right location at setup time. No binary download needed. This is the path of least resistance.
- **Option B:** If bundling in assets makes the extension too large, download from GitHub Releases but add SHA-256 hash verification. Hardcode the expected hash in the extension source code (which Raycast reviewers can verify). This is closer to the pattern Raycast accepts.
- **Option C:** Distribute the native host via Homebrew (`brew install raycast-firefox-host`), which Raycast explicitly considers a trusted source. Higher setup friction but undeniably trusted.
- **Regardless of option:** Add integrity verification (hash checking) for any downloaded or extracted binary.

**Detection:** Raycast PR review feedback citing binary security policy.
**Confidence:** HIGH -- sourced from Raycast "Prepare an Extension for Store" official docs.

**Phase to address:** Architecture/planning phase (decides the bundling strategy for everything downstream)

---

### Pitfall 4: Raycast Store Monorepo PR Fails Multiple Review Rounds

**What goes wrong:** First-time Raycast Store submissions commonly go through 3-4 review rounds before acceptance. Each round can take a week, meaning a poorly prepared submission takes a month to land.

**Why it happens:** Raycast has strict, well-documented requirements that are easy to miss: MIT license, specific `package.json` schema, 512x512 icon, 2000x1250 screenshots in `metadata/`, no dotenv or manual preference handling, proper `CHANGELOG.md` format, action titles in Title Case, no redundant toasts, etc.

**Consequences:** 2-4 weeks of back-and-forth instead of days. Blocks the entire v1.1 launch.

**Prevention -- address ALL of these before submitting:**
1. **License:** Verify `"license": "MIT"` in `raycast-extension/package.json` (already set, confirmed).
2. **Screenshots:** Create 3-6 screenshots at exactly 2000x1250px PNG, saved in `metadata/search-tabs-1.png`, etc. Use Raycast's Window Capture tool.
3. **Icon:** 512x512 PNG, works on light and dark backgrounds.
4. **CHANGELOG.md:** Must exist in `raycast-extension/` root with proper `## [Section] - {PR_MERGE_DATE}` format.
5. **Categories:** Already have `["Applications", "Productivity"]` -- good.
6. **README.md:** Required because our extension needs companion Firefox extension setup. Must clearly explain installation steps.
7. **ESLint clean:** Run `npm run lint` -- fix all `@raycast/prefer-title-case` warnings (known tech debt from v1.0: "Launch Firefox" and "Install WebExtension" action titles).
8. **No AI-generated boilerplate:** Reviewers flag auto-generated comments and patterns.
9. **`showFailureToast`:** Use consistently for error handling instead of ad-hoc toast patterns.
10. **Preferences:** Use Raycast's preference API, not environment variables or config files.
11. **Build passes:** `npm run build` must succeed with zero errors.
12. **package-lock.json:** Must be committed alongside `package.json`.

**Detection:** PR review comments. Check existing Raycast extension PRs for Firefox/browser-related extensions to see what reviewers flag.
**Confidence:** HIGH -- sourced from Raycast docs + real developer submission experience (4-round journey documented).

**Phase to address:** Pre-submission preparation phase (before opening the PR)

---

### Pitfall 5: Version Sync Across Three Components Breaks User Install

**What goes wrong:** The Firefox extension, native host, and Raycast extension have independent version numbers and independent update mechanisms. A native host update changes the API protocol but the Firefox extension hasn't updated yet (or vice versa), causing silent failures or crashes for users who have a mix of old and new components.

**Why it happens:** Three independent distribution channels:
- Firefox extension: updated via AMO auto-update
- Native host: updated via GitHub Releases download (manual or triggered by Raycast extension)
- Raycast extension: updated via Raycast Store (automatic)

Each updates at its own pace. AMO review can take days; Raycast Store merges can take a week; users may not restart Firefox to pick up AMO updates.

**Consequences:** Users experience broken tab search with no clear error message. Support burden increases. Hard to debug remotely because you don't know which versions the user has.

**Prevention:**
- **Version handshake protocol:** On connection, the native host and Firefox extension exchange version numbers. The Raycast extension checks the native host version. If any pair is incompatible, show a specific error with upgrade instructions.
- **Backward compatibility commitment:** Define a protocol version (e.g., `"protocol": 1`) separate from component versions. Only bump the protocol version for breaking changes. Components check protocol compatibility, not exact version match.
- **Version reporting:** Add a `/version` or `/health` endpoint on the HTTP bridge that reports all component versions. The Raycast extension can display "Native Host v1.2.0, Firefox Extension v1.1.0" in its debug/setup view.
- **Coordinated releases:** When making breaking protocol changes, release all three components within the same day and document the minimum compatible versions.

**Detection:** Users report "was working, now broken" after partial updates.
**Confidence:** HIGH -- this is a universal multi-component distribution problem. Browserpass, KeePassXC-Browser, and similar projects all document version mismatch as their #1 support issue.

**Phase to address:** Architecture phase (protocol versioning), then every release phase

---

### Pitfall 6: macOS Gatekeeper Blocks Unsigned Native Host Binary

**What goes wrong:** If the native host is distributed as a standalone macOS binary (e.g., built with Node.js SEA), macOS Gatekeeper quarantines or blocks it. Apple Silicon Macs require ALL native ARM64 code to be signed. Users see "cannot be opened because Apple cannot check it for malicious software" and most will not know how to bypass it.

**Why it happens:** macOS security policy requires:
- Intel: Unsigned binaries trigger a Gatekeeper warning (bypassable)
- Apple Silicon: Unsigned native ARM64 code is BLOCKED by the kernel (requires `xattr -cr` or "Open Anyway" in System Settings, which many users won't do)
- Notarization: Standalone Mach-O binaries cannot be notarized or stapled directly -- only .app bundles, .dmg, and .pkg installers can be notarized

**Consequences:** Users cannot run the native host. The entire extension is broken on Apple Silicon Macs (the majority of current Macs).

**Prevention:**
- **Best path: Don't ship a compiled binary.** Keep the native host as a Node.js script (`host.js` + `run.sh`). Node.js is already installed on user machines (required by Raycast, which manages its own Node.js runtime). The `run.sh` wrapper finds `node` and runs the script. Shell scripts and JavaScript files are not subject to Gatekeeper code signing.
- **If a compiled binary is truly needed:** Either (a) obtain an Apple Developer certificate ($99/year) and code-sign + notarize inside a .pkg installer, or (b) use ad-hoc signing (`codesign -s -`) which satisfies the kernel requirement on Apple Silicon but still triggers Gatekeeper warnings on first run.
- **Node.js SEA (Single Executable Application):** Experimental feature. Even with SEA, you still need to code-sign the resulting Mach-O binary. This adds CI complexity (need a macOS runner with signing identity). Not worth it for a Node.js script that works fine interpreted.

**Detection:** User reports "native host won't start" specifically on Apple Silicon Macs.
**Confidence:** HIGH -- sourced from Apple developer docs, Node.js SEA docs, and macOS security research.

**Phase to address:** Architecture decision phase (choose Node.js script over compiled binary)

---

## Moderate Pitfalls

---

### Pitfall 7: AMO Review Takes Weeks, Blocking User Onboarding

**What goes wrong:** The companion Firefox extension sits in AMO's review queue for days to weeks. During this time, users who install the Raycast extension have no way to complete setup because the Firefox extension isn't available on AMO yet.

**Prevention:**
- Submit to AMO BEFORE opening the Raycast Store PR. AMO review should be completed or nearly completed by the time Raycast users can install.
- As a fallback, provide a self-hosted signed XPI via `web-ext sign --channel=unlisted`. This gives users an installable extension immediately, while the AMO-listed version goes through review. Migrate users to the AMO-listed version once approved.
- The unlisted/self-distributed XPI still gets auto-signed by AMO (no manual review), but users won't find it by searching AMO -- they need a direct download link (which the Raycast extension can provide).
- Include an `update_url` in the self-distributed manifest pointing to your server or GitHub Pages so Firefox checks for updates automatically.

**Confidence:** MEDIUM -- AMO review times vary widely; recent reports range from 2 days to several weeks.

**Phase to address:** Submit AMO extension as the FIRST step of the milestone

---

### Pitfall 8: NativeMessagingHosts Directory Doesn't Exist

**What goes wrong:** The setup command tries to write the native messaging host manifest to `~/Library/Application Support/Mozilla/NativeMessagingHosts/raycast_firefox.json`, but the `NativeMessagingHosts` directory doesn't exist. Firefox only creates this directory when a native messaging host is first registered by another application (like KeePassXC or Browserpass). A fresh Firefox install has no such directory.

**Prevention:**
- The setup command must `mkdir -p` the `NativeMessagingHosts` directory before writing the manifest. The current v1.0 `install.sh` already does this correctly -- ensure the automated setup flow in Raycast preserves this behavior.
- Create the directory with user-owned permissions (default `mkdir` behavior). Do NOT use `sudo` -- if created as root, other native messaging hosts (from other apps) won't be able to write to it.
- Test with a completely fresh Firefox profile that has never had any native messaging host registered.

**Confidence:** HIGH -- confirmed from Bugzilla bug 1367100 and Browserpass issue reports.

**Phase to address:** Automated install flow phase

---

### Pitfall 9: `project-root.txt` Path Resolution Breaks for Store-Installed Extensions

**What goes wrong:** The current setup uses a `prebuild` script that writes `$(cd .. && pwd)` to `assets/project-root.txt`. This works in development because the Raycast extension directory is a sibling of `native-host/`. But when installed from the Raycast Store, the extension is installed to `~/Library/Application Support/com.raycast.macos/extensions/...` -- a completely different location. The path in `project-root.txt` points to the developer's machine, not the user's.

**Why it happens:** v1.0 was designed for personal use (developer runs `ray develop` from the checkout). The Raycast Store installs extensions to an opaque managed directory. The relative path from the extension to `native-host/` no longer exists.

**Consequences:** The setup command resolves a nonexistent path for `run.sh`, writes an invalid manifest, and the native messaging host never starts.

**Prevention:**
- **Fundamental architecture change needed for v1.1:** The native host files (`host.js`, `run.sh`, `src/`, `package.json`, `node_modules/`) must be either:
  - (a) **Bundled as Raycast extension assets** in `raycast-extension/assets/native-host/` and extracted to a known location (e.g., `~/.raycast-firefox/native-host/`) during setup, OR
  - (b) **Downloaded from GitHub Releases** during setup and placed at `~/.raycast-firefox/native-host/`, OR
  - (c) **Installed via a separate mechanism** (Homebrew, npm global install) with the Raycast extension detecting the install location.
- The native messaging host manifest `path` must point to wherever the host ultimately lives, not a path relative to the Raycast extension.
- Kill the `project-root.txt` approach entirely. Replace with either `environment.assetsPath` (if bundled) or a well-known path like `~/.raycast-firefox/native-host/run.sh`.

**Detection:** "Native host files missing" error after Store installation on any machine.
**Confidence:** HIGH -- this is a known v1.0 tech debt item (documented in v1.0 audit).

**Phase to address:** Architecture phase (must be resolved before ANY distribution work)

---

### Pitfall 10: CI/CD AMO Signing Returns "Submitted for Review," Not a Signed XPI

**What goes wrong:** Using `web-ext sign --channel=listed` in CI/CD does NOT return a signed XPI immediately. For listed extensions, AMO submits for review and returns a "submitted" status. The CI job either fails or produces no artifact. Developers expect to get a signed .xpi back from CI, like they do with `--channel=unlisted`.

**Why it happens:** AMO's listed channel requires human review before signing. `web-ext sign --channel=listed` submits the extension for review but the signed artifact is only available after approval. The GitHub Action `kewisch/action-web-ext` documents this: "The action will always return a failed state for listed signing."

**Consequences:** The CI pipeline appears broken. Developers waste time debugging what they think is a CI misconfiguration.

**Prevention:**
- **Understand the two-channel model:**
  - `--channel=unlisted`: Auto-signed, returns .xpi immediately. Good for beta/dev builds and self-distribution.
  - `--channel=listed`: Submits for review, no immediate artifact. Good for AMO Store listings.
- **In CI, use separate workflows:**
  - Release workflow: `web-ext sign --channel=listed` to submit to AMO. Treat the job as "submission" not "build." Don't expect an artifact.
  - Build workflow: `web-ext build` to create the .zip for testing. Optionally `web-ext sign --channel=unlisted` for self-distributed builds.
- Store AMO API credentials (`AMO_JWT_ISSUER` and `AMO_JWT_SECRET`) as GitHub Secrets.

**Confidence:** HIGH -- confirmed from `kewisch/action-web-ext` docs and web-ext command reference.

**Phase to address:** CI/CD setup phase

---

### Pitfall 11: Raycast Extension Cannot Find Node.js for Native Host on User Machines

**What goes wrong:** The native host `run.sh` wrapper probes several common Node.js locations, but a user with a non-standard Node.js installation (or no standalone Node.js at all -- Raycast bundles its own private Node.js runtime) finds that `run.sh` fails with "node not found."

**Why it happens:** Raycast manages its own Node.js binary at an internal path. Users who only have Raycast (no Homebrew Node, no nvm) have no `node` on their PATH. The native host is launched by Firefox (not by Raycast), so it cannot use Raycast's private Node.js.

**Consequences:** Native host fails to start. Firefox logs "Error: An unexpected error occurred" in the browser console. The user sees "Host not running" in Raycast with no clear fix.

**Prevention:**
- **Document Node.js as a requirement** prominently in the README and AMO listing. "Requires Node.js 18+ installed on your system."
- **Improve `run.sh` detection:** The current script checks PATH, nvm, and Homebrew locations. Also add: `/usr/local/bin/node`, fnm (`~/.local/share/fnm/...`), asdf, volta (`~/.volta/bin/node`), and Raycast's own Node (`~/Library/Application Support/com.raycast.macos/runtime/node`).
- **Setup command validation:** The Raycast extension's setup command should verify `node` is findable BEFORE writing the manifest. If not found, show an error with install instructions: "Install Node.js from nodejs.org or via Homebrew: `brew install node`."
- **Long-term: consider making the native host a standalone binary** (via Node.js SEA) to eliminate the Node.js dependency -- but weigh against Pitfall 6 (Gatekeeper signing issues).

**Confidence:** MEDIUM -- run.sh already handles common cases, but edge cases exist for users without standalone Node.js.

**Phase to address:** Automated install flow phase

---

### Pitfall 12: Firefox Extension Name Cannot Contain "Firefox" or "Mozilla"

**What goes wrong:** AMO policy prohibits using "Mozilla" or "Firefox" in the add-on name. Our current extension name is "Raycast Firefox" which contains "Firefox."

**Prevention:**
- Rename the extension for AMO listing. Options: "Raycast Tab Bridge," "Raycast Tabs Companion," or similar. The `name` field in `manifest.json` is what AMO displays.
- The `name` field in `manifest.json` ("Raycast Firefox") and the AMO listing name must comply. Consider renaming to something that doesn't include "Firefox" at all, or check if AMO allows it as a descriptive qualifier (some extensions use it -- enforcement may be inconsistent). Best to avoid the risk.
- The extension ID (`raycast-firefox@lau.engineering`) is separate from the display name and should be fine.

**Confidence:** MEDIUM -- AMO policy states "The usage of 'Mozilla' and 'Firefox' are not allowed in the add-on name" but enforcement appears inconsistent (some existing extensions use "Firefox" in their names). Safer to avoid.

**Phase to address:** AMO submission preparation

---

### Pitfall 13: Raycast Store PR Stales and Auto-Closes

**What goes wrong:** Raycast's `raycast/extensions` monorepo auto-marks PRs as stale after 14 days of inactivity and auto-closes after 21 days. If a reviewer asks for changes and the author doesn't respond within two weeks, the PR is closed. Reopening requires starting the review process over.

**Prevention:**
- Set calendar reminders to check PR status every 3 days after submission.
- Respond to reviewer feedback within 48 hours, even if it's just "acknowledged, working on it."
- Have all the preparation done BEFORE submitting (Pitfall 4) so review rounds are about small tweaks, not major rework.

**Confidence:** HIGH -- documented in Raycast's publishing docs.

**Phase to address:** Raycast Store submission phase

---

## Minor Pitfalls

---

### Pitfall 14: AMO Version Number Must Strictly Increase

**What goes wrong:** AMO requires each submitted version to have a strictly higher version number than all previously submitted versions (including rejected or self-distributed ones). If you submit `1.0.0` as unlisted, then try to submit `1.0.0` as listed, it's rejected.

**Prevention:**
- Use a versioning scheme that accounts for both channels. E.g., `1.1.0-beta.1` for unlisted, `1.1.0` for listed.
- AMO version format: 1-4 dot-separated numbers (`^(0|[1-9][0-9]{0,8})([.](0|[1-9][0-9]{0,8})){0,3}$`). No pre-release suffixes in the version string itself -- use the 4th number for build increments.
- Plan version numbers across all three components to avoid confusion.

**Confidence:** HIGH -- from MDN version docs.

**Phase to address:** CI/CD and release management

---

### Pitfall 15: Automated Install Flow Requires Too Many User Steps

**What goes wrong:** Even with automation, the user journey for a multi-component system is: (1) install Raycast extension from Store, (2) open Raycast, run setup command, (3) install Firefox extension from AMO link, (4) restart Firefox (maybe). Each step where the user must leave the current context and do something else is a drop-off point.

**Prevention:**
- **Minimize steps to 2:** Install from Raycast Store, then click "Install Firefox Companion" which opens the AMO page. The setup command should handle everything else (native host extraction, manifest registration) automatically.
- **Cross-link clearly:** The Raycast extension setup should show one-click AMO install link. The AMO listing should mention the Raycast extension by name and link to the Raycast Store page.
- **Detect completion:** After the user installs both sides, the Raycast extension should auto-detect when the Firefox extension is active (via health check to the HTTP bridge) and show a success message.
- **No restart requirement:** Ensure the Firefox extension works immediately after install without requiring a Firefox restart. WebExtensions installed from AMO are active immediately. Native messaging hosts are discovered on next `browser.runtime.connectNative()` call.

**Confidence:** MEDIUM -- based on general UX principles and patterns from similar multi-component extensions.

**Phase to address:** Automated install flow and UX design

---

### Pitfall 16: `web-ext lint` Catches Issues That `ray lint` Doesn't (and Vice Versa)

**What goes wrong:** The Firefox extension and Raycast extension have separate linting systems. Running only one misses issues in the other. The Firefox extension needs `web-ext lint` for AMO compliance; the Raycast extension needs `ray lint` for Store compliance.

**Prevention:**
- CI should run both: `web-ext lint` on `extension/` and `npm run lint` on `raycast-extension/`.
- Add both to a root-level npm script or Makefile for easy local validation.
- `web-ext lint` catches AMO-specific issues: manifest problems, deprecated APIs, CSP violations, etc.
- `ray lint` catches Raycast-specific issues: missing metadata, Title Case violations, schema errors.

**Confidence:** HIGH -- both tools are well-documented.

**Phase to address:** CI/CD setup phase

---

### Pitfall 17: GitHub Release Artifact Architecture Mismatch

**What goes wrong:** If distributing the native host as a compiled binary via GitHub Releases, building only for one architecture (e.g., x86_64) leaves Apple Silicon users unable to run it (or vice versa). Even for Node.js scripts, if `node_modules` contains any native modules (`.node` files), they are architecture-specific.

**Prevention:**
- For the recommended Node.js script approach: ensure `node_modules` contains NO native dependencies. All current native-host dependencies are pure JavaScript -- keep it that way.
- If ever adding a native dependency: build universal (fat) binaries or provide separate downloads for `darwin-x64` and `darwin-arm64`.
- CI should test on both architectures if possible (GitHub Actions offers both `macos-13` for Intel and `macos-14`/`macos-latest` for Apple Silicon).

**Confidence:** HIGH -- standard macOS distribution concern.

**Phase to address:** CI/CD and native host bundling phase

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| **AMO Submission** | Pitfalls 1, 2, 7, 10, 12, 14 | Add `data_collection_permissions`, keep JS unbundled, submit early, understand listed vs. unlisted signing, rename extension, plan version numbers |
| **Native Host Bundling** | Pitfalls 3, 6, 9, 11, 17 | Bundle as Node.js script in assets (not compiled binary), fix project-root.txt approach, validate Node.js availability, ensure pure-JS dependencies |
| **Raycast Store Submission** | Pitfalls 4, 13 | Address ALL metadata/screenshot/lint requirements before PR, respond to reviews promptly |
| **CI/CD Pipeline** | Pitfalls 10, 14, 16, 17 | Separate listed/unlisted AMO workflows, plan version scheme, run both lint tools, test both architectures |
| **Automated Install Flow** | Pitfalls 5, 8, 11, 15 | Add protocol version handshake, mkdir -p NativeMessagingHosts, validate Node.js before manifest write, minimize user steps to 2 |
| **Architecture Decisions** | Pitfalls 3, 5, 6, 9 | These must be resolved FIRST -- they determine the shape of everything else |

---

## Sources

### Official Documentation (HIGH confidence)
- [Firefox Extension Workshop: Add-on Policies](https://extensionworkshop.com/documentation/publish/add-on-policies/)
- [Firefox Extension Workshop: Source Code Submission](https://extensionworkshop.com/documentation/publish/source-code-submission/)
- [Firefox Extension Workshop: Data Collection Consent](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/)
- [Firefox Extension Workshop: Signing and Distribution Overview](https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/)
- [Firefox Extension Workshop: Self-Distribution](https://extensionworkshop.com/documentation/publish/self-distribution/)
- [MDN: Native Messaging](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Native_messaging)
- [MDN: manifest.json version](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/version)
- [Raycast: Prepare an Extension for Store](https://developers.raycast.com/basics/prepare-an-extension-for-store)
- [Raycast: Publish an Extension](https://developers.raycast.com/basics/publish-an-extension)
- [Raycast: Security](https://developers.raycast.com/information/security)
- [Node.js: Single Executable Applications](https://nodejs.org/api/single-executable-applications.html)

### Community & Blog (MEDIUM confidence)
- [Mozilla Add-ons Blog: Data Collection Consent Changes (Oct 2025)](https://blog.mozilla.org/addons/2025/10/23/data-collection-consent-changes-for-new-firefox-extensions/)
- [Mozilla Add-ons Blog: Updated Add-on Policies (June 2025)](https://blog.mozilla.org/addons/2025/06/23/updated-add-on-policies-simplified-clarified/)
- [First Raycast Extension Journey (4-round review experience)](https://www.yppnote.com/en/raycast-extension-development-experience/)
- [Browserpass Native: macOS installation issues](https://github.com/browserpass/browserpass-native/issues/125)
- [Bugzilla 1367100: NativeMessagingHosts directory creation](https://bugzilla.mozilla.org/show_bug.cgi?id=1367100)
- [kewisch/action-web-ext: GitHub Action for web-ext](https://github.com/kewisch/action-web-ext)
- [BleepingComputer: Firefox continues MV2 support](https://www.bleepingcomputer.com/news/security/firefox-continues-manifest-v2-support-as-chrome-disables-mv2-ad-blockers/)

---

*Researched: 2026-02-24 | Milestone: v1.1 Store Publishing & Distribution*
