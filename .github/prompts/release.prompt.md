---
mode: agent
---

Draft release notes and a CHANGELOG entry for oil.code {{VERSION}} comparing to {{PREV_TAG}}. Use repo context and commit messages. Requirements:

- Update CHANGELOG.md with the new version. Add a line for each commit since the last release.
- Update package.json with the new version.
- Commit and tag
  - Commit message: `chore: Release {{VERSION}}`
  - Tag: `git tag v{{VERSION}}`
  - Push: `git push && git push origin v{{VERSION}}`
- Create a GitHub Release with the title `v{{VERSION}}` and content matching the below example where what's changed included the content from what has been updated in the CHANGELOG.md and the Full Changelog shows the difference between the new tag and the previous tag:

```
## What's Changed
* docs: Add logo by @corwinm in https://github.com/corwinm/oil.code/pull/43


**Full Changelog**: https://github.com/corwinm/oil.code/compare/v0.0.27...v0.0.28
```
