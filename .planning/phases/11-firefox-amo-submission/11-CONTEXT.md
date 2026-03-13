# Phase 11: Firefox AMO Submission - Context

**Gathered:** 2026-03-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Get the Firefox extension publicly listed and signed on addons.mozilla.org. This includes manifest compliance changes (naming, data_collection_permissions), web-ext tooling setup, a GitHub repo README, and manual submission through the AMO Developer Hub. The Raycast install flow (Phase 12) and Raycast Store listing (Phase 13) are separate phases.

</domain>

<decisions>
## Implementation Decisions

### Extension display name
- Rename from "Raycast Firefox" to "Raycast Tab Manager for Firefox" (AMO-compliant format)
- Extension ID stays `raycast-firefox@lau.engineering` (never change)

### Data collection permissions
- Declare `data_collection_permissions: { required: ["none"] }` — data never leaves the local machine
- If AMO reviewers reject "none", fallback to `{ required: ["browsingActivity"] }` and resubmit
- Field goes under `browser_specific_settings.gecko` (not top-level)

### AMO listing content
- Functional + setup description: what it does, permissions explained, setup link, privacy note
- Category: "Tabs"
- Detailed reviewer notes explaining the full architecture chain: Raycast → native host → Firefox extension
- Explain why each permission is needed (tabs, nativeMessaging, contextualIdentities, cookies)
- Explain why data_collection is "none" (all communication is local)
- Link to public source code: https://github.com/toshi38/raycast-firefox

### Raycast Store link (LINK-01)
- Initial AMO listing links to GitHub repo (not Raycast Store — Phase 13 doesn't exist yet)
- After Phase 13 ships, update AMO description to swap GitHub link for Raycast Store URL
- Capture the link update as a Phase 13 task

### GitHub repo README
- Add a README to the raycast-firefox repo with setup instructions before AMO submission
- README serves as the setup reference linked from the AMO listing

### License
- Add MIT license file to the repo root
- Reference MIT in the AMO listing metadata

### web-ext tooling
- Upgrade web-ext from ^9.0.0 to ^9.4.0
- Add web-ext lint to CI workflow (catches manifest regressions on every PR)
- Only add .web-ext-config.json for file exclusions if build inspection reveals unwanted files in the .zip
- Submission is manual via AMO Developer Hub web UI (not CLI)

### Claude's Discretion
- Exact README content and structure
- AMO listing description wording (following the functional + setup template from research)
- Reviewer notes wording (following the detailed architecture template from research)
- Whether to add .web-ext-config.json after inspecting build output
- web-ext lint CI step configuration details

</decisions>

<specifics>
## Specific Ideas

- User wants a GitHub README with setup instructions created before the AMO submission — the AMO listing links there as the setup reference
- Description template from research covers: what it does, how it works, setup link, permissions explained, privacy note
- Reviewer notes template from research covers: full architecture diagram (Raycast → localhost:26394 → native host → native messaging → extension → browser.tabs), permission justifications, data_collection rationale

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `extension/manifest.json`: Current manifest needs name change and data_collection_permissions addition; 128x128 icon already added
- `extension/package.json`: Already has lint, build, start scripts via web-ext; needs version bump to ^9.4.0
- `extension/background.js`: Simple, functional — no changes needed for AMO submission

### Established Patterns
- web-ext lint/build scripts already configured as npm scripts
- CI workflow exists at `.github/workflows/` — add extension lint step there

### Integration Points
- CI workflow: add `npm run lint` step for extension directory
- LINK-01: AMO listing description → GitHub repo README (interim) → Raycast Store URL (after Phase 13)
- Phase 13: will need to update AMO listing with Raycast Store URL

</code_context>

<deferred>
## Deferred Ideas

- Automated AMO submission via `web-ext sign` in CI (DIST-02 — future requirement)
- Update AMO listing with Raycast Store URL after Phase 13 completes (capture as Phase 13 task)

</deferred>

---

*Phase: 11-firefox-amo-submission*
*Context gathered: 2026-03-09*
