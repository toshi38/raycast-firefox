# Contributing

## Changesets

This project uses [Changesets](https://github.com/changesets/changesets) for versioning and changelog generation.

**When to add a changeset:** Every PR that changes user-facing behavior (features, bug fixes, breaking changes) should include a changeset.

**How to add one:**

```bash
npx changeset add
```

Select the affected package(s), pick the bump type (patch/minor/major), and write a short summary of the change. This creates a markdown file in `.changeset/` that gets committed with your PR.

**Bump types:**
- `patch` — bug fixes, internal changes
- `minor` — new features, non-breaking enhancements
- `major` — breaking changes

**When NOT to add a changeset:** docs-only changes, CI config, planning files, test-only changes.

The release workflow automatically consumes changesets on merge to main, bumps versions, and publishes GitHub Releases.
