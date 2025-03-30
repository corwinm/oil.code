import path from "path";
import * as vscode from "vscode";
import * as fs from "fs";
import * as os from "os";

const tempFileName = "《 oil.code 》";

let tempFilePath: string | undefined;

let currentPath: string | undefined;

// Track files across directory navigation
interface FileTracking {
  previousPath: string;
  previousFiles: string[];
  deletedFiles: Map<string, string>; // Map of filename to full path
  visitedPaths: Set<string>;
}

// Initialize tracking state
let fileTracking: FileTracking = {
  previousPath: "",
  previousFiles: [],
  deletedFiles: new Map(),
  visitedPaths: new Set(),
};

// Track changes across directory navigation
interface PendingChanges {
  addedFiles: Set<string>; // Full paths of added files
  deletedFiles: Set<string>; // Full paths of deleted files
  renamedFiles: Map<string, string>; // Map of old path -> new path
}

let pendingChanges: PendingChanges = {
  addedFiles: new Set(),
  deletedFiles: new Set(),
  renamedFiles: new Map(),
};

// Initialize temp file path in system temp directory
tempFilePath = path.join(os.tmpdir(), tempFileName);

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

async function openParentFolderFiles() {
  const activeEditor = vscode.window.activeTextEditor;
  let folderPath: string | undefined;

  if (activeEditor) {
    const filePath = activeEditor.document.uri.fsPath;
    folderPath = vscode.Uri.file(filePath).with({
      path: require("path").dirname(filePath),
    }).fsPath;
  } else {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
      folderPath = workspaceFolders[0].uri.fsPath;
    }
  }

  if (folderPath && tempFilePath) {
    try {
      // Get the directory listing
      let directoryContent = await getDirectoryListing(folderPath);

      currentPath = folderPath;
      // Create a temporary file
      fs.writeFileSync(tempFilePath, directoryContent);

      // Open the temporary file
      let uri = vscode.Uri.file(tempFilePath);
      let doc = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(doc, { preview: true });
      // Set the language mode to "oil"
      await vscode.languages.setTextDocumentLanguage(doc, "oil");

      await checkAndDisableAutoSave();
    } catch (error) {
      vscode.window.showErrorMessage("Failed to create or open the temp file.");
    }
  } else {
    vscode.window.showErrorMessage("Unable to determine the folder to open.");
  }
}

async function getDirectoryListing(folderPath: string): Promise<string> {
  let pathUri = vscode.Uri.file(folderPath);
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

  // Update tracking when navigating to a new directory
  if (currentPath && currentPath !== folderPath) {
    // Store the current files before navigating
    fileTracking.previousPath = currentPath;
    fileTracking.previousFiles = [...listings];
    fileTracking.visitedPaths.add(folderPath);
  }

  return listings.join("\n");
}

// Track if the current file has been modified
let fileModified = false;

async function selectUnderCursor(overRideLineText?: string) {
  const activeEditor = vscode.window.activeTextEditor;

  if (!activeEditor) {
    vscode.window.showErrorMessage("No active editor found.");
    return;
  }
  // Check if the current file is our oil temp file by comparing just the filename
  if (path.basename(activeEditor.document.uri.fsPath) !== tempFileName) {
    return;
  }

  // If the document has unsaved changes, capture them before navigating
  if (activeEditor.document.isDirty && !overRideLineText) {
    // Capture current content before navigating
    const currentContent = activeEditor.document.getText();
    const currentLines = currentContent.split("\n");

    // Get the current directory listing (what should be shown)
    if (currentPath) {
      const expectedContent = await getDirectoryListing(currentPath);
      const expectedLines = expectedContent.split("\n");

      // Track changes without prompting
      await captureChangesForNavigation(
        currentPath,
        expectedLines,
        currentLines
      );
    }
  }

  const document = activeEditor.document;
  const cursorPosition = activeEditor.selection.active;
  const lineText =
    overRideLineText ?? document.lineAt(cursorPosition.line).text;
  const fileName = lineText.trim();

  if (!fileName) {
    vscode.window.showErrorMessage(
      "No file name or directory found under the cursor."
    );
    return;
  }

  const currentFilePath = document.uri.fsPath;
  const currentFolderPath = currentPath || path.dirname(currentFilePath);
  const targetPath = path.join(currentFolderPath, fileName);

  if (fs.existsSync(targetPath) && fs.lstatSync(targetPath).isDirectory()) {
    try {
      // Save current directory content before navigation
      const currentContent = await vscode.workspace.fs.readDirectory(
        vscode.Uri.file(currentFolderPath)
      );
      const currentFileList = currentContent
        .map(([name, type]) =>
          type & vscode.FileType.Directory ? `${name}/` : name
        )
        .filter((name) => name !== tempFileName);

      // Add current path to visited paths before navigating
      fileTracking.visitedPaths.add(currentFolderPath);

      // Update tracking state
      if (currentPath !== targetPath) {
        fileTracking.previousPath = currentPath || "";
        fileTracking.previousFiles = currentFileList;
      }

      const directoryContent = await getDirectoryListing(targetPath);

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

      // Update the current path
      currentPath = targetPath;

      // Mark the file as modified if there are pending changes
      if (hasPendingChanges()) {
        fileModified = true;
      }

      return;
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to navigate to the directory: ${error}`
      );
      return;
    }
  }

  if (!fs.existsSync(targetPath)) {
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

async function openParentFolderFilesHandler() {
  await selectUnderCursor("../");
}

let lastActiveEditorWasOil = false;
async function onActiveTextEditorChangeHandler(
  editor: vscode.TextEditor | undefined
) {
  if (tempFilePath && lastActiveEditorWasOil) {
    lastActiveEditorWasOil = false;
    fs.unlink(tempFilePath, (err) => {
      if (err) {
        console.error("Failed to delete temporary file:", err);
      }
    });
    await checkAndEnableAutoSave();
  }
  if (editor?.document.uri.fsPath === tempFilePath && tempFilePath) {
    lastActiveEditorWasOil = true;
  }
}

// This method is called when your extension is activated
export function activate(context: vscode.ExtensionContext) {
  // Reset file tracking
  fileTracking = {
    previousPath: "",
    previousFiles: [],
    deletedFiles: new Map(),
    visitedPaths: new Set(),
  };

  // Reset pending changes
  pendingChanges = {
    addedFiles: new Set(),
    deletedFiles: new Set(),
    renamedFiles: new Map(),
  };

  // Reset the file modified flag
  fileModified = false;

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(onActiveTextEditorChangeHandler),
    vscode.commands.registerCommand("oil-code.open", openParentFolderFiles),
    vscode.commands.registerCommand("oil-code.select", selectUnderCursor),
    vscode.commands.registerCommand(
      "oil-code.openParentFolderFiles",
      openParentFolderFilesHandler
    ),

    // Track document changes
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (tempFilePath && event.document.uri.fsPath === tempFilePath) {
        fileModified = true;
      }
    }),

    // Add an event listener for file saves
    vscode.workspace.onDidSaveTextDocument(async (document) => {
      // Check if the saved document is our oil file
      if (tempFilePath && document.uri.fsPath === tempFilePath) {
        try {
          // Process changes - now we need to handle both current changes
          // and any pending changes from navigation

          // Read the current content of the file
          const content = document.getText();
          const lines = content.split("\n");

          // Get the current directory
          if (!currentPath) {
            vscode.window.showErrorMessage(
              "Current directory path is not set."
            );
            return;
          }

          // Get the existing directory listing
          const currentDirectoryContent = await getDirectoryListing(
            currentPath
          );
          const currentLines = currentDirectoryContent.split("\n");

          // Process the changes
          await handleOilFileSave(currentPath, currentLines, lines);

          // Refresh the directory listing after changes
          const updatedContent = await getDirectoryListing(currentPath);

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

          vscode.window.showInformationMessage("Directory changes applied");

          // Reset the pending changes and modified flag
          pendingChanges = {
            addedFiles: new Set(),
            deletedFiles: new Set(),
            renamedFiles: new Map(),
          };
          fileModified = false;
        } catch (error) {
          vscode.window.showErrorMessage(`Failed to process changes: ${error}`);
        }
      }
    }),

    // Reset the modified flag when a document is opened
    vscode.workspace.onDidOpenTextDocument((document) => {
      if (tempFilePath && document.uri.fsPath === tempFilePath) {
        fileModified = false;
      }
    })
  );
}

// Function to handle oil file changes
async function handleOilFileSave(
  currentPath: string,
  originalLines: string[],
  newLines: string[]
): Promise<void> {
  // Compare the original lines with new lines to detect changes

  // Create sets for quick lookup
  const originalEntries = new Set(originalLines);
  const newEntries = new Set(newLines);

  // Identify added and deleted entries
  const addedEntries = newLines.filter(
    (line) => !originalEntries.has(line) && line.trim() !== ""
  );

  const deletedEntries = originalLines.filter(
    (line) => !newEntries.has(line) && line !== "../" && line.trim() !== ""
  );

  // Check for cross-directory moves
  const movedRenamedPairs: Array<[string, string]> = [];

  // Track newly deleted files
  for (const deletedFile of deletedEntries) {
    if (!deletedFile.endsWith("/")) {
      // Only track files, not directories
      const fullPath = path.join(currentPath, deletedFile);
      fileTracking.deletedFiles.set(deletedFile, fullPath);
    }
  }

  // Check if any added files match recently deleted files (cross-directory moves)
  for (const addedFile of addedEntries) {
    if (!addedFile.endsWith("/")) {
      // Only match files, not directories
      for (const [
        deletedFile,
        fullOrigPath,
      ] of fileTracking.deletedFiles.entries()) {
        if (
          path.basename(addedFile) === path.basename(deletedFile) &&
          fs.existsSync(fullOrigPath)
        ) {
          // This looks like a move operation!
          movedRenamedPairs.push([
            fullOrigPath,
            path.join(currentPath, addedFile),
          ]);

          // Remove from regular processing
          const addedIndex = addedEntries.indexOf(addedFile);
          if (addedIndex !== -1) {
            addedEntries.splice(addedIndex, 1);
          }

          // Remove from deletion tracking
          fileTracking.deletedFiles.delete(deletedFile);
          break;
        }
      }
    }
  }

  // Regular rename detection - for files in the same directory
  const renamedPairs: Array<[string, string]> = [];
  const finalAddedEntries = [...addedEntries];
  const finalDeletedEntries = [...deletedEntries];

  // Group entries by type (file or directory)
  const addedFiles = addedEntries.filter((e) => !e.endsWith("/"));
  const addedDirs = addedEntries.filter((e) => e.endsWith("/"));
  const deletedFiles = deletedEntries.filter((e) => !e.endsWith("/"));
  const deletedDirs = deletedEntries.filter((e) => e.endsWith("/"));

  // Try to match renames - simple heuristic based on count
  if (addedFiles.length > 0 && deletedFiles.length > 0) {
    // If same number of added and deleted files, assume they're renames
    if (addedFiles.length === deletedFiles.length) {
      for (let i = 0; i < deletedFiles.length; i++) {
        renamedPairs.push([deletedFiles[i], addedFiles[i]]);
        // Remove these from the added/deleted lists
        const addedIndex = finalAddedEntries.indexOf(addedFiles[i]);
        if (addedIndex !== -1) {
          finalAddedEntries.splice(addedIndex, 1);
        }
        const deletedIndex = finalDeletedEntries.indexOf(deletedFiles[i]);
        if (deletedIndex !== -1) {
          finalDeletedEntries.splice(deletedIndex, 1);
        }
      }
    }
  }

  // Do the same for directories
  if (addedDirs.length > 0 && deletedDirs.length > 0) {
    if (addedDirs.length === deletedDirs.length) {
      for (let i = 0; i < deletedDirs.length; i++) {
        renamedPairs.push([deletedDirs[i], addedDirs[i]]);
        // Remove these from the added/deleted lists
        const addedIndex = finalAddedEntries.indexOf(addedDirs[i]);
        if (addedIndex !== -1) {
          finalAddedEntries.splice(addedIndex, 1);
        }
        const deletedIndex = finalDeletedEntries.indexOf(deletedDirs[i]);
        if (deletedIndex !== -1) {
          finalDeletedEntries.splice(deletedIndex, 1);
        }
      }
    }
  }

  // If no changes, do nothing
  if (
    finalAddedEntries.length === 0 &&
    finalDeletedEntries.length === 0 &&
    renamedPairs.length === 0 &&
    movedRenamedPairs.length === 0
  ) {
    return;
  }

  // Build the confirmation message
  let message = "The following changes will be applied:\n\n";

  if (movedRenamedPairs.length > 0) {
    message += "Files to move across directories:\n";
    movedRenamedPairs.forEach(([oldPath, newPath]) => {
      message += `  - ${path.basename(oldPath)} → ${newPath.replace(
        currentPath + path.sep,
        ""
      )}\n`;
    });
    message += "\n";
  }

  if (renamedPairs.length > 0) {
    message += "Items to rename:\n";
    renamedPairs.forEach(([oldName, newName]) => {
      message += `  - ${oldName} → ${newName}\n`;
    });
    message += "\n";
  }

  if (finalAddedEntries.length > 0) {
    message += "New items to create:\n";
    finalAddedEntries.forEach((item) => {
      message += `  - ${item}\n`;
    });
    message += "\n";
  }

  if (finalDeletedEntries.length > 0) {
    message += "Items to delete:\n";
    finalDeletedEntries.forEach((item) => {
      message += `  - ${item}\n`;
    });
  }

  message += "\nDo you want to apply these changes?";

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

  // Process cross-directory moves first
  for (const [oldPath, newPath] of movedRenamedPairs) {
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
        `Failed to move file: ${path.basename(oldPath)} to ${newPath.replace(
          currentPath + path.sep,
          ""
        )} - ${error}`
      );
    }
  }

  // Process the confirmed changes for renames in the same directory
  for (const [oldName, newName] of renamedPairs) {
    const oldPath = path.join(currentPath, oldName);
    const newPath = path.join(currentPath, newName);

    // Check if this is a rename including directories
    if (
      newName.includes("/") &&
      !newName.endsWith("/") &&
      !oldName.includes("/")
    ) {
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
          `Failed to rename and move: ${oldName} to ${newName} - ${error}`
        );
      }
    } else {
      // Regular rename
      try {
        fs.renameSync(oldPath, newPath);
      } catch (error) {
        vscode.window.showErrorMessage(
          `Failed to rename: ${oldName} to ${newName} - ${error}`
        );
      }
    }
  }

  // Handle added files/directories
  for (const line of finalAddedEntries) {
    const newFilePath = path.join(currentPath, line);

    if (line.endsWith("/")) {
      // Create directory
      try {
        fs.mkdirSync(newFilePath);
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to create directory: ${line}`);
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
        vscode.window.showErrorMessage(`Failed to create file: ${line}`);
      }
    }
  }

  // Handle deleted files/directories
  for (const line of finalDeletedEntries) {
    const filePath = path.join(currentPath, line);

    try {
      if (line.endsWith("/")) {
        // This is a directory - remove recursively
        await removeDirectoryRecursively(filePath);
      } else {
        // This is a file
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to delete: ${line} - ${error}`);
    }
  }

  // Clear the deleted files tracking after successful save
  // But keep only recent deletions (within the last 5 minutes)
  const now = Date.now();
  for (const [key, _] of fileTracking.deletedFiles) {
    fileTracking.deletedFiles.delete(key);
  }
}

// Helper function to capture changes before navigating
async function captureChangesForNavigation(
  currentDirPath: string,
  expectedLines: string[],
  currentLines: string[]
): Promise<void> {
  // Create sets for quick lookup
  const originalEntries = new Set(expectedLines);
  const newEntries = new Set(currentLines);

  // Identify added and deleted entries
  const addedEntries = currentLines.filter(
    (line) => !originalEntries.has(line) && line.trim() !== ""
  );

  const deletedEntries = expectedLines.filter(
    (line) => !newEntries.has(line) && line !== "../" && line.trim() !== ""
  );

  // Track deleted files
  for (const deletedFile of deletedEntries) {
    if (!deletedFile.endsWith("/")) {
      const fullPath = path.join(currentDirPath, deletedFile);
      pendingChanges.deletedFiles.add(fullPath);

      // Also track them for cross-directory moves
      fileTracking.deletedFiles.set(deletedFile, fullPath);
    }
  }

  // Track added files
  for (const addedFile of addedEntries) {
    if (!addedFile.endsWith("/")) {
      pendingChanges.addedFiles.add(path.join(currentDirPath, addedFile));
    }
  }

  // Mark that we have changes to process
  if (addedEntries.length > 0 || deletedEntries.length > 0) {
    fileModified = true;
  }
}

// Helper function to check if there are pending changes
function hasPendingChanges(): boolean {
  return (
    pendingChanges.addedFiles.size > 0 ||
    pendingChanges.deletedFiles.size > 0 ||
    pendingChanges.renamedFiles.size > 0
  );
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

// This method is called when your extension is deactivated
export function deactivate() {}
