---
phase: 12
slug: raycast-install-flow
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-14
---

# Phase 12 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Manual testing + TypeScript compilation (no automated test framework for Raycast extension) |
| **Config file** | `raycast-extension/tsconfig.json` |
| **Quick run command** | `cd raycast-extension && npm run build` |
| **Full suite command** | Manual: run setup command in Raycast, verify full chain |
| **Estimated runtime** | ~5 seconds (build), ~60 seconds (manual chain) |

---

## Sampling Rate

- **After every task commit:** Run `cd raycast-extension && npm run build`
- **After every plan wave:** Manual end-to-end: clean install on fresh `~/.raycast-firefox/` directory
- **Before `/gsd:verify-work`:** Full chain verification: Raycast -> native host -> Firefox extension, including second-run idempotency
- **Max feedback latency:** 5 seconds (build check)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 12-01-01 | 01 | 1 | INST-01 | integration / manual | `cd raycast-extension && npm run build` | ✅ | ⬜ pending |
| 12-01-02 | 01 | 1 | INST-02 | integration / manual | `cd raycast-extension && npm run build` | ✅ | ⬜ pending |
| 12-01-03 | 01 | 1 | INST-03 | unit | `node -e "require('./src/lib/installer').verifySha256(...)"` | ❌ W0 | ⬜ pending |
| 12-01-04 | 01 | 1 | INST-04 | integration / manual | `ls -la ~/.raycast-firefox/bin/` after setup | N/A | ⬜ pending |
| 12-01-05 | 01 | 1 | INST-05 | integration / manual | `cat ~/Library/Application\ Support/Mozilla/NativeMessagingHosts/raycast_firefox.json` | N/A | ⬜ pending |
| 12-01-06 | 01 | 1 | INST-06 | integration / manual | `ls -la ~/.raycast-firefox/node` after setup | N/A | ⬜ pending |
| 12-02-01 | 02 | 2 | INST-07 | e2e / manual | Manual: run setup with Firefox + extension running | N/A | ⬜ pending |
| 12-02-02 | 02 | 2 | INST-08 | integration / manual | `cat ~/.raycast-firefox/bin/version.txt` after setup | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] SHA256 verification logic should be testable standalone — extract to pure function
- [ ] TypeScript compilation (`npm run build`) serves as primary automated validation

*No additional test framework install needed — TypeScript build is the automated gate.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Setup installs without cloning repo | INST-01 | Requires Raycast runtime + user interaction | Remove `~/.raycast-firefox/bin/`, run setup command in Raycast |
| Downloads from GitHub Releases | INST-02 | Requires network + Raycast runtime | Monitor network, run setup, verify download URL |
| Extracts to correct path | INST-04 | Requires Raycast runtime for full flow | Run setup, check `ls -la ~/.raycast-firefox/bin/` |
| Registers native messaging manifest | INST-05 | Requires Raycast runtime | Run setup, check manifest file exists and content |
| Creates Node.js symlink | INST-06 | Requires Raycast runtime for `process.execPath` | Run setup, check `ls -la ~/.raycast-firefox/node` |
| Full chain verification | INST-07 | Requires Firefox + extension + Raycast running | Run setup, then search tabs via Raycast |
| Second-run idempotency | INST-01 | Requires full install first | Run setup twice, verify no errors on second run |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
