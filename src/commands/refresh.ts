import * as vscode from "vscode";
import { OIL_SCHEME } from "../constants";
import { getOilState, getCurrentPath } from "../state/oilState";
import { uriPathToDiskPath } from "../utils/pathUtils";
import { getDirectoryListing } from "../utils/fileUtils";
import { updateDecorations } from "../decorations";
import { logger } from "../logger";

export async function refresh() {
  logger.trace("Refreshing oil file...");
  const activeEditor = vscode.window.activeTextEditor;

  // Check if we're in an oil editor
  if (!activeEditor || activeEditor.document.uri.scheme !== OIL_SCHEME) {
    vscode.window.showErrorMessage("Not in an oil editor.");
    return;
  }

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

  // Check if there are any pending changes in the current path
  const hasChangesInCurrentPath = oilState.editedPaths.has(currentPath);

  if (hasChangesInCurrentPath || activeEditor.document.isDirty) {
    // Ask for confirmation before discarding changes
    const response = await vscode.window.showWarningMessage(
      "Discard changes?",
      { modal: true },
      "Yes",
      "No"
    );

    if (response !== "Yes") {
      // User chose not to discard changes
      return;
    }

    // Remove the current path from edited paths
    oilState.editedPaths.delete(currentPath);
  }

  try {
    // Clear the visited path cache for the current directory to force refresh from disk
    oilState.visitedPaths.delete(currentPath);

    // Get updated directory content from disk
    const directoryContent = await getDirectoryListing(
      uriPathToDiskPath(currentPath),
      oilState
    );

    // Create a workspace edit to update the document
    const edit = new vscode.WorkspaceEdit();
    edit.replace(
      activeEditor.document.uri,
      new vscode.Range(
        new vscode.Position(0, 0),
        activeEditor.document.positionAt(activeEditor.document.getText().length)
      ),
      directoryContent
    );

    // Apply the edit
    await vscode.workspace.applyEdit(edit);

    // Check if other directories have changes
    if (oilState.editedPaths.size === 0) {
      // Reset the document's dirty state
      await activeEditor.document.save();
    }

    updateDecorations(activeEditor);
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to refresh directory: ${error}`);
  }
}
