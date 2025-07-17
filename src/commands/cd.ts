import * as vscode from "vscode";
import { getOilState, getCurrentPath } from "../state/oilState";
import { uriPathToDiskPath } from "../utils/pathUtils";

export async function cd() {
  const oilState = getOilState();
  if (!oilState) {
    vscode.window.showErrorMessage("Failed to get oil state.");
    return;
  }
  const currentPath = getCurrentPath();
  if (!currentPath) {
    vscode.window.showErrorMessage("No current path found.");
    return;
  }

  // Check if we have pending changes
  if (
    oilState.editedPaths.size > 0 ||
    vscode.window.activeTextEditor?.document.isDirty
  ) {
    const result = await vscode.window.showWarningMessage(
      "Discard changes?",
      { modal: true },
      "Yes"
    );
    if (result !== "Yes") {
      return;
    }
  }

  const currentPathDisk = uriPathToDiskPath(currentPath);
  // Update VS Code's workspace folders
  try {
    const folderUri = vscode.Uri.file(currentPathDisk);

    // Update the first workspace folder to the new location
    // Open the new directory instead of updating workspace folders
    await vscode.commands.executeCommand("vscode.openFolder", folderUri, {
      forceReuseWindow: false,
    });
  } catch (error) {
    vscode.window.showErrorMessage(
      `Failed to change working directory: ${error}`
    );
  }
}
