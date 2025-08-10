# Change Log

All notable changes to the "oil.code" extension will be documented in this file.

## [0.0.28](https://github.com/corwinm/oil.code/compare/v0.0.27...v0.0.28)

- docs: Add logo by @corwinm in https://github.com/corwinm/oil.code/pull/43

## [0.0.27](https://github.com/corwinm/oil.code/compare/v0.0.26...v0.0.27)

- fix: Improve transition when moving files by @corwinm in https://github.com/corwinm/oil.code/pull/41
- fix: Allow move and copy same file by @corwinm in https://github.com/corwinm/oil.code/pull/42

## [0.0.26](https://github.com/corwinm/oil.code/compare/v0.0.25...v0.0.26)

- fix: Update cache handling by @corwinm in https://github.com/corwinm/oil.code/pull/39
- deps: Update form-data to 4.0.4 by @corwinm in https://github.com/corwinm/oil.code/pull/40

## [0.0.25](https://github.com/corwinm/oil.code/compare/v0.0.24...v0.0.25)

- fix: Prevent unsaved changes popup when moving files by @corwinm in https://github.com/corwinm/oil.code/pull/38

## [0.0.24](https://github.com/corwinm/oil.code/compare/v0.0.23...v0.0.24)

- refactor: Refactor codebase into individual files by @corwinm in https://github.com/corwinm/oil.code/pull/32
- chore: Dependency updates (@eslint/plugin-kit@0.3.3 and related updates) by @corwinm in https://github.com/corwinm/oil.code/pull/34
- feat: Add setting to triger Workspace Edits when moving files (import updates) by @corwinm in https://github.com/corwinm/oil.code/pull/33
- fix: Navigation flash and decorator perf improvements by @corwinm in https://github.com/corwinm/oil.code/pull/35
- test: Update inconsistent tests by @corwinm in https://github.com/corwinm/oil.code/pull/36

## [0.0.23](https://github.com/corwinm/oil.code/compare/v0.0.22...v0.0.23)

- ci: Update build to wait for all tests to publish and upload build to release

## [0.0.22](https://github.com/corwinm/oil.code/compare/v0.0.21...v0.0.22)

- chore(deps): Update brace-expansion to resolve dependabot alert
- test: Update cursor position tests by @corwinm in https://github.com/corwinm/oil.code/pull/30
- fix: Update tar-fs by @corwinm in https://github.com/corwinm/oil.code/pull/31

## [0.0.21](https://github.com/corwinm/oil.code/compare/v0.0.20...v0.0.21)

- fix: Ignore empty lines when determining changes by @corwinm in https://github.com/corwinm/oil.code/pull/28
- fix: Update cursor position after save by @corwinm in https://github.com/corwinm/oil.code/pull/29

## [0.0.20](https://github.com/corwinm/oil.code/compare/v0.0.19...v0.0.20)

- fix: Preview instability by @corwinm in https://github.com/corwinm/oil.code/pull/26

## [0.0.19](https://github.com/corwinm/oil.code/compare/v0.0.18...v0.0.19)

- feat: Add cd command and keymaps by @corwinm in https://github.com/corwinm/oil.code/pull/21
- feat: Add help command by @corwinm in https://github.com/corwinm/oil.code/pull/23
- fix: Update help content and issue templates by @corwinm in https://github.com/corwinm/oil.code/pull/25

## [0.0.18](https://github.com/corwinm/oil.code/compare/v0.0.17...v0.0.18)

- fix: Initial tests and bugfixes by @corwinm in https://github.com/corwinm/oil.code/pull/20

## [0.0.17](https://github.com/corwinm/oil.code/compare/v0.0.16...v0.0.17)

- fix: Open oil in new editor by @corwinm in https://github.com/corwinm/oil.code/pull/19

## [0.0.16](https://github.com/corwinm/oil.code/compare/v0.0.15...v0.0.16)

- feat: Add Refresh command and keybindings by @corwinm in https://github.com/corwinm/oil.code/pull/13
- fix: Check for path.sep instead of "/"
- feat: Add Open CWD command and Fix keymaps by @corwinm in https://github.com/corwinm/oil.code/pull/14
- feat: More features and fixes by @corwinm in https://github.com/corwinm/oil.code/pull/17
- docs: Update Icons section in README

## [0.0.15](https://github.com/corwinm/oil.code/compare/v0.0.14...v0.0.15)

- fix: Error where extension for nerd font was incorrectly mapped

## [0.0.14](https://github.com/corwinm/oil.code/compare/v0.0.13...v0.0.14)

- feat: Nerd fonts and other icon enhancements by @corwinm in https://github.com/corwinm/oil.code/pull/12

## [0.0.13](https://github.com/corwinm/oil.code/compare/v0.0.12...v0.0.13)

- fix: Fix oil open error when "workbench.editor.enablePreview" is false by @corwinm in https://github.com/corwinm/oil.code/pull/11

## [0.0.12](https://github.com/corwinm/oil.code/compare/v0.0.11...v0.0.12)

- fix: Post rework cleanup and features by @corwinm in https://github.com/corwinm/oil.code/pull/10

## [0.0.11](https://github.com/corwinm/oil.code/compare/v0.0.10...v0.0.11)

- fix: Rework with file identifiers to improve file change operations and move off of temp file by @corwinm in https://github.com/corwinm/oil.code/pull/9

## [0.0.10](https://github.com/corwinm/oil.code/compare/v0.0.9...v0.0.10)

- fix: Trying other method to detect vim extensions

## [0.0.9](https://github.com/corwinm/oil.code/compare/v0.0.8...v0.0.9)

- fix: Trying to detect extensions a different way

## [0.0.8](https://github.com/corwinm/oil.code/compare/v0.0.7...v0.0.8)

- fix: Add retries to vim extension detection

## [0.0.7](https://github.com/corwinm/oil.code/compare/v0.0.6...v0.0.7)

- fix: Try loading neovim keymaps after delay

## [0.0.6](https://github.com/corwinm/oil.code/compare/v0.0.5...v0.0.6)

- fix: Wait for neovim to be active to run keymaps by @corwinm in https://github.com/corwinm/oil.code/pull/8

## [0.0.5](https://github.com/corwinm/oil.code/compare/v0.0.4...v0.0.5)

- fix: Fix deployment

## [0.0.4](https://github.com/corwinm/oil.code/compare/v0.0.3...v0.0.4)

- fix: Better keymaps by @corwinm in https://github.com/corwinm/oil.code/pull/7

## [0.0.3](https://github.com/corwinm/oil.code/compare/v0.0.1...v0.0.2)

- fix: File management not working on Windows by @corwinm in https://github.com/corwinm/oil.code/pull/6

## [0.0.2](https://github.com/corwinm/oil.code/compare/v0.0.1...v0.0.2)

- fix: Oil unsaved after update & prevent oil.code file in file picker by @corwinm in https://github.com/corwinm/oil.code/pull/2
- fix: Moving files up directories works as expected when using "-" to navigate by @corwinm in https://github.com/corwinm/oil.code/pull/4

## [0.0.1]

- Initial release
