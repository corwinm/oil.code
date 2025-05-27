<h1 align="center">oil.code</h1>

<p align="center">Edit your filesystem like a normal file.</p>

Provides an [oil.nvim](https://github.com/stevearc/oil.nvim) like experience for VSCode.

This plugin works best with [VSCodeVim](https://github.com/VSCodeVim/Vim) or [vscode-neovim](https://github.com/vscode-neovim/vscode-neovim) but can still be used without a Vim plugin.

## Shortcuts

To open oil.code:

- Vim users - With a file focused and in normal mode press `-`.
- All users - Press `alt+-`.

| Vim Shortcut (normal mode) | Default Shortcut    | Command                   | Description                                      |
| -------------------------- | ------------------- | ------------------------- | ------------------------------------------------ |
| `Enter`                    | `alt+Enter`         | `oil-code.select`         | Open file or enter directory                     |
| `ctrl+t`                   | `alt+t`             | `oil-code.selectTab`      | Open file or enter directory in new tab          |
| -- No Default --           | `alt+s`             | `oil-code.selectVertical` | Open file or enter directory in adjacent v-split |
| -- No Default --           | `alt+c`             | `oil-code.close`          | Close active oil file and open previous file     |
| `-`                        | `alt+-`             | `oil-code.openParent`     | Navigate to parent directory                     |
| `_`                        | `alt+shift+-`       | `oil-code.openCwd`        | Navigate to current working directory            |
| `ctrl+p`                   | `alt+p`             | `oil-code.preview`        | Toggle preview window of entry under the cursor  |
| `ctrl+l`                   | `alt+l`             | `oil-code.refresh`        | Refresh directory listing from disk              |
| <code>\`</code>            | <code>alt+\`</code> | `oil-code.cd`             | Change Directory to current                      |
| -- No Default --           | `alt+shift+h`       | `oil-code.help`           | Display oil.code default keymaps                 |

### [vscode-neovim](https://github.com/vscode-neovim/vscode-neovim) Keymaps

If you're using vscode-neovim and want to customize the keymaps for oil.code:

1. Set `oil-code.disableDefaultKeymaps` to `true` in your VSCode settings
2. Add the following to your `init.lua` and customize as you like:

```lua
-- Default oil.code keymaps
if vim.g.vscode then
    local vscode = require('vscode')
    local map = vim.keymap.set
    vim.api.nvim_create_autocmd({'BufEnter', 'BufWinEnter'}, {
        pattern = {"*"},
        callback = function()
            map("n", "-", function() vscode.action('oil-code.open') end)
        end,
    })

    vim.api.nvim_create_autocmd({'FileType'}, {
        pattern = {"oil"},
        callback = function()
            map("n", "-", function() vscode.action('oil-code.openParent') end)
            map("n", "_", function() vscode.action('oil-code.openCwd') end)
            map("n", "<CR>", function() vscode.action('oil-code.select') end)
            map("n", "<C-t>", function() vscode.action('oil-code.selectTab') end)
            map("n", "<C-l>", function() vscode.action('oil-code.refresh') end)
            map("n", "`", function() vscode.action('oil-code.cd') end)
        end,
    })
end
```

### [VSCodeVim](https://github.com/VSCodeVim/Vim) Keymaps

If you're using VSCodeVim and want to customize the keymaps for oil.code:

1. Set `oil-code.disableDefaultKeymaps` to `true` in your VSCode settings
2. Add the following to your `settings.json` and customize as you like:

```json
"vim.normalModeKeyBindings": [
    {
        "before": ["-"],
        "commands": [
            {
                "command": "oil-code.open"
            }
        ]
    },
    {
        "before": ["<CR>"],
        "commands": [
            {
                "command": "oil-code.select"
            }
        ]
    }
]
```

## Why oil.code?

Oil.nvim is a favorite plugin of mine and I find myself going back and forth between Neovim and VSCode for various projects. Being able to quickly rename or move a file is an experience I want everywhere and I want to share with the great community of VSCode and Codium users.

Odds are good that if you found this plugin, you are like me and have experienced Oil.nvim and have found yourself back in VSCode and miss oil dearly.

## oil.nvim feature comparison

The goal of this project isn't to be an exact implementation of oil.nvim for VSCode but rather to provide the most used and useful parts of it. If you use something that hasn't been implemented, please open an issue and let me know what is missing and how you typically use it.

Below is a list of features and keymaps that oil.nvim has and their status in oil.code. The implementation between the two projects is very different so some features may not be possible to match exactly.

Key:

- ✅ Implemented
- ❌ Not Implemented
- ❓ Not Planned

| feature                                                          | oil.code |
| ---------------------------------------------------------------- | -------- |
| Use as default file explorer                                     | ✅[^1]   |
| Create new file                                                  | ✅       |
| Delete file                                                      | ✅       |
| Move file                                                        | ✅       |
| Rename file                                                      | ✅       |
| Move and Rename file                                             | ✅       |
| Create new directory                                             | ✅       |
| Delete directory                                                 | ✅       |
| Move directory                                                   | ✅       |
| Rename directory                                                 | ✅       |
| Move and Rename directory                                        | ✅       |
| Open oil in multiple splits at once                              | ✅       |
| ["g?"] = { "actions.show_help", mode = "n" }                     | ✅[^2]   |
| ["\<CR\>"] = "actions.select"                                    | ✅       |
| ["\<C-s\>"] = { "actions.select", opts = { vertical = true } }   | ✅[^2]   |
| ["\<C-h\>"] = { "actions.select", opts = { horizontal = true } } | ❓       |
| ["\<C-t\>"] = { "actions.select", opts = { tab = true } }        | ✅       |
| ["\<C-p\>"] = "actions.preview"                                  | ✅[^3]   |
| ["\<C-c\>"] = { "actions.close", mode = "n" }                    | ✅[^2]   |
| ["\<C-l\>"] = "actions.refresh"                                  | ✅       |
| ["-"] = { "actions.parent", mode = "n" }                         | ✅       |
| ["_"] = { "actions.open_cwd", mode = "n" }                       | ✅       |
| ["`"] = { "actions.cd", mode = "n" }                             | ✅[^4]   |
| ["~"] = { "actions.cd", opts = { scope = "tab" }, mode = "n" }   | ❓       |
| ["gs"] = { "actions.change_sort", mode = "n" }                   | ❌       |
| ["gx"] = "actions.open_external"                                 | ❓       |
| ["g."] = { "actions.toggle_hidden", mode = "n" }                 | ❌       |
| ["g\\"] = { "actions.toggle_trash", mode = "n" }                 | ❓       |

[^1]: If VSCode is opened and no files are opened, the oil window will open. This can be disabled in settings.
[^2]: Implemented but I was not able to set the default keymap to match Oil.nvim
[^3]: Keymap might have conflicts with VSCode keymaps or and may require additional config
[^4]: `oil-code.cd` is implemented but the workspace reloads and pending changes do not persist.

## Icons

### Default Icons

The oil view provides basic emoji based icons for files. I wasn't able to find a way to use the same icons that you would see in the default file explorer. If you are looking for better icons, consider Nerd fonts as described below.

### Nerd Fonts

To use an improved set of icons, you can use a [Nerd font](https://www.nerdfonts.com/) in VSCode and enable these icons in oil.code.

[Nerd fonts](https://www.nerdfonts.com/) provide standard text characters along with a collection of icons.

You can set the VSCode text editor to use an installed Nerd Font by setting `"editor.fontFamily": "JetBrainsMono Nerd Font"` where "JetBrainsMono Nerd Font" is an example of a Nerd Font.

Once you have a Nerd Font set for your editor font, to use these icons in your oil view, set `"oil-code.hasNerdFont": true`.

## Other great extensions

- [vsnetrw](https://github.com/danprince/vsnetrw): Another great option for a split file explorer.
- [VSCodeVim](https://github.com/VSCodeVim/Vim): Vim emulation for VSCode.
- [vscode-neovim](https://github.com/vscode-neovim/vscode-neovim): Fully embedded neovim instance, no vim emulation.

## Special thanks

Special thanks goes to [oil.nvim](https://github.com/stevearc/oil.nvim). I still use this every day and it has way more features and is much more extensible than this plugin. If there is something Oil.nvim does that is missing here and you find it useful, let me know in the issues or open a PR.
