import * as vscode from "vscode";

let helpPanel: vscode.WebviewPanel | null = null;

export async function help() {
  helpPanel?.dispose(); // Close any existing help panel
  const helpHeaders = [
    "Command",
    "Vim Key Binding",
    "Default Shortcut",
    "Description",
  ];
  // Create a table of commands and default keymaps
  const helpTable = [
    ["open", "-", "alt+-", "Open oil from the currents file parent directory"],
    ["help", "", "alt+shift+h", "Show this help information"],
    ["close", "", "alt+c", "Close oil explorer"],
    ["select", "Enter", "alt+Enter", "Open selected file/directory"],
    ["selectTab", "ctrl+t", "alt+t", "Open selected file in a new tab"],
    ["selectVertical", "", "alt+s", "Open selected file in a vertical split"],
    ["openParent", "-", "alt+-", "Navigate to parent directory"],
    ["openCwd", "_", "alt_shift+-", "Navigate to workspace root"],
    ["preview", "ctrl+p", "alt+p", "Preview file/directory at cursor"],
    ["refresh", "ctrl+l", "alt+l", "Refresh current directory view"],
    [
      "cd",
      "`",
      "alt+`",
      "Change VSCode working directory to current oil directory",
    ],
  ];

  // Display the message in a Markdown preview panel
  const panel = vscode.window.createWebviewPanel(
    "oilHelp",
    "Oil Help",
    vscode.ViewColumn.Active,
    {
      enableScripts: false,
    }
  );

  panel.webview.html = `
  <!DOCTYPE html>
  <html>
  <head>
    <style>
      body { font-family: var(--vscode-editor-font-family); padding: 20px; }
      h1 { margin-bottom: 20px; margin-top: 0; }
      p { margin-bottom: 10px; max-width: 600px; }
      table { border-collapse: collapse; margin: 20px 0; }
      caption { font-weight: bold; margin-bottom: 10px; }
      th, td { padding: 8px 16px; text-align: left; }
      th { border-bottom: 2px solid var(--vscode-list-hoverBackground); }
      td { border-bottom: 1px solid var(--vscode-list-hoverBackground); }
      .horizontal-links { display: flex; list-style: none; padding: 0; }
      .horizontal-links li { margin-right: 20px; }
    </style>
  </head>
  <body>
    <div class="markdown-preview">
      <h1>Oil Help</h1>
      <p>Oil.code is a file explorer for VSCode that allows you to navigate and manage files and directories directly in your editor window.</p>
      <table>
        <caption>Available Commands with default keybinding/shortcut</caption>
        <tr>
          ${helpHeaders.map((header) => `<th>${header}</th>`).join("")}
        </tr>
        ${helpTable
          .map(
            (row) =>
              `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`
          )
          .join("")}
      </table>
      <h2 id="oil-links">Links</h2>
      <ul class="horizontal-links" aria-labelledby="oil-links">
        <li><a href="https://github.com/corwinm/oil.code">GitHub Repository</a></li>
        <li><a href="https://marketplace.visualstudio.com/items?itemName=haphazarddev.oil-code">VS Code Marketplace</a></li>
        <li><a href="https://github.com/corwinm/oil.code/issues">Issue Tracker</a></li>
        <li><a href="https://github.com/corwinm/oil.code/issues/new?template=bug_report.yml">Report a Bug</a></li>
        <li><a href="https://github.com/corwinm/oil.code/issues/new?template=feature_request.yml">Request a Feature</a></li>
      </ul>
      <p>If you find oil.code useful, please consider starring the repository on <a href="https://github.com/corwinm/oil.code">GitHub</a> and reviewing it on the <a href="https://marketplace.visualstudio.com/items?itemName=haphazarddev.oil-code">VS Code Marketplace</a>.</p>
    </div>
  </body>
  </html>`;

  helpPanel = panel;
}
