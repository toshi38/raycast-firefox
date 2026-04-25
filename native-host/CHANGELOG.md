# raycast-firefox-native-host

## 1.1.1

### Patch Changes

- [#8](https://github.com/toshi38/raycast-firefox/pull/8) [`9a61f84`](https://github.com/toshi38/raycast-firefox/commit/9a61f84de865ef59b12045d1076a03cde6e14e18) Thanks [@toshi38](https://github.com/toshi38)! - Add Node.js symlink priority to run.sh discovery chain

  The wrapper script now checks `~/.raycast-firefox/node` as Priority 0 before scanning for Raycast bundled, Homebrew, nvm, or system Node.js. This symlink is created by the Raycast setup command and provides deterministic, fast Node.js discovery.

## 1.1.0

### Minor Changes

- [#1](https://github.com/toshi38/raycast-firefox/pull/1) [`acc7f4b`](https://github.com/toshi38/raycast-firefox/commit/acc7f4bb2d279d17f015bf4b0a089fdf2b4a5d43) Thanks [@toshi38](https://github.com/toshi38)! - Bundle native host into a single distributable JS file

  - Replace pino-roll worker-thread logging with sync pino.destination for bundle compatibility
  - Add startup-time log rotation (5MB threshold, 5 rotated files)
  - Create esbuild build producing single-file bundle (160KB) with all dependencies inlined
  - Rewrite shell wrapper with 5-level Node.js discovery priority chain (Raycast bundled, Homebrew ARM/Intel, nvm, system PATH)
  - Add dual-mode path resolution: dev (project-root.txt) and production (~/.raycast-firefox/bin/run.sh)
  - Fix action title casing to follow Raycast guidelines

### Patch Changes

- [#1](https://github.com/toshi38/raycast-firefox/pull/1) [`acc7f4b`](https://github.com/toshi38/raycast-firefox/commit/acc7f4bb2d279d17f015bf4b0a089fdf2b4a5d43) Thanks [@toshi38](https://github.com/toshi38)! - Add CI/CD pipeline for automated releases

  - Set up npm workspaces monorepo linking all three components
  - Configure Changesets for versioning with private package tagging
  - Add GitHub Actions CI workflow validating native-host build and Firefox extension lint on PRs
  - Add release workflow that builds, checksums (SHA256), and publishes native host bundle as GitHub Release assets
