---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Store Publishing & Distribution
current_plan: 12-01 (TBD)
status: executing
stopped_at: Completed 11-02-PLAN.md
last_updated: "2026-03-14T09:10:05.351Z"
last_activity: 2026-03-14 — Phase 11-02 AMO submission complete
progress:
  total_phases: 5
  completed_phases: 3
  total_plans: 6
  completed_plans: 6
  percent: 60
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-24)

**Core value:** Quickly find and switch to any open Firefox tab without leaving the keyboard
**Current focus:** Phase 12 — Raycast Install Flow (Phase 11 AMO submission complete)

## Current Position

Phase: 12 of 13 (Raycast Install Flow) — Phase 11 complete (2/2 plans)
Current Plan: 12-01 (TBD)
Status: Phase 11 complete, extension listed on AMO, ready for Phase 12
Last activity: 2026-03-14 — Phase 11-02 AMO submission complete

Progress: [██████░░░░] 60% (v1.1)

## Performance Metrics

**Velocity (v1.0):**
- Total plans completed: 16
- Average duration: 5.5min
- Total execution time: 1.48 hours

**Velocity (v1.1):**
- Total plans completed: 6
- Average duration: 2.7min
- Total execution time: 16min

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [v1.1 roadmap]: INST-09 (eliminate project-root.txt) assigned to Phase 9 bundling — it's the architectural decoupling that enables all distribution work
- [v1.1 roadmap]: Phase 11 (AMO) depends only on Phase 9 — can start immediately, submit early to parallelize review wait time
- [09-02]: Raycast bundled Node.js gets highest priority in discovery chain
- [09-02]: Version check rejects Node.js < 18 with logging rather than silent failure
- [09-02]: Production path ~/.raycast-firefox/bin/run.sh hardcoded as module-level constant
- [Phase 09]: Sync pino.destination replaces pino-roll worker threads for bundle compatibility
- [Phase 09]: Log rotation runs at startup only (not per-write) for simplicity
- [Phase 09]: Bundle kept unminified (160KB) for debuggability
- [10-01]: PR-only CI trigger; release workflow (10-02) handles main-push CI as prerequisite job
- [10-01]: Raycast extension CI steps disabled pending ray CLI availability on GitHub Actions runners
- [10-01]: privatePackages.tag=true for changeset publish git tag creation
- [10-02]: shasum -a 256 used instead of sha256sum for macOS runner compatibility
- [10-02]: Post-release verification via gh release view ensures silent failures are caught
- [audit]: CD workflow releases directly on merge to main — no intermediate Version Packages PR
- [audit]: Node.js 22 required in CI (raycast/api engine requirement)
- [audit]: Changesets track both native-host and raycast-extension (firefox-tabs) for changelog generation
- [audit]: First release: native-host@1.1.0 with host.bundle.js, run.sh, SHA256SUMS.txt
- [11-01]: web-ext-config.cjs (CommonJS) used for ignoreFiles since web-ext requires CJS config format
- [11-01]: Extension zip glob pattern in release.yml for version-agnostic asset attachment
- [Phase 11]: Extension listed as 'Raycast Tab Manager' on AMO (shortened from manifest name due to AMO char limits)
- [Phase 11]: AMO listing URL: https://addons.mozilla.org/en-US/firefox/addon/raycast-tab-manager-for-firefox/
- [Phase 11]: Submitted as version 1.0.2 via extension@1.0.2 GitHub release zip

### Pending Todos

None.

### Blockers/Concerns

- Raycast binary download policy ambiguity: bundle in assets/ vs. download from GitHub Releases (resolve during Phase 12 planning)

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 1 | Fix invalid settings in .claude/settings.local.json | 2026-02-13 | e1eb1e9 | [1-fix-invalid-settings-in-claude-settings-](./quick/1-fix-invalid-settings-in-claude-settings-/) |

## Session Continuity

Last session: 2026-03-14T09:10:05.349Z
Stopped at: Completed 11-02-PLAN.md
Resume file: .planning/phases/11-firefox-amo-submission/11-02-SUMMARY.md
