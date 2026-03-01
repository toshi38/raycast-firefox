---
"raycast-firefox-native-host": minor
"firefox-tabs": minor
---

Bundle native host into a single distributable JS file

- Replace pino-roll worker-thread logging with sync pino.destination for bundle compatibility
- Add startup-time log rotation (5MB threshold, 5 rotated files)
- Create esbuild build producing single-file bundle (160KB) with all dependencies inlined
- Rewrite shell wrapper with 5-level Node.js discovery priority chain (Raycast bundled, Homebrew ARM/Intel, nvm, system PATH)
- Add dual-mode path resolution: dev (project-root.txt) and production (~/.raycast-firefox/bin/run.sh)
- Fix action title casing to follow Raycast guidelines
