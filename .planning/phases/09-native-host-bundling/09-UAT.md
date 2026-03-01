---
status: complete
phase: 09-native-host-bundling
source: [09-01-SUMMARY.md, 09-02-SUMMARY.md]
started: 2026-02-27T14:10:00Z
updated: 2026-02-27T14:25:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Build produces single-file bundle
expected: Run `cd native-host && npm run build`. esbuild produces `dist/host.bundle.js` (~160KB) and copies `run.sh` to `dist/`. Bundle analysis prints showing inlined modules (pino, sonic-boom, etc.).
result: pass

### 2. Bundle runs without module errors
expected: Run `cd native-host && node -e "require('./dist/host.bundle.js')" 2>&1; true`. It should NOT show "Cannot find module" or "require is not defined" errors.
result: pass

### 3. Sync logging writes to host.log
expected: Run `cd native-host && node -e "const {logger} = require('./src/logger'); logger.info({msg: 'UAT test'}); process.exit(0);"` then check `cat ~/.raycast-firefox/logs/host.log | tail -1`. The last line should be a JSON log entry containing "UAT test".
result: pass

### 4. Shell wrapper discovers Node.js and logs selection
expected: Run `cd native-host && bash run.sh 2>/dev/null; true` then check `cat ~/.raycast-firefox/logs/wrapper.log | tail -3`. The wrapper log should show which Node.js was selected (e.g., "Using Raycast bundled" or "Using Homebrew ARM"), the path, and version.
result: pass

### 5. pino-roll fully removed
expected: Run `grep -r "pino-roll" native-host/package.json native-host/src/`. No matches should appear — pino-roll is completely removed from dependencies and source code.
result: pass

### 6. Raycast tab search still works end-to-end
expected: Open Raycast, run "Search Firefox Tabs". With Firefox running, tab list appears. Selecting a tab switches to it in Firefox. This confirms the new logger and wrapper don't break the existing flow.
result: pass

## Summary

total: 6
passed: 6
issues: 0
pending: 0
skipped: 0

## Gaps

[none yet]
