# Phase 13: Raycast Store Submission - Research

**Researched:** 2026-03-14
**Domain:** Raycast Store publishing, extension metadata, icon/screenshot preparation
**Confidence:** HIGH

## Summary

Phase 13 prepares the Raycast extension for public Store listing. The work is primarily metadata preparation (README, icon, screenshots, CHANGELOG, LICENSE), a small code refactor (AMO URL centralization), and compliance fixes (ESLint/Prettier, package.json fields, author validation). No new features are built.

The Raycast Store submission process works via `npm run publish` (or `npx @raycast/api@latest publish`), which authenticates via GitHub and creates a PR in the `raycast/extensions` monorepo. The Raycast team reviews and merges. This means the extension files must conform to that repo's conventions -- the PR is what gets reviewed, not our repo directly.

**Primary recommendation:** Split work into two plans: (1) code changes and metadata file creation (AMO URL refactor, icon, README, LICENSE, CHANGELOG, package.json, ESLint fixes, package-lock.json generation), and (2) screenshot folder setup with placeholder structure for user-captured screenshots, plus final `ray build` and `ray lint` validation.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- Store README (raycast-extension/README.md): Short, store-focused: 1-line description, setup steps, privacy note. Skip architecture/permissions sections. Use placeholder links for AMO URL and Raycast Store URL.
- Screenshots: 3 screenshots at 2000x1250 in `raycast-extension/metadata/` folder. Screens: (1) Tab search with curated tabs, (2) Close tab action panel, (3) Setup toast flow. User captures manually; Claude sets up folder structure and naming.
- Icon: Replace orange circle placeholder with Gemini-generated fox icon. Source: `~/Downloads/Gemini_Generated_Image_w1tmzww1tmzww1tm.png` (2816x1536). Claude crops and resizes to 512x512 using sips.
- AMO URL centralization: Extract `AMO_URL` into `lib/constants.ts`. Both `search-tabs.tsx` and `setup-bridge.tsx` import from there. Fix old/wrong URL in search-tabs.tsx.
- Package.json: Add `platforms: ["macOS"]`. Verify icon reference.
- ESLint compliance: Run `ray lint` and fix violations.
- License: MIT license must be in `raycast-extension/`.
- CHANGELOG: Verify existing CHANGELOG.md is up to date.

### Claude's Discretion
- Exact README wording and structure
- Icon cropping coordinates (center on the fox icon area)
- metadata/ folder file naming convention
- ESLint fix details
- Whether to copy LICENSE into raycast-extension/ or symlink

### Deferred Ideas (OUT OF SCOPE)
- Update repo README placeholder links with final AMO URL and Raycast Store URL (post-submission)
- Update AMO listing description to link to Raycast Store URL (captured from Phase 11 deferred)

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| STORE-01 | Raycast extension is listed in the Raycast Store | Publishing process documented; `npm run publish` creates PR to raycast/extensions repo |
| STORE-02 | README.md with setup instructions and AMO link | README format requirements documented; examples from Arc extension |
| STORE-03 | 512x512 custom icon verified for light/dark themes | Icon spec confirmed (512x512 PNG); source image analyzed -- dark background concern for light theme |
| STORE-04 | 3+ screenshots at 2000x1250 in `metadata/` folder | Screenshot specs confirmed; naming convention: `{extension-name}-{N}.png` |
| STORE-05 | CHANGELOG.md with version history | Format documented with `## [Title] - {PR_MERGE_DATE}` convention; current CHANGELOG needs reformatting |
| STORE-06 | `platforms: ["macOS"]` set in package.json | Field documented in manifest schema; straightforward addition |
| STORE-07 | ESLint clean (no @raycast/prefer-title-case violations) | Current lint run shows Prettier issues and author validation failure; fixable |
| STORE-08 | MIT license present in extension root | Root LICENSE exists (MIT); needs copy to `raycast-extension/` |
| LINK-02 | Raycast README links to AMO listing | README will include AMO link per user decision |
| LINK-03 | Error states include direct links to AMO for Firefox extension installation | search-tabs.tsx already has AMO link on ExtensionNotInstalled -- URL just needs fixing via centralized constant |

</phase_requirements>

## Standard Stack

### Core (Already in Project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @raycast/api | ^1.104.0 | Raycast extension framework | Required for Raycast extensions |
| @raycast/eslint-config | ^1.0.0 | ESLint rules for Store compliance | Includes `@raycast/prefer-title-case` and other Store-required rules |

### Tools (Used During Submission)
| Tool | Purpose | When to Use |
|------|---------|-------------|
| `ray lint` | Validates package.json, icons, ESLint, and Prettier | Before every commit; must pass for Store acceptance |
| `ray lint --fix` | Auto-fixes Prettier formatting issues | After code changes |
| `ray build` | Validates extension compiles | Before submission |
| `npx @raycast/api@latest publish` | Creates PR to raycast/extensions repo | Final submission step (user runs manually) |
| `sips` (macOS built-in) | Image cropping and resizing | Icon preparation |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `sips` for icon processing | ImageMagick | sips is built-in on macOS, no install needed |
| Copy LICENSE | Symlink LICENSE | Copy is safer for the raycast/extensions repo PR -- symlinks may break in monorepo context |

## Architecture Patterns

### File Structure Changes
```
raycast-extension/
├── README.md                    # NEW: Store-focused setup guide
├── CHANGELOG.md                 # EXISTING: Needs format update
├── LICENSE                      # NEW: Copy from repo root
├── package.json                 # UPDATE: Add platforms field, fix author
├── package-lock.json            # NEW: Generate via npm install (required by Store)
├── assets/
│   └── icon.png                 # UPDATE: Replace with fox icon
├── metadata/                    # NEW: Screenshots directory
│   ├── firefox-tabs-1.png       # User-captured: Tab search
│   ├── firefox-tabs-2.png       # User-captured: Close tab action
│   └── firefox-tabs-3.png       # User-captured: Setup toast
└── src/
    └── lib/
        └── constants.ts         # NEW: Shared AMO_URL constant
```

### Pattern 1: Shared Constants Module
**What:** Extract shared constants (like AMO_URL) to a dedicated `lib/constants.ts` file
**When to use:** When the same value is used across multiple source files
**Example:**
```typescript
// src/lib/constants.ts
export const AMO_URL =
  "https://addons.mozilla.org/en-US/firefox/addon/raycast-tab-manager-for-firefox/";
```

```typescript
// src/search-tabs.tsx
import { AMO_URL } from "./lib/constants";
// ... use in Action.OpenInBrowser
```

```typescript
// src/setup-bridge.tsx
import { AMO_URL } from "./lib/constants";
// ... use in open(AMO_URL)
```

### Pattern 2: Screenshot Naming Convention
**What:** Screenshots follow `{extension-name}-{N}.png` convention in `metadata/` folder
**When to use:** Always -- this is the Raycast Store standard
**Evidence:** Verified in raycast/extensions repo: `arc-1.png`, `safari-1.png`, `1password-1.png`

For this extension (`name: "firefox-tabs"` in package.json):
- `firefox-tabs-1.png`
- `firefox-tabs-2.png`
- `firefox-tabs-3.png`

### Pattern 3: Store CHANGELOG Format
**What:** CHANGELOG entries use `## [Title] - {date}` format with bullet-point changes
**When to use:** For Raycast Store extensions
**Example (from Arc extension):**
```markdown
# firefox-tabs Changelog

## [Initial Release] - {PR_MERGE_DATE}

- Search and switch open Firefox tabs from Raycast
- Close tabs directly from the action panel
- One-command setup for the native messaging bridge
```

**Important:** The current CHANGELOG.md uses Changesets format (`## 1.1.0` with `### Minor Changes`). This needs to be reformatted to Raycast's expected format with `## [Title] - date` headers. The `{PR_MERGE_DATE}` placeholder is auto-replaced when the PR to raycast/extensions is merged.

### Anti-Patterns to Avoid
- **Using the default Raycast icon:** Automatic rejection. The orange circle placeholder MUST be replaced.
- **Wrong AMO URL in search-tabs.tsx:** Currently `raycast-firefox/` -- must be `raycast-tab-manager-for-firefox/` (the actual AMO slug).
- **Symlinks in extension directory:** The raycast/extensions monorepo copies files; symlinks may not resolve correctly.
- **Committing node_modules or build artifacts to the metadata PR:** Only source files and metadata.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Icon resizing | Custom Node.js image processing | macOS `sips` command | Built-in, zero dependencies, handles PNG natively |
| Screenshot capture | Programmatic screenshot tool | Raycast Window Capture (Cmd+Shift+Alt+M) | Produces exact 2000x1250 Store-ready screenshots |
| ESLint/Prettier compliance | Manual formatting | `ray lint --fix` | Knows Raycast-specific rules |
| Store submission PR | Manual fork + PR | `npx @raycast/api@latest publish` | Handles auth, file packaging, PR creation |

**Key insight:** The Raycast CLI (`ray`) handles most Store compliance validation. Run `ray lint` frequently to catch issues early.

## Common Pitfalls

### Pitfall 1: Author Field Validation (CONFIRMED BLOCKER)
**What goes wrong:** `ray lint` validates the `author` field against the Raycast API (`raycast.com/api/v1/users/{author}`). The current value `stelau` returns 404.
**Why it happens:** The author must be the user's exact Raycast account username, not a GitHub username.
**How to avoid:** Before any other work, the user needs to verify their Raycast username. Open Raycast > Settings > Account to find the exact username, or check `raycast.com/your-username`.
**Warning signs:** `ray lint` fails with "Invalid author" error before checking anything else.
**Impact:** This blocks `ray lint --fix` from running (it bails on the author error before reaching Prettier fixes). Must fix author first.
**Confirmed:** Running `ray lint` in the project produces: `Invalid author "stelau". error: 404 - Not found`.

### Pitfall 2: Icon Dark/Light Theme Compatibility
**What goes wrong:** The source icon (Gemini image) has a dark background. On Raycast's dark theme this looks fine, but on light theme the dark background clashes.
**Why it happens:** The source image was designed as an app icon with dark surround, not specifically for Raycast's transparent-background icon format.
**How to avoid:** Two options: (a) crop tightly to the icon shape and ensure the rounded-rect background works on both themes, or (b) provide an `icon@dark.png` variant if needed. The source image already has a rounded-rect icon shape that may work as-is if cropped precisely to include the rounded-rect border.
**Warning signs:** Icon looks like a dark blob on light Raycast theme.

### Pitfall 3: CHANGELOG Format Mismatch
**What goes wrong:** The Raycast Store expects `## [Title] - date` format. The current CHANGELOG uses Changesets format (`## 1.1.0` / `### Minor Changes`).
**Why it happens:** The project uses Changesets for version management, which generates a different format.
**How to avoid:** Rewrite the CHANGELOG to match Raycast Store conventions before submission. Use `{PR_MERGE_DATE}` for the submission entry; keep existing entries with explicit dates.
**Warning signs:** Version history in the Store shows raw version numbers instead of descriptive titles.

### Pitfall 4: prebuild/predev Scripts Reference project-root.txt
**What goes wrong:** The `prebuild` and `predev` scripts in package.json write `project-root.txt` to assets. This may cause issues in the raycast/extensions monorepo context where the parent directory structure differs.
**Why it happens:** Legacy dev-mode path resolution. Phase 9 added production path resolution that doesn't need this file.
**How to avoid:** Remove or guard these scripts for the Store submission. The production install flow (Phase 12) doesn't rely on project-root.txt. The raycast/extensions build system will run `ray build` which triggers `prebuild`.
**Warning signs:** Build fails in raycast/extensions CI because the parent directory structure differs.

### Pitfall 5: Missing package-lock.json (CONFIRMED GAP)
**What goes wrong:** The Raycast Store requires `package-lock.json` to be committed in the extension directory. Currently `raycast-extension/package-lock.json` does not exist.
**Why it happens:** The project has a root-level `package-lock.json` (monorepo) but no extension-specific one. Dependencies in `raycast-extension/` are installed via the root workspace.
**How to avoid:** Run `cd raycast-extension && npm install` to generate a local `package-lock.json`, then commit it.
**Confirmed:** Verified via `ls` -- no `package-lock.json` exists in `raycast-extension/`. Root has one but extension directory does not.

### Pitfall 6: Prettier Formatting Issues (CONFIRMED)
**What goes wrong:** `ray lint` reports Prettier formatting issues in `installer.ts` and `setup-bridge.tsx`.
**Why it happens:** Files were written without running through Raycast's Prettier configuration.
**How to avoid:** Run `ray lint --fix` after fixing the author field (author validation blocks the fix from running).
**Confirmed:** `ray lint` output shows Prettier errors on these two files.

## Code Examples

### AMO URL Centralization

```typescript
// src/lib/constants.ts
// Single source of truth for the AMO listing URL.
// Both search-tabs.tsx and setup-bridge.tsx import from here.
export const AMO_URL =
  "https://addons.mozilla.org/en-US/firefox/addon/raycast-tab-manager-for-firefox/";
```

### search-tabs.tsx AMO Link Fix (line ~521-525)
```typescript
// BEFORE (wrong URL):
{classifiedError.mode === FailureMode.ExtensionNotInstalled && (
  <Action.OpenInBrowser
    title="Install Webextension"
    url="https://addons.mozilla.org/en-US/firefox/addon/raycast-firefox/"
  />
)}

// AFTER (import from constants, fix title casing):
import { AMO_URL } from "./lib/constants";
// ...
{classifiedError.mode === FailureMode.ExtensionNotInstalled && (
  <Action.OpenInBrowser
    title="Install Firefox Extension"
    url={AMO_URL}
  />
)}
```

### setup-bridge.tsx AMO Import Refactor
```typescript
// BEFORE:
const AMO_URL =
  "https://addons.mozilla.org/en-US/firefox/addon/raycast-tab-manager-for-firefox/";

// AFTER:
import { AMO_URL } from "./lib/constants";
// (remove local const declaration)
```

### package.json Updates
```json
{
  "author": "CORRECT_RAYCAST_USERNAME",
  "platforms": ["macOS"]
}
```

### Icon Crop and Resize (sips commands)
```bash
# Source: 2816x1536 with icon centered in a rounded-rect shape
# The icon with its rounded-rect border is approximately 1100px tall, centered in the image
# Step 1: Crop to the square icon area (center of image)
sips --cropToHeightWidth 1100 1100 --cropOffset 218 858 \
  ~/Downloads/Gemini_Generated_Image_w1tmzww1tmzww1tm.png \
  --out /tmp/icon-cropped.png

# Step 2: Resize to 512x512
sips --resampleHeightWidth 512 512 /tmp/icon-cropped.png \
  --out raycast-extension/assets/icon.png
```
Note: The cropOffset values (Y=218, X=858) are estimates from visual inspection. The icon region in the source image is approximately centered with some extra space around it. Claude should verify by inspecting the crop result before finalizing.

### Store README Template
```markdown
# Firefox Tabs

Search and switch open Firefox tabs from Raycast.

## Setup

1. **Install the Firefox extension** from [Mozilla Add-ons](AMO_URL_PLACEHOLDER)
2. Run the **Setup Firefox Bridge** command in Raycast

That's it -- your tabs will appear in the **Search Firefox Tabs** command.

## Privacy

All communication stays on your machine (localhost). No data is sent to any external server.
```

### CHANGELOG Reformat
```markdown
# firefox-tabs Changelog

## [Added Setup Command and Native Host Bundling] - 2026-03-14

- One-command setup: run "Setup Firefox Bridge" to install everything automatically
- Native host bundled as single file with automatic download from GitHub Releases
- SHA256 verification of downloaded bundles
- 5-level Node.js discovery chain for reliable script execution

## [Initial Release] - {PR_MERGE_DATE}

- Search and switch open Firefox tabs by title or URL
- Close tabs from the action panel
- Container tab indicators with color coding
- Multi-window support with window number badges
- Pinned and active tab indicators
- Favicon display with letter-avatar fallbacks
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Fork raycast/extensions + manual PR | `npx @raycast/api@latest publish` | ~2023 | Automated auth and PR creation |
| No screenshot requirement | Min 3 screenshots at 2000x1250 | Raycast 1.31+ | Required for Store listing |
| `.eslintrc.json` | `eslint.config.js` (flat config) | 2024-2025 | Project uses `.eslintrc.json` which still works with `@raycast/eslint-config` |
| Manual icon design | icon.ray.so generator | 2024 | Online tool, but custom icons work fine |

## Open Questions

1. **Raycast Username (BLOCKER)**
   - What we know: Current `author: "stelau"` fails validation (404 from Raycast API). This blocks `ray lint` from completing.
   - What's unclear: The user's actual Raycast account username.
   - Recommendation: User must check their Raycast account settings (Raycast > Settings > Account) and provide the correct username. This must be resolved before any lint/fix work can proceed. It blocks `ray lint --fix` from running at all.

2. **Icon Light Theme Rendering**
   - What we know: Source image has dark background with a rounded-rect icon shape containing an orange fox over blue tabs. On dark Raycast theme this will look fine.
   - What's unclear: Whether the cropped rounded-rect icon renders acceptably on Raycast's light theme (light background behind dark icon surround).
   - Recommendation: Crop the icon, visually inspect on both themes. If light theme is problematic, consider: (a) providing a separate `icon@dark.png` (the dark version) and a lighter `icon.png` for light theme, or (b) using icon.ray.so to generate a Store-style icon from the fox motif. The `@dark` suffix convention is supported by Raycast for theme-specific icon variants.

3. **prebuild/predev Scripts in Monorepo Context**
   - What we know: `prebuild` writes `project-root.txt` using `cd .. && pwd`. In raycast/extensions monorepo, the parent directory is `extensions/`, not the project root. The script would produce an incorrect path.
   - What's unclear: Whether the raycast/extensions build pipeline runs npm lifecycle scripts.
   - Recommendation: Remove or no-op `prebuild` and `predev` scripts. Production path resolution (Phase 9+12) does not use `project-root.txt`. Keep `predev` for local development only if needed, but `prebuild` should be removed to avoid monorepo build issues.

## Sources

### Primary (HIGH confidence)
- [Raycast "Prepare for Store" docs](https://developers.raycast.com/basics/prepare-an-extension-for-store) - Full submission requirements including icon, screenshots, README, CHANGELOG, ESLint
- [Raycast Manifest docs](https://developers.raycast.com/information/manifest) - package.json schema including platforms field, author, categories
- [Raycast "Publish" docs](https://developers.raycast.com/basics/publish-an-extension) - Publishing process via `npm run publish`
- [raycast/extensions GitHub repo](https://github.com/raycast/extensions) - Verified screenshot naming conventions (arc, safari, 1password metadata folders), CHANGELOG format (Arc extension), package.json structure
- Local `ray lint` output - Confirmed author validation failure, Prettier issues on installer.ts and setup-bridge.tsx

### Secondary (MEDIUM confidence)
- [Raycast File Structure docs](https://developers.raycast.com/information/file-structure) - Directory layout conventions
- [Raycast Versioning docs](https://developers.raycast.com/information/versioning) - CHANGELOG format with `{PR_MERGE_DATE}`
- [raycast/extensions-template](https://github.com/raycast/extensions-template) - Alternative publishing workflow for private extensions (not used here, but confirms process)

### Tertiary (LOW confidence)
- Icon crop coordinates for source image - Estimated from visual inspection of 2816x1536 image; needs validation during execution

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All tools and requirements verified against official Raycast docs and real Store extensions
- Architecture: HIGH - File structure and naming conventions verified against arc, safari, 1password extensions in raycast/extensions repo
- Pitfalls: HIGH - Author validation failure, Prettier issues, and missing package-lock.json all confirmed by running actual commands
- Code examples: HIGH - AMO URL locations verified via grep; import patterns match existing project conventions

**Research date:** 2026-03-14
**Valid until:** 2026-04-14 (Raycast Store requirements are stable)
