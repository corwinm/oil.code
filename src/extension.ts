import path from "path";
import * as vscode from "vscode";
import * as fs from "fs";
import * as os from "os";
import { activateDecorations } from "./decorations";

const tempFileName = "《 oil.code 》";

const logger = vscode.window.createOutputChannel("oil.code", { log: true });

interface OilEntry {
  identifier: string;
  value: string;
  path: string;
  isDir: boolean;
}

interface OilState {
  tempFilePath: string;
  currentPath: string | undefined;
  identifierCounter: number;
  visitedPaths: Map<string, string[]>;
  editedPaths: Map<string, string[]>;
}

const oils = new Map<string, OilState>();

function initOilState() {
  const currentOrWorkspacePath = vscode.window.activeTextEditor
    ? path.dirname(vscode.window.activeTextEditor.document.uri.fsPath)
    : vscode.workspace.workspaceFolders?.at(0)?.uri.fsPath;
  const newState = {
    tempFilePath: path.join(os.tmpdir(), tempFileName),
    currentPath: currentOrWorkspacePath,
    identifierCounter: 1,
    visitedPaths: new Map(),
    editedPaths: new Map(),
  };
  oils.set(newState.tempFilePath, newState);
  return newState;
}

function getOilState(): OilState | undefined {
  const activeEditor = vscode.window.activeTextEditor;
  if (activeEditor) {
    const tempFilePath = activeEditor.document.uri.fsPath;
    return oils.get(tempFilePath);
  }
  return undefined;
}

// Function to exclude oil files from recent files by adding to exclude patterns
async function configureRecentFilesExclusions() {
  try {
    // Exclude from files.exclude (affects Explorer view and cmd+p search)
    const filesConfig = vscode.workspace.getConfiguration("files");
    const filesExcludes = filesConfig.get<object>("exclude") || {};

    // Add our patterns to excludes
    const updatedFilesExcludes = {
      ...filesExcludes,
      [`**/${tempFileName}`]: true,
    };

    // Update the configuration - fixed incorrect path
    await filesConfig.update(
      "exclude",
      updatedFilesExcludes,
      vscode.ConfigurationTarget.Global
    );

    // Exclude from search.exclude (affects cmd+p search)
    const searchConfig = vscode.workspace.getConfiguration("search");
    const searchExcludes = searchConfig.get<object>("exclude") || {};

    // Add our patterns to search excludes
    const updatedSearchExcludes = {
      ...searchExcludes,
      [`**/${tempFileName}`]: true,
    };

    // Update the search configuration
    await searchConfig.update(
      "exclude",
      updatedSearchExcludes,
      vscode.ConfigurationTarget.Global
    );
  } catch (error) {
    logger.error("Failed to configure exclusions:", error);
  }
}

// Helper function to prevent oil files from appearing in the recent files list and cmd+p
async function preventOilInRecentFiles() {
  await configureRecentFilesExclusions();
}

let restoreAutoSave = false;
async function checkAndDisableAutoSave() {
  const config = vscode.workspace.getConfiguration("files");
  const autoSave = config.get<string>("autoSave");
  if (autoSave === "afterDelay") {
    restoreAutoSave = true;
    await config.update("autoSave", "off", vscode.ConfigurationTarget.Global);
  }
}

async function checkAndEnableAutoSave() {
  const config = vscode.workspace.getConfiguration("files");
  if (restoreAutoSave) {
    await config.update(
      "autoSave",
      "afterDelay",
      vscode.ConfigurationTarget.Global
    );
  }
}

async function openOil() {
  logger.trace("Opening oil file...");
  const activeEditor = vscode.window.activeTextEditor;

  if (activeEditor) {
    if (activeEditor.document.languageId === "oil") {
      openParent();
      return;
    }
  }
  const oilState = initOilState();
  const activeFile = path.basename(activeEditor?.document.uri.fsPath || "");

  const folderPath = oilState.currentPath;
  if (folderPath && oilState.tempFilePath) {
    try {
      // Get the directory listing
      let directoryContent = await getDirectoryListing(folderPath, oilState);

      // Create a temporary file
      fs.writeFileSync(oilState.tempFilePath, directoryContent);

      // Open the temporary file
      let uri = vscode.Uri.file(oilState.tempFilePath);
      let doc = await vscode.workspace.openTextDocument(uri);
      let editor = await vscode.window.showTextDocument(doc, { preview: true });
      // Set the language mode to "oil"
      await vscode.languages.setTextDocumentLanguage(doc, "oil");

      // Position cursor on the previously selected file if it exists in this directory
      positionCursorOnFile(editor, activeFile);

      await checkAndDisableAutoSave();
    } catch (error) {
      vscode.window.showErrorMessage("Failed to create or open the temp file.");
    }
  } else {
    vscode.window.showErrorMessage("Unable to determine the folder to open.");
  }
}

async function getDirectoryListing(
  folderPath: string,
  oilState: OilState
): Promise<string> {
  let pathUri = vscode.Uri.file(folderPath);

  if (oilState.editedPaths.has(folderPath)) {
    return oilState.editedPaths.get(folderPath)!.join("\n");
  }

  if (oilState.visitedPaths.has(folderPath)) {
    // If we have visited this path before, return the cached listing
    return oilState.visitedPaths.get(folderPath)!.join("\n");
  }

  let results = await vscode.workspace.fs.readDirectory(pathUri);

  results.sort(([aName, aType], [bName, bType]) => {
    return aType & vscode.FileType.Directory
      ? bType & vscode.FileType.Directory
        ? 0
        : -1
      : aName < bName
      ? -1
      : 1;
  });

  let listings = results
    .map(([name, type]) => {
      return type & vscode.FileType.Directory ? `${name}/` : name;
    })
    .filter((name) => name !== tempFileName);

  let hasParent = path.dirname(folderPath) !== folderPath;
  if (hasParent) {
    listings.unshift("../");
  }

  // Generate listings with hidden identifiers using global counter
  let listingsWithIds = listings.map((name) => {
    if (name === "../") {
      return `/000 ${name}`;
    }
    // Use and increment the global counter for each file/directory
    const identifier = `/${oilState.identifierCounter
      .toString()
      .padStart(3, "0")}`;

    oilState.identifierCounter++;

    return `${identifier} ${name}`;
  });

  oilState.visitedPaths.set(folderPath, listingsWithIds);

  return listingsWithIds.join("\n");
}

async function select(overRideLineText?: string) {
  logger.trace("Selecting file...");
  const activeEditor = vscode.window.activeTextEditor;

  if (!activeEditor) {
    vscode.window.showErrorMessage("No active editor found.");
    return;
  }
  // Check if the current file is our oil temp file by comparing just the filename
  if (path.basename(activeEditor.document.uri.fsPath) !== tempFileName) {
    return;
  }

  // Capture current content before navigating
  const currentContent = activeEditor.document.getText();
  const currentLines = currentContent.split("\n");
  const oilState = getOilState();
  if (!oilState) {
    vscode.window.showErrorMessage("Failed to get oil state.");
    return;
  }
  if (!oilState.currentPath) {
    vscode.window.showErrorMessage("No current path found.");
    return;
  }
  const currentFile = path.basename(oilState.currentPath);

  // If the document has unsaved changes, capture them before navigating
  const isDirty = activeEditor.document.isDirty;
  if (isDirty) {
    oilState.editedPaths.set(oilState.currentPath, currentLines);
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

  // const currentFilePath = oilState.currentPath;
  const currentFolderPath = oilState.currentPath;
  if (!currentFolderPath) {
    vscode.window.showErrorMessage("No current folder path found.");
    return;
  }
  const targetPath = path.join(currentFolderPath, fileName);

  // Store the current directory name when going up a directory
  let isGoingUp = fileName === "../";
  if (isGoingUp) {
    // Store current directory name (without full path)
    oilState.currentPath = path.dirname(currentFolderPath);
  }
  // else {
  // Store the file/directory name we're navigating to
  // TODO
  // fileTracking.lastSelectedFile = fileName;
  // oilState.currentPath = targetPath;
  // }

  if (fs.existsSync(targetPath) && fs.lstatSync(targetPath).isDirectory()) {
    try {
      oilState.currentPath = targetPath;

      const directoryContent = await getDirectoryListing(targetPath, oilState);

      // Use workspace edit instead of direct file write
      const edit = new vscode.WorkspaceEdit();
      const uri = document.uri;

      edit.replace(
        uri,
        new vscode.Range(
          new vscode.Position(0, 0),
          document.positionAt(document.getText().length)
        ),
        directoryContent
      );

      // Apply the edit
      await vscode.workspace.applyEdit(edit);

      // Position cursor appropriately
      if (isGoingUp) {
        // When going up a directory, we need to find the directory we came from
        const lastSelected = currentFile.replace(/^\/\d{3} /, "");

        // Use setTimeout to ensure the editor content is updated
        setTimeout(() => {
          if (activeEditor) {
            // Find the line with the directory name (with trailing slash)
            const docText = activeEditor.document.getText();
            const lines = docText.split("\n");

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

            if (foundIndex >= 0) {
              // Position cursor at the found line
              activeEditor.selection = new vscode.Selection(
                foundIndex,
                0,
                foundIndex,
                0
              );
              activeEditor.revealRange(
                new vscode.Range(foundIndex, 0, foundIndex, 0)
              );
            } else {
              // Default to first line if not found
              activeEditor.selection = new vscode.Selection(0, 0, 0, 0);
            }
          }
        }, 100);
      } else {
        // When going into a directory, position at first line
        activeEditor.selection = new vscode.Selection(0, 0, 0, 0);
      }

      // Mark the file as modified if there are pending changes
      if (!hasPendingChanges()) {
        activeEditor.document.save();
      }

      return;
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to navigate to the directory: ${error}`
      );
      return;
    }
  } else if (!fs.existsSync(targetPath)) {
    // TODO: Prompt for saving changes if the file doesn't exist
    vscode.window.showErrorMessage(`File "${fileName}" does not exist.`);
    return;
  }

  try {
    await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
    const fileUri = vscode.Uri.file(targetPath);
    const fileDoc = await vscode.workspace.openTextDocument(fileUri);
    await vscode.window.showTextDocument(fileDoc);
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to open file.`);
  }
}

async function openParent() {
  logger.trace("Opening parent directory...");
  await select("../");
}

let lastActiveEditorWasOil = false;
async function onDidChangeActiveTextEditor(
  editor: vscode.TextEditor | undefined
) {
  const oilState = getOilState();
  if (!oilState) {
    return;
  }
  // Close preview when leaving oil view
  if (
    editor?.document.uri.fsPath !== oilState.tempFilePath &&
    previewState.previewedFile
  ) {
    await closePreview();
  }

  // Original cleanup functionality
  if (oilState.tempFilePath && lastActiveEditorWasOil) {
    lastActiveEditorWasOil = false;
    fs.unlink(oilState.tempFilePath, (err) => {
      if (err) {
        logger.error("Failed to delete temporary file:", err);
      }
    });
    await checkAndEnableAutoSave();
  }
  if (
    editor?.document.uri.fsPath === oilState.tempFilePath &&
    oilState.tempFilePath
  ) {
    lastActiveEditorWasOil = true;
  }
}

// Function to handle oil file changes
// async function handleOilFileSave(
//   currentPath: string,
//   originalLines: string[],
//   newLines: string[]
// ): Promise<void> {
//   // TODO: Reimplement

//   // Compare the original lines with new lines to detect changes

//   // Create sets for quick lookup
//   const originalEntries = new Set(originalLines);
//   const newEntries = new Set(newLines);

//   // Identify added and deleted entries
//   const addedEntries = newLines.filter(
//     (line) => !originalEntries.has(line) && line.trim() !== ""
//   );

//   const deletedEntries = originalLines.filter(
//     (line) => !newEntries.has(line) && line !== "../" && line.trim() !== ""
//   );

//   // Check for cross-directory moves
//   const movedRenamedPairs: Array<[string, string]> = [];
//   // Keep track of files that have been identified as moved
//   const movedFiles = new Set<string>();

//   // Track newly deleted files
//   for (const deletedFile of deletedEntries) {
//     if (!deletedFile.endsWith("/")) {
//       // Only track files, not directories
//       const fullPath = path.join(currentPath, deletedFile);
//       // fileTracking.deletedFiles.set(deletedFile, fullPath);
//     }
//   }

//   // Enhanced cross-directory move detection
//   // Check for previously deleted files that match the added files by name
//   // for (const addedFile of addedEntries) {
//   //   if (!addedFile.endsWith("/")) {
//   //     // For files (not directories), check if we have a matching deleted file
//   //     for (const [
//   //       deletedFileName,
//   //       fullOrigPath,
//   //     ] of fileTracking.deletedFiles.entries()) {
//   //       // Consider it a match if the base filename is the same
//   //       if (
//   //         path.basename(addedFile) === path.basename(deletedFileName) &&
//   //         fs.existsSync(fullOrigPath)
//   //       ) {
//   //         // This looks like a move operation!
//   //         const targetPath = path.join(currentPath, addedFile);
//   //         movedRenamedPairs.push([fullOrigPath, targetPath]);

//   //         // Mark this file as moved so we can exclude it from other operations
//   //         movedFiles.add(fullOrigPath);

//   //         // Remove from regular processing
//   //         const addedIndex = addedEntries.indexOf(addedFile);
//   //         if (addedIndex !== -1) {
//   //           addedEntries.splice(addedIndex, 1);
//   //         }

//   //         // Remove from deletion tracking
//   //         fileTracking.deletedFiles.delete(deletedFileName);
//   //         break;
//   //       }
//   //     }
//   //   }
//   // }

//   // Regular rename detection - for files in the same directory
//   const renamedPairs: Array<[string, string]> = [];
//   const finalAddedEntries = [...addedEntries];
//   const finalDeletedEntries = [...deletedEntries];

//   // Group entries by type (file or directory)
//   const addedFiles = addedEntries.filter((e) => !e.endsWith("/"));
//   const addedDirs = addedEntries.filter((e) => e.endsWith("/"));
//   const deletedFiles = deletedEntries.filter((e) => !e.endsWith("/"));
//   const deletedDirs = deletedEntries.filter((e) => e.endsWith("/"));

//   // Try to match renames - simple heuristic based on count
//   if (addedFiles.length > 0 && deletedFiles.length > 0) {
//     // If same number of added and deleted files, assume they're renames
//     if (addedFiles.length === deletedFiles.length) {
//       for (let i = 0; i < deletedFiles.length; i++) {
//         renamedPairs.push([deletedFiles[i], addedFiles[i]]);
//         // Remove these from the added/deleted lists
//         const addedIndex = finalAddedEntries.indexOf(addedFiles[i]);
//         if (addedIndex !== -1) {
//           finalAddedEntries.splice(addedIndex, 1);
//         }
//         const deletedIndex = finalDeletedEntries.indexOf(deletedFiles[i]);
//         if (deletedIndex !== -1) {
//           finalDeletedEntries.splice(deletedIndex, 1);
//         }
//       }
//     }
//   }

//   // Do the same for directories
//   if (addedDirs.length > 0 && deletedDirs.length > 0) {
//     if (addedDirs.length === deletedDirs.length) {
//       for (let i = 0; i < deletedDirs.length; i++) {
//         renamedPairs.push([deletedDirs[i], addedDirs[i]]);
//         // Remove these from the added/deleted lists
//         const addedIndex = finalAddedEntries.indexOf(addedDirs[i]);
//         if (addedIndex !== -1) {
//           finalAddedEntries.splice(addedIndex, 1);
//         }
//         const deletedIndex = finalDeletedEntries.indexOf(deletedDirs[i]);
//         if (deletedIndex !== -1) {
//           finalDeletedEntries.splice(deletedIndex, 1);
//         }
//       }
//     }
//   }

//   // Check if we need to handle pending changes even when no current changes are detected
//   // const hasPending = hasPendingChanges();
//   // if (
//   //   finalAddedEntries.length === 0 &&
//   //   finalDeletedEntries.length === 0 &&
//   //   renamedPairs.length === 0 &&
//   //   movedRenamedPairs.length === 0 &&
//   //   !hasPending
//   // ) {
//   //   return;
//   // }

//   // Filter out pending deleted files that are actually being moved
//   const pendingDeletedFiles = new Set<string>();

//   // Only include files that aren't part of a move operation
//   // for (const item of pendingChanges.deletedFiles) {
//   //   if (!movedFiles.has(item)) {
//   //     pendingDeletedFiles.add(item);
//   //   }
//   // }

//   // Build the confirmation message
//   let message = "The following changes will be applied:\n\n";

//   if (movedRenamedPairs.length > 0) {
//     message += "Files to move across directories:\n";
//     movedRenamedPairs.forEach(([oldPath, newPath]) => {
//       message += `  - ${path.basename(oldPath)} → ${newPath.replace(
//         currentPath + path.sep,
//         ""
//       )}\n`;
//     });
//     message += "\n";
//   }

//   if (renamedPairs.length > 0) {
//     message += "Items to rename:\n";
//     renamedPairs.forEach(([oldName, newName]) => {
//       message += `  - ${oldName} → ${newName}\n`;
//     });
//     message += "\n";
//   }

//   if (finalAddedEntries.length > 0) {
//     message += "New items to create:\n";
//     finalAddedEntries.forEach((item) => {
//       message += `  - ${item}\n`;
//     });
//     message += "\n";
//   }

//   if (finalDeletedEntries.length > 0) {
//     message += "Items to delete:\n";
//     finalDeletedEntries.forEach((item) => {
//       message += `  - ${item}\n`;
//     });
//     message += "\n";
//   }

//   // Add pending changes to the confirmation message
//   // if (hasPending) {
//   // if (pendingChanges.addedFiles.size > 0) {
//   //   message += "Pending files/directories to create:\n";
//   //   pendingChanges.addedFiles.forEach((item) => {
//   //     message += `  - ${path.relative(currentPath, item)}\n`;
//   //   });
//   //   message += "\n";
//   // }
//   // if (pendingDeletedFiles.size > 0) {
//   //   message += "Pending items to delete:\n";
//   //   pendingDeletedFiles.forEach((item) => {
//   //     message += `  - ${path.relative(currentPath, item)}\n`;
//   //   });
//   //   message += "\n";
//   // }
//   // if (pendingChanges.renamedFiles.size > 0) {
//   //   message += "Pending items to rename:\n";
//   //   pendingChanges.renamedFiles.forEach((newPath, oldPath) => {
//   //     message += `  - ${path.relative(
//   //       currentPath,
//   //       oldPath
//   //     )} → ${path.relative(currentPath, newPath)}\n`;
//   //   });
//   //   message += "\n";
//   // }
//   // }

//   message += "\nDo you want to apply these changes?";

//   // Show confirmation dialog
//   const response = await vscode.window.showWarningMessage(
//     message,
//     { modal: true },
//     "Yes",
//     "No"
//   );

//   if (response !== "Yes") {
//     vscode.window.showInformationMessage("Changes cancelled");
//     return;
//   }

//   // Process cross-directory moves first
//   // for (const [oldPath, newPath] of movedRenamedPairs) {
//   //   try {
//   //     // Create directory structure if needed
//   //     const dirPath = path.dirname(newPath);
//   //     if (!fs.existsSync(dirPath)) {
//   //       fs.mkdirSync(dirPath, { recursive: true });
//   //     }

//   //     // Move the file to the new location
//   //     fs.renameSync(oldPath, newPath);
//   //   } catch (error) {
//   //     vscode.window.showErrorMessage(
//   //       `Failed to move file: ${path.basename(oldPath)} to ${newPath.replace(
//   //         currentPath + path.sep,
//   //         ""
//   //       )} - ${error}`
//   //     );
//   //   }
//   // }

//   // Process the confirmed changes for renames in the same directory
//   // for (const [oldName, newName] of renamedPairs) {
//   //   const oldPath = path.join(currentPath, oldName);
//   //   const newPath = path.join(currentPath, newName);

//   //   // Check if this is a rename including directories
//   //   if (
//   //     newName.includes("/") &&
//   //     !newName.endsWith("/") &&
//   //     !oldName.includes("/")
//   //   ) {
//   //     try {
//   //       // Create directory structure if needed
//   //       const dirPath = path.dirname(newPath);
//   //       if (!fs.existsSync(dirPath)) {
//   //         fs.mkdirSync(dirPath, { recursive: true });
//   //       }

//   //       // Move the file to the new location
//   //       fs.renameSync(oldPath, newPath);
//   //     } catch (error) {
//   //       vscode.window.showErrorMessage(
//   //         `Failed to rename and move: ${oldName} to ${newName} - ${error}`
//   //       );
//   //     }
//   //   } else {
//   //     // Regular rename
//   //     try {
//   //       fs.renameSync(oldPath, newPath);
//   //     } catch (error) {
//   //       vscode.window.showErrorMessage(
//   //         `Failed to rename: ${oldName} to ${newName} - ${error}`
//   //       );
//   //     }
//   //   }
//   // }

//   // Handle added files/directories
//   // for (const line of finalAddedEntries) {
//   //   const newFilePath = path.join(currentPath, line);

//   //   if (line.endsWith("/")) {
//   //     // Create directory
//   //     try {
//   //       fs.mkdirSync(newFilePath);
//   //     } catch (error) {
//   //       vscode.window.showErrorMessage(`Failed to create directory: ${line}`);
//   //     }
//   //   } else {
//   //     // Create empty file
//   //     try {
//   //       // If it's a file in subfolders, ensure the folders exist
//   //       if (line.includes("/")) {
//   //         const dirPath = path.dirname(newFilePath);
//   //         if (!fs.existsSync(dirPath)) {
//   //           fs.mkdirSync(dirPath, { recursive: true });
//   //         }
//   //       }
//   //       fs.writeFileSync(newFilePath, "");
//   //     } catch (error) {
//   //       vscode.window.showErrorMessage(`Failed to create file: ${line}`);
//   //     }
//   //   }
//   // }

//   // Handle deleted files/directories
//   // for (const line of finalDeletedEntries) {
//   //   const filePath = path.join(currentPath, line);

//   //   try {
//   //     if (line.endsWith("/")) {
//   //       // This is a directory - remove recursively
//   //       await removeDirectoryRecursively(filePath);
//   //     } else {
//   //       // This is a file
//   //       fs.unlinkSync(filePath);
//   //     }
//   //   } catch (error) {
//   //     vscode.window.showErrorMessage(`Failed to delete: ${line} - ${error}`);
//   //   }
//   // }

//   // Process pending added files/directories
//   // for (const item of pendingChanges.addedFiles) {
//   //   try {
//   //     if (item.endsWith("/") || item.endsWith(path.sep)) {
//   //       // Create directory
//   //       fs.mkdirSync(item, { recursive: true });
//   //     } else {
//   //       // Create empty file
//   //       // Ensure parent directories exist
//   //       const dirPath = path.dirname(item);
//   //       if (!fs.existsSync(dirPath)) {
//   //         fs.mkdirSync(dirPath, { recursive: true });
//   //       }
//   //       fs.writeFileSync(item, "");
//   //     }
//   //   } catch (error) {
//   //     vscode.window.showErrorMessage(`Failed to create: ${item}`);
//   //   }
//   // }

//   // Process pending deleted files/directories, but only those that aren't part of a move
//   // for (const item of pendingDeletedFiles) {
//   //   try {
//   //     if (fs.existsSync(item)) {
//   //       if (fs.lstatSync(item).isDirectory()) {
//   //         // This is a directory - remove recursively
//   //         await removeDirectoryRecursively(item);
//   //       } else {
//   //         // This is a file
//   //         fs.unlinkSync(item);
//   //       }
//   //     }
//   //   } catch (error) {
//   //     vscode.window.showErrorMessage(`Failed to delete: ${item}`);
//   //   }
//   // }

//   // Process pending renamed files
//   // for (const [oldPath, newPath] of pendingChanges.renamedFiles.entries()) {
//   //   try {
//   //     if (fs.existsSync(oldPath)) {
//   //       // Create directory structure if needed
//   //       const dirPath = path.dirname(newPath);
//   //       if (!fs.existsSync(dirPath)) {
//   //         fs.mkdirSync(dirPath, { recursive: true });
//   //       }
//   //       fs.renameSync(oldPath, newPath);
//   //     }
//   //   } catch (error) {
//   //     vscode.window.showErrorMessage(
//   //       `Failed to rename: ${oldPath} to ${newPath} - ${error}`
//   //     );
//   //   }
//   // }

//   // Clear the deleted files tracking after successful save
//   // for (const [key, _] of fileTracking.deletedFiles) {
//   //   fileTracking.deletedFiles.delete(key);
//   // }

//   // Clear pending changes
//   // pendingChanges = {
//   //   addedFiles: new Set(),
//   //   deletedFiles: new Set(),
//   //   renamedFiles: new Map(),
//   // };
// }

// Function to position cursor on a specific file or on the first line
function positionCursorOnFile(editor: vscode.TextEditor, fileName: string) {
  if (!editor) {
    return;
  }

  const document = editor.document;
  const text = document.getText();
  const lines = text.split("\n");

  // If no filename is provided or it's going up a directory, place cursor on first line
  if (!fileName || fileName === "../") {
    editor.selection = new vscode.Selection(0, 0, 0, 0);
    editor.revealRange(new vscode.Range(0, 0, 0, 0));
    return;
  }

  // Find the line number of the file
  for (let i = 0; i < lines.length; i++) {
    // Extract name without hidden identifier
    const lineName = lines[i].replace(/^\/\d{3} /, "").trim();
    if (lineName === fileName || lineName === `${fileName}/`) {
      // Position cursor at the beginning of the line
      editor.selection = new vscode.Selection(i, 0, i, 0);
      editor.revealRange(new vscode.Range(i, 0, i, 0));
      return;
    }
  }

  // If file not found, position on first line
  editor.selection = new vscode.Selection(0, 0, 0, 0);
  editor.revealRange(new vscode.Range(0, 0, 0, 0));
}

// Helper function to capture changes before navigating
// async function captureChangesForNavigation(
//   currentDirPath: string,
//   expectedLines: string[],
//   currentLines: string[]
// ): Promise<void> {
//   // Extract identifiers and names from lines
//   const extractFileInfo = (line: string) => {
//     const idMatch = line.match(/\u200B(\d{5})\u200B$/);
//     const identifier = idMatch ? `\u200B${idMatch[1]}\u200B` : "";
//     const name = line.replace(/\u200B\d{5}\u200B$/, "").trim();
//     return { name, identifier };
//   };

//   // Process original entries
//   const originalEntries = new Map<
//     string,
//     { name: string; identifier: string }
//   >();
//   for (const line of expectedLines) {
//     const { name, identifier } = extractFileInfo(line);
//     if (name !== "" && name !== "../") {
//       originalEntries.set(name, { name, identifier });
//     }
//   }

//   // Process current entries
//   const newEntries = new Map<string, { name: string; identifier: string }>();
//   for (const line of currentLines) {
//     const { name, identifier } = extractFileInfo(line);
//     if (name !== "" && name !== "../") {
//       newEntries.set(name, { name, identifier });
//     }
//   }

//   // Identify added and deleted entries
//   const addedEntries: string[] = [];
//   for (const [name, info] of newEntries.entries()) {
//     if (!originalEntries.has(name)) {
//       addedEntries.push(name);
//     }
//   }

//   const deletedEntries: string[] = [];
//   for (const [name, info] of originalEntries.entries()) {
//     if (!newEntries.has(name)) {
//       deletedEntries.push(name);
//     }
//   }

//   // Identify renames based on identifier matches
//   const identifierMap = new Map<string, string>(); // id -> name
//   for (const [name, info] of originalEntries.entries()) {
//     if (info.identifier) {
//       identifierMap.set(info.identifier, name);
//     }
//   }

//   const potentialMoves = new Map<string, string>();

//   // Look for entries where the identifier exists in original but with a different name
//   for (const line of currentLines) {
//     const { name, identifier } = extractFileInfo(line);
//     if (identifier && identifierMap.has(identifier)) {
//       const originalName = identifierMap.get(identifier)!;
//       if (originalName !== name && name !== "../") {
//         // This is a rename!
//         const oldPath = path.join(currentDirPath, originalName);
//         const newPath = path.join(currentDirPath, name);
//         potentialMoves.set(oldPath, newPath);

//         // Add to pending renames
//         pendingChanges.renamedFiles.set(oldPath, newPath);

//         // Remove from added/deleted lists
//         const addedIndex = addedEntries.indexOf(name);
//         if (addedIndex !== -1) {
//           addedEntries.splice(addedIndex, 1);
//         }

//         const deletedIndex = deletedEntries.indexOf(originalName);
//         if (deletedIndex !== -1) {
//           deletedEntries.splice(deletedIndex, 1);
//         }
//       }
//     }
//   }

//   // If we've processed renames, return early
//   if (potentialMoves.size > 0) {
//     logger.info(`Rename operations detected: ${potentialMoves.size}`);
//     logger.info(
//       `Renamed files: ${[...potentialMoves.entries()]
//         .map(
//           (entry) => `${path.basename(entry[0])} -> ${path.basename(entry[1])}`
//         )
//         .join(", ")}`
//     );
//     return;
//   }

//   // Track deleted files
//   for (const deletedFile of deletedEntries) {
//     if (!deletedFile.endsWith("/")) {
//       const fullPath = path.join(currentDirPath, deletedFile);
//       pendingChanges.deletedFiles.add(fullPath);

//       // Also track them for cross-directory moves
//       fileTracking.deletedFiles.set(deletedFile, fullPath);
//     } else {
//       // Handle deleted directories too
//       const dirPath = path.join(currentDirPath, deletedFile);
//       pendingChanges.deletedFiles.add(dirPath);
//     }
//   }

//   // Track added files
//   for (const addedFile of addedEntries) {
//     if (!addedFile.endsWith("/")) {
//       pendingChanges.addedFiles.add(path.join(currentDirPath, addedFile));
//     } else {
//       // Handle added directories too
//       const dirPath = path.join(currentDirPath, addedFile);
//       pendingChanges.addedFiles.add(dirPath);
//     }
//   }

//   // Mark that we have changes to process
//   if (addedEntries.length > 0 || deletedEntries.length > 0) {
//     logger.info(`Pending changes detected: ${hasPendingChanges()}`);
//     logger.info(`Added files: ${[...pendingChanges.addedFiles].join(", ")}`);
//     logger.info(
//       `Deleted files: ${[...pendingChanges.deletedFiles].join(", ")}`
//     );
//   }
// }

// Helper function to check if there are pending changes
function hasPendingChanges(): boolean {
  const oilState = getOilState();
  if (!oilState) {
    return false;
  }
  return oilState.editedPaths.size > 0;
}

// Helper function to recursively remove a directory and its contents
async function removeDirectoryRecursively(dirPath: string): Promise<void> {
  if (!fs.existsSync(dirPath)) {
    return;
  }

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      // Recursively remove subdirectories
      await removeDirectoryRecursively(fullPath);
    } else {
      // Remove files
      fs.unlinkSync(fullPath);
    }
  }

  // Remove the now-empty directory
  fs.rmdirSync(dirPath);
}

// Add tracking for previewed file
interface PreviewState {
  previewedFile: string | null; // Path of currently previewed file/directory
  previewedEditor: vscode.TextEditor | null; // Reference to preview editor
  cursorListenerDisposable: vscode.Disposable | null; // For tracking cursor movements
  isDirectory: boolean; // Whether the preview is showing a directory
  previewFilePath: string | null; // Path to the temporary preview file for directories
}

let previewState: PreviewState = {
  previewedFile: null,
  previewedEditor: null,
  cursorListenerDisposable: null,
  isDirectory: false,
  previewFilePath: null,
};

async function preview() {
  const activeEditor = vscode.window.activeTextEditor;

  if (!activeEditor) {
    vscode.window.showErrorMessage("No active editor found.");
    return;
  }

  // Check if the current file is our oil temp file
  if (path.basename(activeEditor.document.uri.fsPath) !== tempFileName) {
    return;
  }

  const document = activeEditor.document;
  const cursorPosition = activeEditor.selection.active;
  const lineText = document.lineAt(cursorPosition.line).text;
  const fileName = lineText.trim();

  if (!fileName) {
    vscode.window.showInformationMessage(
      "No file or directory found under cursor."
    );
    return;
  }

  const currentFilePath = document.uri.fsPath;
  const currentFolderPath = path.dirname(currentFilePath);

  let targetPath: string;

  // Handle "../" special case
  if (fileName === "../") {
    targetPath = path.dirname(currentFolderPath);
  } else {
    targetPath = path.join(currentFolderPath, fileName);
  }

  if (!fs.existsSync(targetPath)) {
    vscode.window.showErrorMessage(`"${fileName}" does not exist.`);
    return;
  }

  const isDir = fs.lstatSync(targetPath).isDirectory();

  // If this file/directory is already being previewed, close the preview (toggle behavior)
  if (previewState.previewedFile === targetPath) {
    await closePreview();
    return;
  }

  // Close any existing preview
  await closePreview();

  // Preview differently based on whether it's a file or directory
  if (isDir) {
    await previewDirectory(targetPath);
  } else {
    await previewFile(targetPath);
  }
}

// Function to preview a file
async function previewFile(targetPath: string) {
  try {
    const fileUri = vscode.Uri.file(targetPath);
    const fileDoc = await vscode.workspace.openTextDocument(fileUri);

    // Open to the side (right split) in preview mode
    const editor = await vscode.window.showTextDocument(fileDoc, {
      viewColumn: vscode.ViewColumn.Beside, // Opens in the editor group to the right
      preview: true, // Opens in preview mode
      preserveFocus: true, // Keeps focus on the oil file
    });

    // Update preview state
    previewState.previewedFile = targetPath;
    previewState.previewedEditor = editor;
    previewState.isDirectory = false;

    // Start listening for cursor movements if not already listening
    if (!previewState.cursorListenerDisposable) {
      previewState.cursorListenerDisposable =
        vscode.window.onDidChangeTextEditorSelection(
          updatePreviewBasedOnCursorPosition
        );
    }
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to preview file: ${error}`);
  }
}

// Function to preview a directory in oil format
async function previewDirectory(directoryPath: string) {
  try {
    const oilState = getOilState();
    if (!oilState) {
      vscode.window.showErrorMessage("No oil state found.");
      return;
    }
    // Get directory listing in oil format
    const directoryContent = await getDirectoryListing(directoryPath, oilState);

    // Generate a unique filename based on the directory path to avoid conflicts
    // Create a hash of the path for uniqueness
    const pathHash = Buffer.from(directoryPath)
      .toString("base64")
      .replace(/[/+=]/g, "_")
      .substring(0, 10); // Create safe filename

    const previewFileName = `${tempFileName}-preview-${path.basename(
      directoryPath
    )}-${pathHash}`;
    const previewFilePath = path.join(os.tmpdir(), previewFileName);

    fs.writeFileSync(previewFilePath, directoryContent);

    // Open the preview file
    const fileUri = vscode.Uri.file(previewFilePath);
    const fileDoc = await vscode.workspace.openTextDocument(fileUri);

    // Set the language mode to "oil" for consistent highlighting
    await vscode.languages.setTextDocumentLanguage(fileDoc, "oil");

    // Show the document to the side
    const editor = await vscode.window.showTextDocument(fileDoc, {
      viewColumn: vscode.ViewColumn.Beside,
      preview: true,
      preserveFocus: true,
    });

    // Update preview state
    previewState.previewedFile = directoryPath;
    previewState.previewedEditor = editor;
    previewState.isDirectory = true;
    previewState.previewFilePath = previewFilePath; // Store temp file path for cleanup

    // Start listening for cursor movements if not already listening
    if (!previewState.cursorListenerDisposable) {
      previewState.cursorListenerDisposable =
        vscode.window.onDidChangeTextEditorSelection(
          updatePreviewBasedOnCursorPosition
        );
    }
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to preview directory: ${error}`);
  }
}

// Helper function to update preview based on cursor position
async function updatePreviewBasedOnCursorPosition(
  event: vscode.TextEditorSelectionChangeEvent
) {
  // Only respond to selection changes in the oil file
  if (
    !event.textEditor ||
    path.basename(event.textEditor.document.uri.fsPath) !== tempFileName
  ) {
    return;
  }

  const document = event.textEditor.document;
  const cursorPosition = event.selections[0].active;

  // Check if line is valid
  if (cursorPosition.line >= document.lineCount) {
    return;
  }

  const lineText = document.lineAt(cursorPosition.line).text;
  const fileName = lineText.trim();

  // Skip if cursor is on empty line
  if (!fileName) {
    return;
  }

  const currentFolderPath = path.dirname(document.uri.fsPath);

  let targetPath: string;

  // Handle "../" special case
  if (fileName === "../") {
    targetPath = path.dirname(currentFolderPath);
  } else {
    targetPath = path.join(currentFolderPath, fileName);
  }

  // Skip if same file/directory is already being previewed
  if (previewState.previewedFile === targetPath) {
    return;
  }

  // Check if the target exists
  if (!fs.existsSync(targetPath)) {
    return;
  }

  // Determine if it's a directory or file
  const isDir = fs.lstatSync(targetPath).isDirectory();

  // Update the preview with the new file or directory
  try {
    if (isDir) {
      await previewDirectory(targetPath);
    } else {
      await previewFile(targetPath);
    }
  } catch (error) {
    logger.error("Failed to update preview:", error);
  }
}

// Helper function to close the current preview
async function closePreview() {
  // Stop listening for cursor movements
  if (previewState.cursorListenerDisposable) {
    previewState.cursorListenerDisposable.dispose();
    previewState.cursorListenerDisposable = null;
  }

  // Close the preview if it's open
  if (previewState.previewedFile) {
    if (previewState.isDirectory && previewState.previewFilePath) {
      // For directory previews, close the temp file and delete it
      const tempPreviewPath = previewState.previewFilePath;

      // Close any editors that match our temp preview file
      for (const editor of vscode.window.visibleTextEditors) {
        if (editor.document.uri.fsPath === tempPreviewPath) {
          await vscode.commands.executeCommand(
            "workbench.action.closeActiveEditor",
            editor.document.uri
          );
        }
      }

      // Clean up the temporary file
      if (fs.existsSync(tempPreviewPath)) {
        try {
          fs.unlinkSync(tempPreviewPath);
        } catch (err) {
          logger.error("Failed to delete temporary preview file:", err);
        }
      }
    } else {
      // For regular file previews
      const editorsToClose = vscode.window.visibleTextEditors.filter(
        (editor) => editor.document.uri.fsPath === previewState.previewedFile
      );

      // Close each matching editor
      for (const editor of editorsToClose) {
        await vscode.commands.executeCommand(
          "workbench.action.closeActiveEditor",
          editor.document.uri
        );
      }
    }

    // Reset state
    previewState.previewedFile = null;
    previewState.previewedEditor = null;
    previewState.isDirectory = false;
    previewState.previewFilePath = null;
  }
}

function oilLineToOilEntry(line: string, path: string): OilEntry {
  const parts = line.split(" ");
  const identifier = parts[0];
  if (identifier.length !== 4 || identifier[0] !== "/") {
    return {
      identifier: "",
      value: line,
      path,
      isDir: line.endsWith("/"),
    };
  }
  const value = parts.slice(1).join(" ").trim();
  const isDir = line.endsWith("/");
  return {
    identifier,
    value,
    path,
    isDir,
  };
}

function oilLinesToOilMap(
  lines: string[],
  path: string
): Map<string, OilEntry> {
  const map = new Map<string, OilEntry>();
  for (const line of lines) {
    const entry = oilLineToOilEntry(line, path);
    if (entry.identifier === "/000") {
      continue;
    }
    map.set(entry.identifier, entry);
  }
  return map;
}

function determineChanges(oilState: OilState) {
  // Check if there are any pending changes
  if (oilState.editedPaths.size > 0) {
    // Process the changes
    const editedFiles = Array.from(oilState.editedPaths.keys());
    const originalFilesMap = new Map<string, OilEntry>();
    editedFiles.forEach((dir) => {
      const lines = oilState.visitedPaths.get(dir);
      if (lines) {
        const entriesMap = oilLinesToOilMap(lines, dir);
        entriesMap.forEach((entry, key) => {
          originalFilesMap.set(key, entry);
        });
      }
    });

    const movedLines = new Map<string, string>();
    const copiedLines = new Map<string, string>();
    const addedLines = new Set<string>();
    const deletedLines = new Set<string>();

    for (const [dirPath, lines] of oilState.editedPaths.entries()) {
      const editedEntries = oilLinesToOilMap(lines, dirPath);
      for (const [key, entry] of editedEntries.entries()) {
        const originalEntry = originalFilesMap.get(key);
        if (originalEntry) {
          // Check if the entry has been renamed or moved
          if (
            entry.value !== originalEntry.value ||
            entry.path !== originalEntry.path
          ) {
            movedLines.set(
              path.join(originalEntry.path, originalEntry.value),
              path.join(dirPath, entry.value)
            );
          }
        } else {
          // New entry added
          addedLines.add(path.join(dirPath, entry.value));
        }
      }
    }

    for (const [dirPath, lines] of oilState.editedPaths.entries()) {
      const editedEntries = oilLinesToOilMap(lines, dirPath);
      // Check for deleted entries
      const fileOriginalEntries = oilLinesToOilMap(
        oilState.visitedPaths.get(dirPath) || [],
        dirPath
      );
      for (const [key, entry] of fileOriginalEntries.entries()) {
        if (
          !editedEntries.has(key) &&
          !movedLines.has(path.join(dirPath, entry.value))
        ) {
          deletedLines.add(path.join(dirPath, entry.value));
        }
      }
    }

    for (const [dirPath, lines] of oilState.editedPaths.entries()) {
      const editedEntries = oilLinesToOilMap(lines, dirPath);
      // Check for moved entries
      // TODO: Check this logic
      for (const [key, entry] of editedEntries.entries()) {
        if (key && !originalFilesMap.has(key)) {
          copiedLines.set(
            path.join(dirPath, entry.value),
            path.join(key, entry.value)
          );
        }
      }
    }
    return {
      movedLines,
      copiedLines,
      addedLines,
      deletedLines,
    };
  }
}

async function onDidSaveTextDocument(document: vscode.TextDocument) {
  const oilState = getOilState();
  // Check if the saved document is our oil file
  if (
    oilState?.tempFilePath &&
    document.uri.fsPath === vscode.Uri.file(oilState.tempFilePath).fsPath
  ) {
    try {
      // Process changes - now we need to handle both current changes
      // and any pending changes from navigation
      // Read the current content of the file
      const currentContent = document.getText();
      const currentLines = currentContent.split("\n");
      const oilState = getOilState();
      if (!oilState) {
        vscode.window.showErrorMessage("Failed to get oil state.");
        return;
      }
      if (!oilState.currentPath) {
        vscode.window.showErrorMessage("No current path found.");
        return;
      }
      const currentValue = oilState.visitedPaths.get(oilState.currentPath);
      if (currentValue?.join("") !== currentLines.join("")) {
        oilState.editedPaths.set(oilState.currentPath, currentLines);
      }

      // Get the current directory
      if (!oilState.currentPath) {
        vscode.window.showErrorMessage("Current directory path is not set.");
        return;
      }

      const changes = determineChanges(oilState);
      if (!changes) {
        return;
      }
      const { movedLines, copiedLines, addedLines, deletedLines } = changes;

      // Show confirmation dialog
      let message = "The following changes will be applied:\n\n";
      if (movedLines.size > 0) {
        movedLines.forEach((newPath, oldPath) => {
          message += `MOVE ${path.basename(oldPath)} → ${path.basename(
            newPath
          )}\n`;
        });
      }
      if (copiedLines.size > 0) {
        copiedLines.forEach((newPath, oldPath) => {
          message += `COPY ${path.basename(oldPath)} → ${path.basename(
            newPath
          )}\n`;
        });
      }
      if (addedLines.size > 0) {
        addedLines.forEach((item) => {
          message += `CREATE ${path.basename(item)}\n`;
        });
      }
      if (deletedLines.size > 0) {
        deletedLines.forEach((item) => {
          message += `DELETE ${path.basename(item)}\n`;
        });
      }
      // Show confirmation dialog
      const response = await vscode.window.showWarningMessage(
        message,
        { modal: true },
        "Yes",
        "No"
      );
      if (response !== "Yes") {
        vscode.window.showInformationMessage("Changes cancelled");
        return;
      }
      // Process the changes
      // Move files
      for (const [oldPath, newPath] of movedLines.entries()) {
        try {
          // Create directory structure if needed
          const dirPath = path.dirname(newPath);
          if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
          }
          // Move the file to the new location
          fs.renameSync(oldPath, newPath);
        } catch (error) {
          vscode.window.showErrorMessage(
            `Failed to move file: ${path.basename(
              oldPath
            )} to ${newPath.replace(
              oilState.currentPath + path.sep,
              ""
            )} - ${error}`
          );
        }
      }
      // Copy files
      for (const [oldPath, newPath] of copiedLines.entries()) {
        try {
          // Create directory structure if needed
          const dirPath = newPath;
          if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
          }
          // Copy the file to the new location
          fs.copyFileSync(oldPath, newPath);
        } catch (error) {
          vscode.window.showErrorMessage(
            `Failed to copy file: ${path.basename(
              oldPath
            )} to ${newPath.replace(
              oilState.currentPath + path.sep,
              ""
            )} - ${error}`
          );
        }
      }
      // Create new files/directories
      for (const line of addedLines) {
        const newFilePath = line;
        if (line.endsWith("/")) {
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
            if (line.includes("/")) {
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
      // Delete files/directories
      for (const line of deletedLines) {
        const filePath = line;
        try {
          if (line.endsWith("/")) {
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

      oilState.visitedPaths.clear();
      oilState.editedPaths.clear();
      oilState.identifierCounter = 1;

      // Refresh the directory listing after changes
      const updatedContent = await getDirectoryListing(
        oilState.currentPath,
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

      await vscode.workspace.applyEdit(edit);

      // Save the document after updating to prevent it from showing as having unsaved changes
      await document.save();
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to process changes: ${error}`);
    }
  }
}

const MAX_EXTENSION_DETECTION_RETRIES = 3;
const EXTENSION_DETECTION_DELAY = 2000; // ms

// Helper function to get setting for disabling vim keymaps
function getDisableVimKeymapsSetting(): boolean {
  const config = vscode.workspace.getConfiguration("oil-code");
  return config.get<boolean>("disableVimKeymaps") || false;
}

// Check if Neovim extension is available
async function isNeovimAvailable(): Promise<boolean> {
  try {
    // Try to execute a simple command provided by the Neovim extension
    await vscode.commands.executeCommand("vscode-neovim.lua", "return 1");
    logger.info("Neovim extension is available");
    return true;
  } catch (error) {
    // If command execution fails, the extension is likely not available
    logger.info("Neovim extension not available or command failed");
    return false;
  }
}

// Check if VSCodeVim extension is available
function isVSCodeVimAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      // VSCodeVim extension adds a "vim" configuration section
      const vimConfig = vscode.workspace.getConfiguration("vim");

      // Check if a known setting exists to confirm the extension is activated
      if (vimConfig && vimConfig.has("normalModeKeyBindings")) {
        logger.info("VSCodeVim extension is available");
        resolve(true);
      } else {
        logger.info(
          "VSCodeVim extension not available or not fully initialized"
        );
        resolve(false);
      }
    } catch (error) {
      logger.error("Error checking VSCodeVim availability:", error);
      resolve(false);
    }
  });
}

// Register keymaps for the Neovim extension
async function registerNeovimKeymap(): Promise<boolean> {
  // Check if vim keymaps are disabled in settings
  const isDisabled = getDisableVimKeymapsSetting();
  if (isDisabled) {
    logger.info("Vim keymaps are disabled in settings.");
    return false;
  }

  // Check if the extension is available before attempting to register keymaps
  if (await isNeovimAvailable()) {
    try {
      logger.info("Registering Neovim keymaps");

      // Use the Neovim extension's command API to register Lua code
      await vscode.commands.executeCommand(
        "vscode-neovim.lua",
        `
local vscode = require('vscode')
local map = vim.keymap.set
vim.api.nvim_create_autocmd({'BufEnter', 'BufWinEnter'}, {
    pattern = {"*"},
  callback = function()
    map("n", "-", function() vscode.action('oil-code.open') end)
  end,
})

vim.api.nvim_create_autocmd({'BufEnter', 'BufWinEnter'}, {
    pattern = {"${tempFileName}"},
  callback = function()
    map("n", "-", function() vscode.action('oil-code.openParent') end)
    map("n", "<CR>", function() vscode.action('oil-code.select') end)
  end,
})
        `
      );

      logger.info("Neovim keymaps registered successfully");
      return true;
    } catch (error) {
      logger.error("Failed to register Neovim keymap:", error);
      return false;
    }
  }

  logger.info("Neovim extension not available, skipping keymap registration");
  return false;
}

// Register keymaps for the VSCodeVim extension
async function registerVSCodeVimKeymap(): Promise<boolean> {
  // Check if vim keymaps are disabled in settings
  const isDisabled = getDisableVimKeymapsSetting();
  if (isDisabled) {
    logger.info("Vim keymaps are disabled in settings.");
    return false;
  }

  // Check if the extension is available before attempting to register keymaps
  if (await isVSCodeVimAvailable()) {
    try {
      logger.info("Registering VSCodeVim keymaps");

      // Configure VSCodeVim using workspace configuration
      const vimConfig = vscode.workspace.getConfiguration("vim");
      const normalModeKeymap =
        vimConfig.get<any[]>("normalModeKeyBindings") || [];
      let updatedKeymap = [...normalModeKeymap]; // Make a copy
      let keymapChanged = false;

      // Check for and add the Oil open binding if not present
      const hasOilOpenBinding = normalModeKeymap.some(
        (binding) =>
          binding.before &&
          binding.before.length === 1 &&
          binding.before[0] === "-" &&
          binding.commands?.some(
            (cmd: { command: string }) => cmd.command === "oil-code.open"
          )
      );

      if (!hasOilOpenBinding) {
        updatedKeymap.push({
          before: ["-"],
          commands: [{ command: "oil-code.open" }],
        });
        keymapChanged = true;
      }

      // Check for and add the Oil select binding if not present
      const hasOilSelectBinding = normalModeKeymap.some(
        (binding) =>
          binding.before &&
          binding.before.length === 1 &&
          binding.before[0] === "<cr>" &&
          binding.commands?.some(
            (cmd: { command: string }) => cmd.command === "oil-code.select"
          )
      );

      if (!hasOilSelectBinding) {
        updatedKeymap.push({
          before: ["<cr>"],
          commands: [{ command: "oil-code.select" }],
          when: "editorTextFocus && editorLangId == oil",
        });
        keymapChanged = true;
      }

      // Update the configuration if changes were made
      if (keymapChanged) {
        await vimConfig.update(
          "normalModeKeyBindings",
          updatedKeymap,
          vscode.ConfigurationTarget.Global
        );
        logger.info("VSCodeVim keymaps updated successfully");
      } else {
        logger.info("VSCodeVim keymaps already configured");
      }

      return true;
    } catch (error) {
      logger.error("Failed to register VSCodeVim keymap:", error);
      return false;
    }
  }

  logger.info(
    "VSCodeVim extension not available, skipping keymap registration"
  );
  return false;
}

// Function to attempt registering vim keymaps with retries
async function attemptRegisteringVimKeymaps(
  retries: number = MAX_EXTENSION_DETECTION_RETRIES,
  delay: number = EXTENSION_DETECTION_DELAY
): Promise<void> {
  let neovimRegistered = false;
  let vscodevimRegistered = false;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      logger.info(
        `Retry attempt ${attempt} of ${retries} to register Vim keymaps`
      );
      // Wait before retry
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    // Try to register Neovim keymaps if not already registered
    if (!neovimRegistered) {
      neovimRegistered = await registerNeovimKeymap();
    }

    // Try to register VSCodeVim keymaps if not already registered
    if (!vscodevimRegistered) {
      vscodevimRegistered = await registerVSCodeVimKeymap();
    }

    // If both are registered or we've exhausted attempts, we're done
    if (neovimRegistered && vscodevimRegistered) {
      logger.info(
        "Successfully registered keymaps for all available Vim extensions"
      );
      break;
    }
  }

  if (!neovimRegistered && !vscodevimRegistered) {
    logger.info("No Vim extensions were detected after all retry attempts");
  }
}

// In your extension's activate function
export function activate(context: vscode.ExtensionContext) {
  logger.trace("oil.code extension started.");

  // Activate decorations to hide prefixes
  activateDecorations(context);

  // Reset preview state
  previewState = {
    previewedFile: null,
    previewedEditor: null,
    cursorListenerDisposable: null,
    isDirectory: false,
    previewFilePath: null,
  };

  preventOilInRecentFiles();

  // Set up listener for extension changes (activation/deactivation)
  const extensionChangeListener = vscode.extensions.onDidChange(() => {
    logger.info("Extension change detected, checking for Vim extensions");
    attemptRegisteringVimKeymaps(1, 1000); // One retry after extension changes
  });

  // Add the listener to the subscriptions for proper disposal
  context.subscriptions.push(extensionChangeListener);

  // Make initial attempt to register Vim keymaps with retries
  attemptRegisteringVimKeymaps(
    MAX_EXTENSION_DETECTION_RETRIES,
    EXTENSION_DETECTION_DELAY
  );

  context.subscriptions.push(
    logger,
    vscode.window.onDidChangeActiveTextEditor(onDidChangeActiveTextEditor),
    vscode.workspace.onDidSaveTextDocument(onDidSaveTextDocument),
    vscode.commands.registerCommand("oil-code.open", openOil),
    vscode.commands.registerCommand("oil-code.select", select),
    vscode.commands.registerCommand("oil-code.openParent", openParent),
    vscode.commands.registerCommand("oil-code.preview", preview)
  );
}

// This method is called when your extension is deactivated
export function deactivate() {
  // Make sure to clean up by closing any preview
  closePreview();
}
