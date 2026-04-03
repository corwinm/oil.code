---
agent: agent
---

Use the GitHub Actions Release workflow for automated releases instead of editing files and tagging manually.

Release workflow:

1. Ensure the commits on `main` follow conventional commit prefixes such as `feat:`, `fix:`, `refactor:`, `perf:`, or `BREAKING CHANGE`.
2. Open GitHub Actions and run the `Release` workflow.
3. Optionally set `dry_run` to `true` to preview the next version without publishing.
4. On a normal run, the workflow will:
   - determine the next semantic version from commits on `main`
   - update `package.json`
   - update `CHANGELOG.md`
   - create the release commit and tag
   - create the GitHub Release with notes
   - attach the packaged `.vsix`
   - publish to the VS Code Marketplace and Open VSX

Release rules:

- `feat` triggers a minor release.
- `fix`, `perf`, `refactor`, and `revert` trigger a patch release.
- `docs`, `style`, `chore`, `test`, `build`, and `ci` do not trigger a release.
- Breaking changes trigger a major release.

Do not manually edit `CHANGELOG.md`, bump `package.json`, create tags, or run `gh release create` for standard releases.
