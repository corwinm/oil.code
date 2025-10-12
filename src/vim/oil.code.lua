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
    
    local disableUnderscoreOpenCwd = vscode.get_config('oil-code.disableUnderscoreOpenCwd')
    if not disableUnderscoreOpenCwd then
      map("n", "_", function() vscode.action('oil-code.openCwd') end)
    end
    
    map("n", "<CR>", function() vscode.action('oil-code.select') end)
    map("n", "<C-t>", function() vscode.action('oil-code.selectTab') end)
    map("n", "<C-l>", function() vscode.action('oil-code.refresh') end)
    map("n", "`", function() vscode.action('oil-code.cd') end)
  end,
})
