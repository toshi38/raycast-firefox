---
"raycast-firefox-native-host": patch
---

Add CI/CD pipeline for automated releases

- Set up npm workspaces monorepo linking all three components
- Configure Changesets for versioning with private package tagging
- Add GitHub Actions CI workflow validating native-host build and Firefox extension lint on PRs
- Add release workflow that builds, checksums (SHA256), and publishes native host bundle as GitHub Release assets
