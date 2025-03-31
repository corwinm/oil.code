<h1 align="center">oil.code</h1>

<p align="center">Edit your file system like a normal file.</p>

Provides an [oil.nvim](https://github.com/stevearc/oil.nvim) like experience for VSCode.

This plugin works best with [VSCodeVim](https://github.com/VSCodeVim/Vim) or [vscode-neovim](https://github.com/vscode-neovim/vscode-neovim) but can still be used without a Vim plugin.

## Shortcuts

To open oil.code:

- Vim users - With a file focused and in normal mode press `-`.
- All users - Press `alt+o`.

| Vim Shortcut (normal mode) | Default Shortcut | Command               | Description                                     |
| -------------------------- | ---------------- | --------------------- | ----------------------------------------------- |
| `Enter`                    | `alt+Enter`      | `oil-code.select`     | Open file or enter directory                    |
| `-`                        | `alt+-`          | `oil-code.openParent` | Navigate to parent directory                    |
| `ctl+p`                    | `alt+p`          | `oil-code.preview`    | Toggle preview window of entry under the cursor |

## Why oil.code?

Oil.nvim is a favorite plugin of mine and I find myself going back and forth between Neovim and VSCode for various projects. Being able to quickly rename or move a file is an experience I want everywhere and I want to share with the great community of VSCode and Codium users.

Odds are good that if you found this plugin, you are like me and have experienced Oil.nvim and have found yourself back in VSCode and miss oil dearly.

## Other great extensions

- [vsnetrw](https://github.com/danprince/vsnetrw): Another great option for a split file explorer.
- [VSCodeVim](https://github.com/VSCodeVim/Vim): Vim emulation for VSCode.
- [vscode-neovim](https://github.com/vscode-neovim/vscode-neovim): Fully embedded neovim instance, no vim emulation.

## Special thanks

Special thanks goes to [oil.nvim](https://github.com/stevearc/oil.nvim). I still use this every day and it has way more features and is much more extensible than this plugin. If there is something Oil.nvim does that is missing here and you find it useful, let me know in the issues or open a PR.
