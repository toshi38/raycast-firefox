---
phase: 11
slug: firefox-amo-submission
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-09
---

# Phase 11 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Manual validation + web-ext lint (no automated test framework for Firefox extension) |
| **Config file** | `extension/package.json` (scripts section) |
| **Quick run command** | `cd extension && npm run lint` |
| **Full suite command** | `cd extension && npm run lint && npm run build && unzip -l web-ext-artifacts/*.zip` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd extension && npm run lint`
- **After every plan wave:** Run `cd extension && npm run lint && npm run build`
- **Before `/gsd:verify-work`:** Full suite must be green + AMO listing URL accessible
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 11-01-01 | 01 | 1 | AMO-02 | automated | `cd extension && npm run lint` | ✅ | ⬜ pending |
| 11-01-02 | 01 | 1 | AMO-03 | automated | `cd extension && npm run lint` | ✅ | ⬜ pending |
| 11-01-03 | 01 | 1 | AMO-04 | automated | `cd extension && npx web-ext --version` | ✅ | ⬜ pending |
| 11-02-01 | 02 | 1 | LINK-01 | manual | Visual inspection of README content | N/A | ⬜ pending |
| 11-03-01 | 03 | 2 | AMO-01 | manual | Manual: submit via AMO Developer Hub | N/A | ⬜ pending |
| 11-03-02 | 03 | 2 | LINK-01 | manual | Visual inspection of AMO listing description | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. `web-ext` is already installed as a dev dependency in `extension/package.json` with lint and build scripts configured.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Extension listed on AMO | AMO-01 | Requires manual web UI submission to AMO Developer Hub | 1. Build zip with `npm run build` 2. Upload to AMO Developer Hub 3. Verify listing URL is accessible |
| AMO listing links to setup instructions | LINK-01 | Content in AMO listing description field | 1. Check AMO listing description contains GitHub repo link (interim) 2. After Phase 13: verify Raycast Store URL |
| Display name AMO-compliant | AMO-03 | Policy compliance check | 1. Verify manifest name is "Raycast Tab Manager for Firefox" 2. Confirm AMO listing shows compliant name |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
