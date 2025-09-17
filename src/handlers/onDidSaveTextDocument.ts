import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { OIL_SCHEME } from "../constants";
import { getOilState, getCurrentPath } from "../state/oilState";
import { determineChanges, positionCursorOnFile } from "../utils/oilUtils";
import {
  addNewlinesToLongLines,
  formatPath,
  uriPathToDiskPath,
} from "../utils/pathUtils";
import {
  getDirectoryListing,
  removeDirectoryRecursively,
} from "../utils/fileUtils";
import { select } from "../commands/select";
import { newline } from "../newline";
import { logger } from "../logger";
import {
  getEnableWorkspaceEditSetting,
  getEnableAlternateConfirmationSetting,
} from "../utils/settings";
import { confirmChanges, type Change } from "../ui/confirmChanges";

export async function onDidSaveTextDocument(document: vscode.TextDocument) {
  // Check if the saved document is our oil file
  if (document.uri.scheme === OIL_SCHEME) {
    try {
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

      // Process changes - now we need to handle both current changes
      // and any pending changes from navigation
      // Read the current content of the file
      const currentContent = document.getText();
      const currentLines = currentContent.split(newline);
      const currentValue = oilState.visitedPaths.get(currentPath);
      if (currentValue?.join("") !== currentLines.join("")) {
        oilState.editedPaths.set(currentPath, currentLines);
      }
      if (
        oilState.editedPaths.has(currentPath) &&
        oilState.editedPaths.get(currentPath)?.join("") !==
          currentLines.join("")
      ) {
        oilState.editedPaths.set(currentPath, currentLines);
      }

      const changes = determineChanges(oilState);
      if (!changes) {
        return;
      }
      const { movedLines, copiedLines, addedLines, deletedLines } = changes;
      logger.debug("Changes detected:", {
        movedLines,
        copiedLines,
        addedLines: Array.from(addedLines),
        deletedLines: Array.from(deletedLines),
      });

      // Check for duplicate destinations and existing files that would be overwritten
      const allDestinations = new Set<string>();
      const duplicateDestinations = new Set<string>();
      const existingFileConflicts = new Set<string>();

      // Check all move operations
      movedLines.forEach(([oldPath, newPath]) => {
        if (allDestinations.has(newPath)) {
          duplicateDestinations.add(newPath);
        } else if (fs.existsSync(newPath) && oldPath !== newPath) {
          existingFileConflicts.add(newPath);
        }
        allDestinations.add(newPath);
      });

      // Check all copy operations
      copiedLines.forEach(([_, newPath]) => {
        if (allDestinations.has(newPath)) {
          duplicateDestinations.add(newPath);
        } else if (fs.existsSync(newPath)) {
          existingFileConflicts.add(newPath);
        }
        allDestinations.add(newPath);
      });

      // Check all added files/folders
      addedLines.forEach((path) => {
        if (allDestinations.has(path)) {
          duplicateDestinations.add(path);
        } else if (fs.existsSync(path)) {
          existingFileConflicts.add(path);
        }
        allDestinations.add(path);
      });

      const replacedDeletedLines = new Set<string>();
      // Check existing files that would be deleted and remove from existingFileConflicts
      deletedLines.forEach((path) => {
        if (existingFileConflicts.has(path)) {
          existingFileConflicts.delete(path);
          replacedDeletedLines.add(path);
        }
      });

      // Check for duplicate destinations or existing file conflicts
      if (duplicateDestinations.size > 0 || existingFileConflicts.size > 0) {
        logger.debug(
          "Duplicate destinations or existing file conflicts detected:",
          {
            duplicateDestinations: Array.from(duplicateDestinations),
            existingFileConflicts: Array.from(existingFileConflicts),
          }
        );
        let message = "The following files would be overwritten:\n\n";
        duplicateDestinations.forEach((path) => {
          message += `${formatPath(path)}\n`;
        });
        existingFileConflicts.forEach((path) => {
          message += `${formatPath(path)}\n`;
        });
        message += "\nPlease resolve these conflicts before saving.";
        vscode.window.showErrorMessage(message, { modal: true });
        oilState.openAfterSave = undefined;
        return;
      }

      // Check if there are any changes to be made
      if (
        movedLines.length === 0 &&
        copiedLines.length === 0 &&
        addedLines.size === 0 &&
        deletedLines.size === 0
      ) {
        oilState.openAfterSave = undefined;
        return;
      }
      // Get the alternate confirmation dialog setting
      const useAlternateConfirmation = getEnableAlternateConfirmationSetting();

      if (useAlternateConfirmation) {
        // Build change list and confirm using Quick Pick
        const uiChanges: Change[] = [];
        for (const [from, to] of movedLines) {
          uiChanges.push({ kind: "move", from, to });
        }
        for (const [from, to] of copiedLines) {
          uiChanges.push({ kind: "copy", from, to });
        }
        for (const p of addedLines) {
          uiChanges.push({ kind: "create", to: p });
        }
        for (const p of deletedLines) {
          uiChanges.push({ kind: "delete", from: p });
        }
        const ok = await confirmChanges(
          uiChanges.map((c) => ({
            // format paths to relative for nicer display (but still keep full for ops later)
            ...(c as any),
            from: "from" in c ? formatPath((c as any).from) : undefined,
            to: "to" in c ? formatPath((c as any).to) : undefined,
          })) as Change[]
        );
        if (!ok) {
          oilState.openAfterSave = undefined;
          return;
        }
      } else {
        // Show confirmation dialog
        let message = "The following changes will be applied:\n\n";
        if (movedLines.length > 0) {
          movedLines.forEach((item) => {
            const [originalPath, newPath] = item;
            message += `MOVE ${formatPath(originalPath)} → ${formatPath(
              newPath
            )}\n`;
          });
        }
        if (copiedLines.length > 0) {
          copiedLines.forEach((item) => {
            const [originalPath, newPath] = item;
            message += `COPY ${formatPath(originalPath)} → ${formatPath(
              newPath
            )}\n`;
          });
        }
        if (addedLines.size > 0) {
          addedLines.forEach((item) => {
            message += `CREATE ${formatPath(item)}\n`;
          });
        }
        if (deletedLines.size > 0) {
          deletedLines.forEach((item) => {
            message += `DELETE ${formatPath(item)}\n`;
          });
        }
        // Show confirmation dialog
        const response = await vscode.window.showWarningMessage(
          addNewlinesToLongLines(message),
          { modal: true },
          "Yes",
          "No"
        );
        if (response !== "Yes") {
          oilState.openAfterSave = undefined;
          return;
        }
      }

      logger.debug("Processing changes...");

      // Delete files/directories
      for (const line of replacedDeletedLines) {
        const filePath = line;
        try {
          if (line.endsWith(path.sep)) {
            // This is a directory - remove recursively
            await removeDirectoryRecursively(filePath);
          } else {
            // This is a file
            fs.unlinkSync(filePath);
          }
        } catch (error) {
          vscode.window.showErrorMessage(
            `Failed to delete: ${line} - ${error}`
          );
        }
      }

      // Create new files/directories
      for (const line of addedLines) {
        const newFilePath = line;
        if (line.endsWith(path.sep)) {
          // Create directory
          try {
            fs.mkdirSync(newFilePath, { recursive: true });
          } catch (error) {
            vscode.window.showErrorMessage(
              `Failed to create directory: ${line} - ${error}`
            );
          }
        } else {
          // Create empty file
          try {
            // If it's a file in subfolders, ensure the folders exist
            if (line.includes(path.sep)) {
              const dirPath = path.dirname(newFilePath);
              if (!fs.existsSync(dirPath)) {
                fs.mkdirSync(dirPath, { recursive: true });
              }
            }
            fs.writeFileSync(newFilePath, "");
          } catch (error) {
            vscode.window.showErrorMessage(
              `Failed to create file: ${line} - ${error}`
            );
          }
        }
      }

      // Copy files
      for (const [oldPath, newPath] of copiedLines) {
        try {
          // Create directory structure if needed
          const isDir = newPath.endsWith(path.sep);
          const dirPath = isDir ? newPath : path.dirname(newPath);
          if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
          }
          if (!isDir) {
            // Copy the file to the new location
            fs.copyFileSync(oldPath, newPath);
          }
        } catch (error) {
          vscode.window.showErrorMessage(
            `Failed to copy file: ${formatPath(oldPath)} to ${newPath.replace(
              currentPath + path.sep,
              ""
            )} - ${error}`
          );
        }
      }

      // Get the workspace edit setting
      const useWorkspaceEdit = getEnableWorkspaceEditSetting();

      const moveEdits = new vscode.WorkspaceEdit();
      // Process the changes
      // Move files
      for (const [oldPath, newPath] of movedLines) {
        try {
          // Create directory structure if needed
          const dirPath = path.dirname(newPath);
          if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
          }

          if (useWorkspaceEdit) {
            // Use workspace edit for better VS Code integration
            // Removing tailing slashes triggers lsp update references correctly
            moveEdits.renameFile(
              vscode.Uri.file(oldPath.replace(/\/$/, "")),
              vscode.Uri.file(newPath.replace(/\/$/, "")),
              {
                overwrite: false,
              }
            );
          } else {
            // Use file system rename directly
            fs.renameSync(oldPath, newPath);
          }
        } catch (error) {
          vscode.window.showErrorMessage(
            `Failed to move file: ${formatPath(oldPath)} to ${newPath.replace(
              currentPath + path.sep,
              ""
            )} - ${error}`
          );
        }
      }
      try {
        await vscode.workspace.applyEdit(moveEdits);
      } catch (error) {
        vscode.window.showErrorMessage(
          `Failed to apply workspace edit: ${error}`
        );
      }

      // Delete files/directories
      for (const line of deletedLines) {
        if (replacedDeletedLines.has(line)) {
          // Skip lines that were already processed
          continue;
        }
        // If the line is not in replacedDeletedLines, proceed with deletion
        const filePath = line;
        try {
          if (line.endsWith(path.sep)) {
            // This is a directory - remove recursively
            await removeDirectoryRecursively(filePath);
          } else {
            // This is a file
            fs.unlinkSync(filePath);
          }
        } catch (error) {
          vscode.window.showErrorMessage(
            `Failed to delete: ${line} - ${error}`
          );
        }
      }

      oilState.editedPaths.clear();

      // Refresh the directory listing after changes
      const updatedContent = await getDirectoryListing(
        uriPathToDiskPath(currentPath),
        oilState
      );

      // Update the file without triggering the save event again
      const edit = new vscode.WorkspaceEdit();
      edit.replace(
        document.uri,
        new vscode.Range(
          new vscode.Position(0, 0),
          document.positionAt(document.getText().length)
        ),
        updatedContent
      );

      const cursorPosition = vscode.window.activeTextEditor?.selection.active;
      let cursorOnFileName = "";
      if (cursorPosition) {
        // Get file name from the current cursor position
        const currentLine = document.lineAt(cursorPosition.line).text;
        cursorOnFileName = currentLine.replace(/^\/\d{3} /, "").trim();
        if (cursorOnFileName.includes("/")) {
          // If the cursor is on a file with a path, just use the folder name
          const parts = cursorOnFileName.split("/");
          cursorOnFileName = parts.at(0) + "/";
        }
      }

      await vscode.workspace.applyEdit(edit);

      // Save the document after updating to prevent it from showing as having unsaved changes
      await document.save();

      if (oilState.openAfterSave) {
        await select({ overRideLineText: oilState.openAfterSave });
        oilState.openAfterSave = undefined;
        return;
      }

      // If we are in an oil file, update the cursor position
      const activeEditor = vscode.window.activeTextEditor;
      if (
        activeEditor &&
        activeEditor.document.uri.scheme === OIL_SCHEME &&
        cursorOnFileName
      ) {
        // Position the cursor on the first line or the file that was just saved
        positionCursorOnFile(activeEditor, cursorOnFileName);
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to process changes: ${error}`);
    }
  }
}
