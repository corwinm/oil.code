import * as vscode from "vscode";

export async function saveFile() {
  await new Promise((resolve) => setTimeout(resolve, 100));

  await vscode.commands.executeCommand("workbench.action.files.save");

  // Give the file save operation time to complete
  await new Promise((resolve) => setTimeout(resolve, 300));
}
