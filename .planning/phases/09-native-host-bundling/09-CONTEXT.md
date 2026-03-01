# Phase 9: Native Host Bundling - Context

**Gathered:** 2026-02-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Bundle the native host into a single distributable JS file (esbuild, all deps inlined), replace pino-roll with sync logging, create a shell wrapper with Node.js discovery, and eliminate the project-root.txt dependency so the Raycast extension works outside a git checkout.

</domain>

<decisions>
## Implementation Decisions

### Native host discovery
- Dual mode: extension checks dev path first, then installed bundle path
- Dev path: if `project-root.txt` exists, use it (preserves current development workflow)
- Production path: `~/.raycast-firefox/bin/` (hardcoded, not configurable)
- Priority: dev path wins when both exist — developers always test local changes
- When neither found: error guides user to run the setup command (Phase 11)

### Build artifact layout
- Output directory: `native-host/dist/` (gitignored)
- Build command: `npm run build` in `native-host/package.json`
- dist/ contains both `host.bundle.js` and `run.sh` (wrapper script) — everything CI/CD needs in one place
- esbuild added as devDependency in `native-host/package.json`

### Wrapper failure UX
- No Node.js found: log error to `~/.raycast-firefox/logs/` listing all paths checked, exit non-zero
- Minimum Node.js version check (>=18) before launching bundle; log clear error if too old
- Bundle crash at runtime: log crash + exit code, let Raycast extension's error handling take it from there (no restart attempts)
- On success: always log which Node.js was discovered, its path, and version — invaluable for debugging user issues

### Claude's Discretion
- esbuild configuration details (target, platform, format)
- Exact minimum Node.js version threshold
- Sync pino logging implementation approach
- Log file rotation/naming within ~/.raycast-firefox/logs/

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 09-native-host-bundling*
*Context gathered: 2026-02-27*
