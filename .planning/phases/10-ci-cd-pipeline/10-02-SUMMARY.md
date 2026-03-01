---
phase: 10-ci-cd-pipeline
plan: 02
subsystem: infra
tags: [github-actions, changesets, github-releases, sha256, ci-cd]

# Dependency graph
requires:
  - phase: 10-01
    provides: npm workspaces, changesets config, CI workflow foundation
provides:
  - GitHub Actions release workflow with changesets versioning + GitHub Release creation
  - Automated native-host asset upload (host.bundle.js, run.sh, SHA256SUMS.txt)
  - SHA256 checksum generation with round-trip verification
affects: [11-raycast-store-distribution, 12-amo-listing]

# Tech tracking
tech-stack:
  added: [changesets/action@v1, softprops/action-gh-release@v2]
  patterns: [ci-gate-before-release, fallback-tag-detection, sha256-round-trip-verify]

key-files:
  created:
    - .github/workflows/release.yml
  modified: []

key-decisions:
  - "createGithubReleases: false because changesets built-in release creation does not work for private packages"
  - "Fallback tag detection (git tag --points-at HEAD) covers uncertainty about changesets published output for private-package-only repos"
  - "shasum -a 256 used instead of sha256sum for macOS runner compatibility"
  - "Post-release verification via gh release view ensures silent failures are caught"

patterns-established:
  - "Release assets use generic filenames (host.bundle.js, run.sh) not versioned names"
  - "CI gate job duplicated in release workflow since ci.yml only runs on PRs"
  - "Concurrency group without cancel-in-progress to avoid aborting in-progress releases"

requirements-completed: [CICD-03]

# Metrics
duration: 2min
completed: 2026-02-27
---

# Phase 10 Plan 02: Release Workflow Summary

**GitHub Actions release workflow with changesets versioning, fallback tag detection for private packages, and native-host asset upload with SHA256 round-trip verification**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-27T19:53:56Z
- **Completed:** 2026-02-27T19:55:31Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Release workflow with two jobs: `ci` (build+lint gate) and `release` (needs ci) ensuring build passes before any release
- Changesets action with `createGithubReleases: false` and custom GitHub Release creation via softprops/action-gh-release@v2
- Fallback tag detection for private-package-only repos where changesets `published` output may not fire
- SHA256 checksum generation with round-trip verification before asset upload
- Post-release verification step that fails the workflow if release creation silently fails

## Task Commits

Each task was committed atomically:

1. **Task 1: Create release workflow with changesets and GitHub Release creation** - `edf6b29` (feat)

## Files Created/Modified
- `.github/workflows/release.yml` - Complete release workflow with ci gate, changesets, fallback tag detection, SHA256 checksums, and GitHub Release creation

## Decisions Made
- **createGithubReleases: false:** The changesets built-in GitHub Release creation silently produces nothing for private packages. We handle release creation ourselves with softprops/action-gh-release.
- **Fallback tag detection:** Since it is uncertain whether `changesets/action` sets `published: true` for private-package-only repos, a fallback checks for `native-host@*` tags on HEAD.
- **shasum -a 256 over sha256sum:** The macOS runner has `shasum` built-in; `sha256sum` is a Linux tool not available on macOS by default.
- **Post-release verification:** The `gh release view` step ensures silent release failures are caught and cause the workflow to fail visibly.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required. The workflow uses the built-in GITHUB_TOKEN secret.

## Next Phase Readiness
- Release workflow is ready to automate native-host releases when changesets are merged
- Phase 11 can consume GitHub Release assets for the install flow
- The workflow will create releases tagged as `native-host@{version}` with downloadable assets

## Self-Check: PASSED

All files verified present. Task commit edf6b29 confirmed in git log.

---
*Phase: 10-ci-cd-pipeline*
*Completed: 2026-02-27*
