---
name: raycast-store-review
description: Review the Raycast extension (raycast-extension/) the way the Raycast Store's reviewers and review bots will, before running `ray publish` or updating an open Store PR, and when a Store PR gets review comments. Use whenever a Store publish is planned, someone asks whether the extension is ready for the Store, or Store review feedback needs handling.
---

# Raycast Store review

Every firefox-tabs Store PR so far has come back with review comments (raycast/extensions#26368, #32702): a fixed changelog date, a non-standard `.prettierrc`, missing tests, a legacy ESLint config. Raycast's review bots follow [`.github/copilot-instructions.md`](https://github.com/raycast/extensions/blob/main/.github/copilot-instructions.md) in raycast/extensions, and human reviewers follow [Prepare an Extension for Store](https://developers.raycast.com/basics/prepare-an-extension-for-store). This skill checks both before the PR exists, so a round trip is saved for each issue caught here.

## 1. Run the script

From the repository root:

```sh
node .claude/skills/raycast-store-review/review.mjs
```

It sparse-clones `extensions/firefox-tabs` from raycast/extensions, compares it with `raycast-extension/`, runs the checks in `checks.mjs`, and runs `npm run lint`, `npm run build` and `npm test` in the extension. It prints a Markdown report and exits 1 if anything fails.

- `--store <dir>` reuses an existing copy of `extensions/firefox-tabs` instead of cloning.
- `--extension <dir>` reviews another checkout, e.g. a stack branch in a worktree.
- `--skip-commands` skips lint, build and tests, for a quick look.

The report has:

- **Fail**: the Store will reject these, or `ray publish` will. Fix all of them. `store-sync` failures mean Raycast changed the Store copy (merge dates, image optimisation, dependency bumps, maintainer commits) and those changes aren't in `main` yet. Sync them into `main` first, as AGENTS.md says.
- **Warn**: what the bots and reviewers have commented on before. Fix them unless there is a reason not to, and tell the user the reason.
- **Info** and **Check by hand**: judgement calls the script can't make (below).

## 2. Review by hand

The script only checks mechanical rules. Read the full diff against the Store copy (the report lists the changed files) as a Store reviewer would, and check:

- **Binaries and network.** Every child process in the report is a known macOS system binary, or Firefox itself. Every download comes from a pinned release with hashes checked (`native-host-pin.json`). No new hosts are contacted without a reason.
- **Text users see.** Command, action, section and toast titles are in Title Case. The text is US English and free of jargon. Descriptions are one short sentence. The README and CHANGELOG describe the change in the same words the UI uses. `ray lint` checks action-title case; the rest is up to you.
- **Action panels.** If any action in a panel has an icon, they all do. Submenu titles end with `…`. The primary action comes first.
- **Views.** No empty-state flicker: `isLoading` is set while data loads. Every `List` or `Grid` has a search bar placeholder. Nested screens use the Navigation API, and the root view doesn't set `navigationTitle`.
- **Errors.** `launchCommand` is wrapped in `try`/`catch`. Failures show a toast (`showFailureToast` from `@raycast/utils` where it fits) rather than failing silently.
- **Tests.** New logic has tests that fail without it (AGENTS.md). Greptile asks for them.
- **Screenshots.** If a change alters what the main views look like, the `metadata/` screenshots (2000x1250 PNG, at most 6, no other apps or personal data) still show the extension accurately.
- **Commit messages and the Store PR description.** The PR template asks for a description, a screencast for visible changes, and its checklist. Bots flag PRs that read as entirely AI-generated, so write plainly and specifically.

## 3. Fix in this repository, then publish

Make every fix in this repository on a branch with a PR into `main`, never in the Store fork. Run the script again until it shows no failures and no unexplained warnings. Then publish from `main` with `npx @raycast/api@latest publish`, following AGENTS.md (the publish tag, and stripping the token from the fork's remotes afterwards).

After publishing, check the new Store PR's file list (`gh pr view <n> -R raycast/extensions --json files`). It should hold only this release's changes, the same files the script reported. `ray publish` reuses the fork branch `ext/firefox-tabs` from the previous Store PR. Raycast squash-merges, so that branch still carries the previous release's commits and its merge base predates them, and the new PR then shows the previous release again. Fix it without force-pushing: merge `raycast/extensions` `main` into `ext/firefox-tabs`, resolve every conflict inside `extensions/firefox-tabs` with the just-published content, check that the folder is identical to what `ray publish` pushed and that nothing outside it differs from `main`, then push. Fast-forward the same branch in `~/.config/raycast/public-extensions-fork` so the next `ray publish` builds on it. Then fill in the Store PR description, which `ray publish` leaves as the empty template.

## 4. When the Store PR gets review comments

1. Fix each comment in this repository through a PR into `main`, with tests where it changes behaviour.
2. Run this review again, then `npx @raycast/api@latest publish` from `main`. With the Store PR still open, `ray publish` adds the new commits to it instead of opening a new one.
3. Reply to each review comment with the commit that fixes it.
4. If a maintainer pushes commits to the Store PR, sync them into `main` before publishing again. Otherwise `ray publish` refuses with "some contributions are available".
5. After the merge, sync raycastbot's commit (the changelog merge date and optimised images) back into `main`.

When a new kind of review comment comes up, add a check for it to `checks.mjs`, with a test in `checks.test.mjs` that cites the Store PR.
