import path from "path";
import * as vscode from "vscode";
import * as fs from "fs";

const tempFileName = "[Oil.code]";

let tempFilePath: string | undefined;

let currentPath: string | undefined;

const workspaceFolders = vscode.workspace.workspaceFolders;

if (workspaceFolders && workspaceFolders.length > 0) {
  const folderPath = workspaceFolders[0].uri.fsPath;
  tempFilePath = path.join(folderPath, ".", tempFileName);
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

  return listings.join("\n");
}

async function selectUnderCursor() {
  const activeEditor = vscode.window.activeTextEditor;

  if (!activeEditor) {
    vscode.window.showErrorMessage("No active editor found.");
    return;
  }
  // Check if the current file is our oil temp file by comparing just the filename
  if (path.basename(activeEditor.document.uri.fsPath) !== tempFileName) {
    return;
  }

  const document = activeEditor.document;
  const cursorPosition = activeEditor.selection.active;
  const lineText = document.lineAt(cursorPosition.line).text;
  const fileName = lineText.trim();

  if (!fileName) {
    vscode.window.showErrorMessage(
      "No file name or directory found under the cursor."
    );
    return;
  }

  const currentFilePath = document.uri.fsPath;
  const currentFolderPath = currentPath || path.dirname(currentFilePath);
  const targetFilePath = path.join(currentFolderPath, fileName);

  const targetPath = path.join(currentFolderPath, fileName);

  if (fs.existsSync(targetPath) && fs.lstatSync(targetPath).isDirectory()) {
    try {
      const directoryContent = await getDirectoryListing(targetPath);
      fs.writeFileSync(tempFilePath!, directoryContent);
      const doc = await vscode.workspace.openTextDocument(
        vscode.Uri.file(tempFilePath!)
      );
      await vscode.window.showTextDocument(doc, { preview: true });
      currentPath = targetPath;
      return;
    } catch (error) {
      vscode.window.showErrorMessage("Failed to navigate to the directory.");
      return;
    }
  }

  if (!fs.existsSync(targetFilePath)) {
    vscode.window.showErrorMessage(`File "${fileName}" does not exist.`);
    return;
  }

  try {
    await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
    const fileUri = vscode.Uri.file(targetFilePath);
    const fileDoc = await vscode.workspace.openTextDocument(fileUri);
    await vscode.window.showTextDocument(fileDoc);
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to open file.`);
  }
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
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(onActiveTextEditorChangeHandler),
    vscode.commands.registerCommand("oil-code.open", openParentFolderFiles),
    vscode.commands.registerCommand("oil-code.select", selectUnderCursor),

    // Add an event listener for file saves
    vscode.workspace.onDidSaveTextDocument(async (document) => {
      // Check if the saved document is our oil file
      if (tempFilePath && document.uri.fsPath === tempFilePath) {
        try {
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

          // Process the changes (this is where you'd implement your logic)
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
        } catch (error) {
          vscode.window.showErrorMessage(`Failed to process changes: ${error}`);
        }
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

  // Detect potential renames by matching file types
  const renamedPairs: Array<[string, string]> = [];
  const finalAddedEntries = [...addedEntries];
  const finalDeletedEntries = [...deletedEntries];

  // Group entries by type (file or directory)
  const addedFiles = addedEntries.filter((e) => !e.endsWith("/"));
  const addedDirs = addedEntries.filter((e) => e.endsWith("/"));
  const deletedFiles = deletedEntries.filter((e) => !e.endsWith("/"));
  const deletedDirs = deletedEntries.filter((e) => e.endsWith("/"));

  // Try to match renames - simple heuristic based on count
  // For more sophisticated detection, could use similarity metrics or file contents
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
    renamedPairs.length === 0
  ) {
    return;
  }

  // Build the confirmation message
  let message = "The following changes will be applied:\n\n";

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

  // Process the confirmed changes

  // Handle renamed files/directories
  for (const [oldName, newName] of renamedPairs) {
    const oldPath = path.join(currentPath, oldName);
    const newPath = path.join(currentPath, newName);

    try {
      fs.renameSync(oldPath, newPath);
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to rename: ${oldName} to ${newName}`
      );
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
        // This is a directory
        // For safety, we'll only delete empty directories
        if (fs.readdirSync(filePath).length === 0) {
          fs.rmdirSync(filePath);
        } else {
          vscode.window.showWarningMessage(`Directory not empty: ${line}`);
        }
      } else {
        // This is a file
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to delete: ${line}`);
    }
  }
}

// This method is called when your extension is deactivated
export function deactivate() {}
