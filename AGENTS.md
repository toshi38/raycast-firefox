# Agent notes

- Work isn't done until tests cover the new or changed behaviour: add them in the same change, and check they fail without it.

## Raycast extension (`raycast-extension/`)

- The published copy in [raycast/extensions](https://github.com/raycast/extensions/tree/main/extensions/firefox-tabs) is the source of truth. Raycast's bots and maintainers change it outside this repo (merge-time changelog dates, image optimisation, dependency bumps), so before changing or publishing the extension, diff every tracked file in `raycast-extension/` (assets and metadata included) against that copy and commit any differences to `main` first.
- Before publishing or updating a Store PR, and when a Store PR gets review comments, run the `raycast-store-review` skill (`.claude/skills/raycast-store-review/`): it checks the extension against the rules Raycast's reviewers and review bots apply.
- Publish with `npx @raycast/api@latest publish` from `raycast-extension/`, never with a changeset. It needs the local tag `__raycast_latest_publish_ext/firefox-tabs__` on a commit matching the store copy, and it writes a GitHub token into the remotes of `~/.config/raycast/public-extensions-fork`: strip it afterwards and never print it.
