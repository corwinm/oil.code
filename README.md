<h1 align="center">oil.code</h1>

<p align="center">Edit your filesystem like a normal file.</p>

Provides an [oil.nvim](https://github.com/stevearc/oil.nvim) like experience for VSCode.

This plugin works best with [VSCodeVim](https://github.com/VSCodeVim/Vim) or [vscode-neovim](https://github.com/vscode-neovim/vscode-neovim) but can still be used without a Vim plugin.

## Shortcuts

To open oil.code:

- Vim users - With a file focused and in normal mode press `-`.
- All users - Press `alt+-`.

| Vim Shortcut (normal mode) | Default Shortcut | Command               | Description                                     |
| -------------------------- | ---------------- | --------------------- | ----------------------------------------------- |
| `Enter`                    | `alt+Enter`      | `oil-code.select`     | Open file or enter directory                    |
| `-`                        | `alt+-`          | `oil-code.openParent` | Navigate to parent directory                    |
| `ctrl+p`                   | `alt+p`          | `oil-code.preview`    | Toggle preview window of entry under the cursor |

### [vscode-neovim](https://github.com/vscode-neovim/vscode-neovim) Keymaps

If you're using vscode-neovim and want to customize the keymaps for oil.code:

1. Set `oil-code.disableDefaultKeymaps` to `true` in your VSCode settings
2. Add the following to your `init.lua` and customize as you like:

```lua
-- Default oil.code keymaps
if vim.g.vscode then
    local vscode = require('vscode-neovim')
    local map = vim.keymap.set

    vim.api.nvim_create_autocmd({'BufEnter', 'BufWinEnter'}, {
        pattern = {"*"},
        callback = function()
            map("n", "-", function() vscode.action('oil-code.open') end)
        end,
    })

    vim.api.nvim_create_autocmd({'BufEnter', 'BufWinEnter'}, {
        pattern = {"*oil.code*"},
        callback = function()
            map("n", "-", function() vscode.action('oil-code.openParent') end)
            map("n", "<CR>", function() vscode.action('oil-code.select') end)
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

## Other great extensions

- [vsnetrw](https://github.com/danprince/vsnetrw): Another great option for a split file explorer.
- [VSCodeVim](https://github.com/VSCodeVim/Vim): Vim emulation for VSCode.
- [vscode-neovim](https://github.com/vscode-neovim/vscode-neovim): Fully embedded neovim instance, no vim emulation.

## Special thanks

Special thanks goes to [oil.nvim](https://github.com/stevearc/oil.nvim). I still use this every day and it has way more features and is much more extensible than this plugin. If there is something Oil.nvim does that is missing here and you find it useful, let me know in the issues or open a PR.
