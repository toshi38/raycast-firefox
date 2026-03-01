---
phase: 10-ci-cd-pipeline
plan: 01
subsystem: infra
tags: [npm-workspaces, changesets, github-actions, ci, monorepo]

# Dependency graph
requires:
  - phase: 09-native-host-bundling
    provides: esbuild build config and native-host bundle target
provides:
  - npm workspaces monorepo structure linking all three components
  - Changesets versioning config with private package tagging
  - CI workflow validating native-host build and Firefox extension lint on PRs
  - Root package-lock.json for deterministic CI installs
affects: [10-02-release-workflow, 11-raycast-store, 12-amo-listing]

# Tech tracking
tech-stack:
  added: ["@changesets/cli ^2.29", "@changesets/changelog-github ^0.5", "GitHub Actions"]
  patterns: [npm workspaces monorepo, PR-only CI with release-workflow handling main push]

key-files:
  created:
    - package.json
    - package-lock.json
    - .changeset/config.json
    - .changeset/README.md
    - .github/workflows/ci.yml
  modified:
    - .gitignore

key-decisions:
  - "PR-only CI trigger: release workflow (10-02) handles main-push CI as prerequisite job, avoiding redundant runs"
  - "Raycast extension CI steps disabled with if:false pending ray CLI availability on GitHub Actions runners"
  - "privatePackages.tag=true enables git tag creation on changeset publish for release automation"
  - "Concurrency group cancels in-progress CI runs for same PR to save runner minutes"

patterns-established:
  - "Workspace commands via npm run <script> --workspace=<name> from root"
  - "Root lockfile governs all dependencies; per-workspace lockfiles removed"
  - "CI validates build artifacts exist (test -f) not just build exit code"

requirements-completed: [CICD-01, CICD-02]

# Metrics
duration: 2min
completed: 2026-02-27
---

# Phase 10 Plan 01: Workspace & CI Foundation Summary

**npm workspaces monorepo with Changesets versioning and GitHub Actions CI validating native-host build + Firefox extension lint on PRs**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-27T19:49:12Z
- **Completed:** 2026-02-27T19:51:40Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Root package.json declaring all three workspaces (extension, native-host, raycast-extension) with hoisted dependencies
- Changesets config with privatePackages.tag=true for automated git tag creation on publish
- CI workflow on macos-latest validating native-host bundle build and Firefox extension lint on every PR
- Consolidated from three per-workspace lockfiles to single root lockfile for deterministic installs

## Task Commits

Each task was committed atomically:

1. **Task 1: Create root workspace package.json, changesets config, and update gitignore** - `0d6b4e3` (feat)
2. **Task 2: Create CI workflow for PRs and main pushes** - `bf0f4a5` (feat)

## Files Created/Modified
- `package.json` - Root workspace declaration linking all three components
- `package-lock.json` - Consolidated root lockfile for npm ci in CI
- `.changeset/config.json` - Changesets monorepo config with privatePackages.tag=true
- `.changeset/README.md` - Standard changesets directory explanation
- `.github/workflows/ci.yml` - GitHub Actions CI workflow for PR validation
- `.gitignore` - Added root node_modules pattern
- `extension/package-lock.json` - Deleted (replaced by root lockfile)
- `native-host/package-lock.json` - Deleted (replaced by root lockfile)
- `raycast-extension/package-lock.json` - Deleted (replaced by root lockfile)

## Decisions Made
- **PR-only CI trigger:** The release workflow (10-02) will handle main-push CI as a prerequisite job (`needs: [ci]`), so having CI also trigger on main push would be redundant and would not gate releases.
- **Raycast extension steps disabled:** The `ray` CLI is only available via the Raycast desktop app, not on GitHub Actions runners. Steps wrapped with `if: false` until availability is confirmed.
- **privatePackages.tag=true:** Required for changeset publish to create git tags like `native-host@1.0.0`, which the release workflow depends on.
- **Concurrency group:** Added `cancel-in-progress: true` to avoid wasting runner minutes on superseded PR pushes.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Workspace monorepo is functional -- `npm ci` from root installs all dependencies
- Changesets initialized and ready for `changeset add` when changes are made
- CI workflow ready to validate PRs once pushed to GitHub
- Foundation set for Plan 02 (release workflow) which will reference this CI job

## Self-Check: PASSED

All files verified present. Both task commits confirmed in git log.

---
*Phase: 10-ci-cd-pipeline*
*Completed: 2026-02-27*
