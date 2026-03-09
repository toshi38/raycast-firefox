# firefox-tabs

## 1.1.0

### Minor Changes

- [#1](https://github.com/toshi38/raycast-firefox/pull/1) [`acc7f4b`](https://github.com/toshi38/raycast-firefox/commit/acc7f4bb2d279d17f015bf4b0a089fdf2b4a5d43) Thanks [@toshi38](https://github.com/toshi38)! - Bundle native host into a single distributable JS file

  - Replace pino-roll worker-thread logging with sync pino.destination for bundle compatibility
  - Add startup-time log rotation (5MB threshold, 5 rotated files)
  - Create esbuild build producing single-file bundle (160KB) with all dependencies inlined
  - Rewrite shell wrapper with 5-level Node.js discovery priority chain (Raycast bundled, Homebrew ARM/Intel, nvm, system PATH)
  - Add dual-mode path resolution: dev (project-root.txt) and production (~/.raycast-firefox/bin/run.sh)
  - Fix action title casing to follow Raycast guidelines
