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
import {
  positionCursorOnFile,
  checkForVisitedCleanup,
} from "../utils/oilUtils";
import { updateDecorations } from "../decorations";
import { newline } from "../newline";
import { updateDisableUpdatePreview } from "./disableUpdatePreview";
import { logger } from "../logger";

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
      // Update the oil state with the new path
      const newUri = updateOilUri(oilState, targetPath);
      oilState.currentPath = removeTrailingSlash(targetPath);

      // Get the directory listing for the new path
      const directoryContent = await getDirectoryListing(targetPath, oilState);

      // Create a new document with the directory listing
      const newDoc = await vscode.workspace.openTextDocument({
        content: directoryContent,
        language: "oil",
      });

      // Update the URI to our custom scheme
      const edit = new vscode.WorkspaceEdit();
      edit.renameFile(newDoc.uri, newUri);
      await vscode.workspace.applyEdit(edit);

      // Open the document with the new URI
      const finalDoc = await vscode.workspace.openTextDocument(newUri);
      await vscode.languages.setTextDocumentLanguage(finalDoc, "oil");

      // Show the new document in the same editor
      const editor = await vscode.window.showTextDocument(finalDoc, {
        viewColumn: viewColumn || activeEditor.viewColumn,
        preview: false,
      });

      if (!viewColumn) {
        await vscode.commands.executeCommand(
          "workbench.action.closeActiveEditor"
        );
      }

      updateDecorations(editor);

      // Position cursor appropriately
      if (isGoingUp) {
        positionCursorOnFile(editor, currentFile);
      } else {
        positionCursorOnFile(editor, "");
      }

      // Mark the file as modified if there are pending changes
      if (oilState.editedPaths.size === 0) {
        await finalDoc.save();
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
      if (document.isDirty && oilState.editedPaths.size === 0) {
        await document.save();
      } else {
        await document.save();
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
