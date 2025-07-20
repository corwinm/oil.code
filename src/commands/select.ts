import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { OIL_SCHEME } from "../constants";
import { getOilState, getCurrentPath } from "../state/oilState";
import {
  uriPathToDiskPath,
  removeTrailingSlash,
  updateOilUri,
} from "../utils/pathUtils";
import { getDirectoryListing } from "../utils/fileUtils";
import { checkForVisitedCleanup, hasPendingChanges } from "../utils/oilUtils";
import { newline } from "../newline";
import { updateDisableUpdatePreview } from "./disableUpdatePreview";
import { logger } from "../logger";
import { oilFileProvider } from "../providers/providers";
import { previewState } from "../state/previewState";
import { preview } from "./preview";
import { onDidSaveTextDocument } from "../handlers/onDidSaveTextDocument";

export async function select({
  overRideLineText,
  overRideTargetPath,
  viewColumn,
}: {
  overRideLineText?: string;
  overRideTargetPath?: string;
  viewColumn?: vscode.ViewColumn;
} = {}) {
  logger.trace("Selecting file...");
  const activeEditor = vscode.window.activeTextEditor;

  if (!activeEditor) {
    vscode.window.showErrorMessage("No active editor found.");
    return;
  }
  // Check if the current file is our oil file by checking the scheme
  if (activeEditor.document.uri.scheme !== OIL_SCHEME) {
    return;
  }

  // Capture current content before navigating
  const currentContent = activeEditor.document.getText();
  const currentLines = currentContent.split(newline);
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
  const currentFileDiskPath = uriPathToDiskPath(currentPath);
  const currentFile = path.basename(currentFileDiskPath);

  // If the document has unsaved changes, capture them before navigating
  const isDirty = activeEditor.document.isDirty;
  if (isDirty) {
    oilState.editedPaths.set(currentPath, currentLines);
  }

  const document = activeEditor.document;
  const cursorPosition = activeEditor.selection.active;
  const rawLineText =
    overRideLineText ?? document.lineAt(cursorPosition.line).text;

  // Extract actual filename by removing the hidden identifier
  const lineText = rawLineText.replace(/^\/\d{3} /, "");
  const fileName = lineText.trim();

  if (!fileName) {
    vscode.window.showErrorMessage(
      "No file name or directory found under the cursor."
    );
    return;
  }

  if (!currentFileDiskPath) {
    vscode.window.showErrorMessage("No current folder path found.");
    return;
  }
  const targetPath = removeTrailingSlash(
    overRideTargetPath
      ? overRideTargetPath
      : path.join(currentFileDiskPath, fileName)
  );

  // Store the current directory name when going up a directory
  let isGoingUp = fileName === "../";

  updateDisableUpdatePreview(true);

  if (fs.existsSync(targetPath) && fs.lstatSync(targetPath).isDirectory()) {
    try {
      // Update the URI to represent the new directory path
      const oldUri = document.uri;

      // Update the URI to reflect the new directory
      const newUri = updateOilUri(oilState, targetPath);

      const directoryContent = await getDirectoryListing(targetPath, oilState);

      // Transfer the content to the new URI
      oilFileProvider.writeFile(newUri, Buffer.from(directoryContent));

      // Open the document with the new URI
      const newDoc = await vscode.workspace.openTextDocument(newUri);
      await vscode.languages.setTextDocumentLanguage(newDoc, "oil");

      // Show the new document in the same editor
      const editor = await vscode.window.showTextDocument(newDoc, {
        viewColumn: viewColumn || activeEditor.viewColumn,
        preview: false,
      });

      if (!viewColumn) {
        // Close the old document
        await vscode.window.showTextDocument(oldUri);
        await vscode.commands.executeCommand(
          "workbench.action.revertAndCloseActiveEditor"
        );
      }

      // Position cursor appropriately
      if (isGoingUp) {
        // When going up a directory, we need to find the directory we came from
        const lastSelected = currentFile.replace(/^\/\d{3} /, "");

        // Use setTimeout to ensure the editor content is updated
        setTimeout(() => {
          const editorForSelection = vscode.window.activeTextEditor;
          if (editorForSelection) {
            // Find the line with the directory name (with trailing slash)
            const docText = editorForSelection.document.getText();
            const lines = docText.split(newline);

            let foundIndex = -1;
            // Look for the folder we came from with or without trailing slash
            for (let i = 0; i < lines.length; i++) {
              // Extract actual name from each line by removing the hidden identifier
              const lineName = lines[i].replace(/^\/\d{3} /, "").trim();
              if (
                lineName === lastSelected ||
                lineName === `${lastSelected}/`
              ) {
                foundIndex = i;
                break;
              }
            }

            updateDisableUpdatePreview(false);
            if (foundIndex >= 0) {
              // Position cursor at the found line
              editorForSelection.selection = new vscode.Selection(
                foundIndex,
                0,
                foundIndex,
                0
              );
              editorForSelection.revealRange(
                new vscode.Range(foundIndex, 0, foundIndex, 0)
              );
            } else {
              // Default to first line if not found
              editorForSelection.selection = new vscode.Selection(0, 0, 0, 0);
            }
            if (previewState.previewEnabled) {
              preview(true);
            }
          }
        }, 100);
      } else {
        setTimeout(() => {
          updateDisableUpdatePreview(false);
          // When going into a directory, position at first line
          editor.selection = new vscode.Selection(0, 0, 0, 0);
          // Manually update preview if enabled
          if (previewState.previewEnabled) {
            preview(true);
          }
        }, 100);
      }

      // Mark the file as modified if there are pending changes
      if (!hasPendingChanges(oilState)) {
        editor.document.save();
      }

      return;
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to navigate to the directory: ${error}`
      );
      return;
    }
  } else if (!fs.existsSync(targetPath)) {
    // If the file doesn't exist, ask if the user wants to save changes
    const saveChanges = await vscode.window.showWarningMessage(
      `Save Changes?`,
      { modal: true },
      "Yes",
      "No"
    );

    if (saveChanges === "Yes") {
      oilState.openAfterSave = fileName;
      if (document.isDirty && !hasPendingChanges(oilState)) {
        await document.save();
      } else {
        await onDidSaveTextDocument(document);
      }
      return;
    }
    vscode.window.showErrorMessage(`File "${fileName}" does not exist.`);
    return;
  }

  try {
    // If their are no open oil files and no edits, reset state
    checkForVisitedCleanup(oilState);

    const fileUri = vscode.Uri.file(targetPath);
    const fileDoc = await vscode.workspace.openTextDocument(fileUri);
    const viewColumnToUse = viewColumn || activeEditor.viewColumn;
    if (!viewColumn) {
      await vscode.window.showTextDocument(activeEditor.document.uri);
      await vscode.commands.executeCommand(
        "workbench.action.revertAndCloseActiveEditor"
      );
    }
    await vscode.window.showTextDocument(fileDoc, {
      viewColumn: viewColumnToUse,
      preview: false,
    });
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to open file.`);
  }
}
