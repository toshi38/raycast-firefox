---
phase: quick
plan: 1
type: execute
wave: 1
depends_on: []
files_modified: [".claude/settings.local.json"]
autonomous: true
must_haves:
  truths:
    - "settings.local.json is valid JSON with no embedded verification reports"
    - "All legitimate permission entries are preserved"
  artifacts:
    - path: ".claude/settings.local.json"
      provides: "Claude Code local permissions"
      contains: "permissions"
  key_links: []
---

<objective>
Remove the invalid `Bash(...)` permission entry from `.claude/settings.local.json` that contains an entire verification report embedded as a shell heredoc.

Purpose: The settings file has a corrupted entry on line 31 — a `Bash(...)` permission that embeds hundreds of lines of the Phase 02 VERIFICATION.md content. This bloats the file and is not a valid permission rule.

Output: Clean `settings.local.json` with only legitimate permission entries.
</objective>

<execution_context>
@/Users/stephen/.claude/get-shit-done/workflows/execute-plan.md
@/Users/stephen/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.claude/settings.local.json
</context>

<tasks>

<task type="auto">
  <name>Task 1: Remove invalid permission entry from settings.local.json</name>
  <files>.claude/settings.local.json</files>
  <action>
Read `.claude/settings.local.json` and parse the `permissions.allow` array. Remove the single entry that starts with `"Bash(/Users/stephen/code/raycast-firefox/.planning/phases/02-native-messaging-bridge/02-VERIFICATION.md << 'EOF'"` — this is the corrupted entry containing an entire verification report embedded in a permission rule.

Keep ALL other entries in the `permissions.allow` array exactly as they are. The valid entries include things like `Bash(npm view:*)`, `Bash(git add:*)`, `Bash(npx tsc:*)`, etc.

Also keep the `permissions.deny` array completely unchanged.

After editing, validate that the file is valid JSON by running `python3 -m json.tool .claude/settings.local.json`.
  </action>
  <verify>
1. `python3 -m json.tool .claude/settings.local.json` succeeds (valid JSON)
2. `python3 -c "import json; d=json.load(open('.claude/settings.local.json')); entries=d['permissions']['allow']; assert not any('VERIFICATION' in e for e in entries), 'Still has bad entry'; assert 'Bash(npm view:*)' in entries, 'Missing valid entry'; assert len(entries) > 10, f'Too few entries: {len(entries)}'; print(f'OK: {len(entries)} valid entries')"` confirms the bad entry is gone and valid entries remain
  </verify>
  <done>
settings.local.json contains only legitimate permission entries. The corrupted Bash entry with the embedded verification report is removed. File is valid JSON. All other entries (both allow and deny) are preserved exactly.
  </done>
</task>

</tasks>

<verification>
- `python3 -m json.tool .claude/settings.local.json` produces valid formatted JSON output
- The allow array has exactly the legitimate entries (no verification report content)
- The deny array is unchanged
- `wc -l .claude/settings.local.json` shows a reasonable line count (under 50 lines, not hundreds)
</verification>

<success_criteria>
- settings.local.json is valid JSON
- The corrupted Bash(...) entry containing the Phase 02 verification report is removed
- All other permission entries (allow and deny) are preserved exactly
- File line count is reasonable (was ~48 lines, bloated entry was on line 31)
</success_criteria>

<output>
After completion, create `.planning/quick/1-fix-invalid-settings-in-claude-settings-/1-SUMMARY.md`
</output>
