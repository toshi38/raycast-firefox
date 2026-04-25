# Phase 13: Raycast Store Submission - Context

**Gathered:** 2026-03-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Get the Raycast extension listed in the Raycast Store with all required metadata. Includes store README, icon, screenshots structure, ESLint compliance, license, platform flag, changelog, and centralizing the AMO URL constant. The actual AMO listing URL and Raycast Store URL are not finalized yet — use placeholders where needed and update post-submission.

</domain>

<decisions>
## Implementation Decisions

### Store README (raycast-extension/README.md)
- Short, store-focused: 1-line description, setup steps, privacy note
- Skip architecture/permissions sections — store users just want to get going
- Setup steps reference Firefox extension install (AMO) + "Setup Firefox Bridge" command
- Use placeholder links for both AMO URL and Raycast Store URL — neither is finalized yet
- Repo-level README stays as-is; link updates are a post-submission todo

### Screenshots
- 3 screenshots at 2000x1250 in `raycast-extension/metadata/` folder
- Screens: (1) Tab search with curated tabs, (2) Close tab action panel, (3) Setup toast flow
- User will capture manually and place files; Claude sets up the folder structure and naming

### Icon
- Replace the orange circle placeholder with the Gemini-generated fox icon
- Source file: `~/Downloads/Gemini_Generated_Image_w1tmzww1tmzww1tm.png` (2816x1536)
- Claude crops to the icon area and resizes to 512x512 using macOS sips during execution
- Must render acceptably on both light and dark Raycast themes

### AMO URL centralization
- Extract `AMO_URL` into a shared constant in `lib/constants.ts`
- Both `search-tabs.tsx` and `setup-bridge.tsx` import from there (single source of truth)
- Fix the old/wrong URL in `search-tabs.tsx` (`/raycast-firefox/` → matches setup-bridge's URL)
- AMO link action only on `ExtensionNotInstalled` error state (keep current behavior, just fix the URL)

### Package.json updates
- Add `platforms: ["macOS"]` (STORE-06)
- Verify icon reference points to updated icon.png

### ESLint compliance
- Run `ray lint` and fix any `@raycast/prefer-title-case` or other violations (STORE-07)

### License
- MIT license must be present in `raycast-extension/` (STORE-08) — repo root has one, may need copy or reference

### CHANGELOG
- Already exists with v1.1.0 entry — verify it's up to date (STORE-05)

### Claude's Discretion
- Exact README wording and structure
- Icon cropping coordinates (center on the fox icon area)
- metadata/ folder file naming convention
- ESLint fix details
- Whether to copy LICENSE into raycast-extension/ or symlink

</decisions>

<specifics>
## Specific Ideas

- Store README should be minimal — "just get it working" focus, not a project docs page
- Curated tabs for screenshot: recognizable sites (GitHub, MDN, YouTube, etc.) for professional look
- Icon source is the same design as the Firefox extension icon (fox + tab motifs)
- Post-submission todo: update repo README placeholders and AMO listing with final Store URL

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `setup-bridge.tsx`: Already has `AMO_URL` constant — will be moved to shared location
- `assets/icon.png`: 512x512 PNG placeholder (orange circle) — to be replaced
- `assets/firefox-icon.png`: Firefox icon used for about: pages in tab list
- `CHANGELOG.md`: Exists with v1.1.0 entry
- `/LICENSE`: MIT license at repo root

### Established Patterns
- `lib/` directory for shared code (errors.ts, setup.ts, installer.ts)
- No-view command pattern in setup-bridge.tsx
- Error classification with action buttons in search-tabs.tsx

### Integration Points
- `package.json`: Add `platforms` field, verify icon reference
- `search-tabs.tsx:522-524`: Old AMO URL needs fixing → import from new constants
- `setup-bridge.tsx:21-22`: AMO_URL constant → move to lib/constants.ts
- `metadata/`: New directory for screenshots (Raycast Store convention)

</code_context>

<deferred>
## Deferred Ideas

- Update repo README placeholder links with final AMO URL and Raycast Store URL (post-submission)
- Update AMO listing description to link to Raycast Store URL (captured from Phase 11 deferred)

</deferred>

---

*Phase: 13-raycast-store-submission*
*Context gathered: 2026-03-14*
