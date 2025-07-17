import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { OIL_SCHEME, OIL_PREVIEW_SCHEME } from "../constants";
import { getOilState, getCurrentPath } from "../state/oilState";
import { previewState, setPreviewState } from "../state/previewState";
import { uriPathToDiskPath } from "../utils/pathUtils";
import { getDirectoryListing } from "../utils/fileUtils";
import { updateDecorations } from "../decorations";
import { oilPreviewProvider } from "../providers/providers";
import { disableUpdatePreview } from "./disableUpdatePreview";
import { logger } from "../logger";

export async function preview(overrideEnabled: boolean = false) {
  const activeEditor = vscode.window.activeTextEditor;

  if (!activeEditor) {
    vscode.window.showErrorMessage("No active editor found.");
    return;
  }

  // Check if the current file is our oil temp file
  if (activeEditor.document.uri.scheme !== OIL_SCHEME) {
    return;
  }

  const document = activeEditor.document;
  const cursorPosition = activeEditor.selection.active;
  const lineText = document.lineAt(cursorPosition.line).text;
  const fileName = lineText.replace(/^\/\d{3} /, "").trim();

  if (!fileName) {
    vscode.window.showInformationMessage(
      "No file or directory found under cursor."
    );
    return;
  }

  const oilState = getOilState();
  if (!oilState) {
    vscode.window.showErrorMessage("Failed to get oil current directory.");
    return;
  }

  const currentFolderPath = getCurrentPath();
  if (!currentFolderPath) {
    vscode.window.showErrorMessage("No current folder path found.");
    return;
  }

  let targetPath: string;

  // Handle "../" special case
  if (fileName === "../") {
    targetPath = path.dirname(uriPathToDiskPath(currentFolderPath));
  } else {
    targetPath = path.join(uriPathToDiskPath(currentFolderPath), fileName);
  }

  if (!fs.existsSync(targetPath)) {
    vscode.window.showErrorMessage(`"${fileName}" does not exist.`);
    return;
  }

  const isDir = fs.lstatSync(targetPath).isDirectory();

  // If this file/directory is already being previewed, close the preview (toggle behavior)
  if (previewState.previewedFile === targetPath) {
    const newPreviewState = {
      ...previewState,
      previewEnabled: overrideEnabled,
    };
    setPreviewState(newPreviewState);
    if (!overrideEnabled) {
      await closePreview();
    }
    return;
  }

  const newPreviewState = { ...previewState, previewEnabled: true };
  setPreviewState(newPreviewState);

  // Preview differently based on whether it's a file or directory
  if (isDir) {
    await previewDirectory(targetPath);
  } else {
    await previewFile(targetPath);
  }
}

async function previewFile(targetPath: string) {
  try {
    const fileExists = fs.existsSync(targetPath);
    // Read the file content from disk
    const fileContent = fileExists
      ? await vscode.workspace.fs.readFile(vscode.Uri.file(targetPath))
      : Buffer.from("");

    // Create a unique preview URI for the file using the original filename to preserve extension
    const previewName = path.basename(targetPath);
    const previewUri = vscode.Uri.parse(
      `${OIL_PREVIEW_SCHEME}://oil-preview/${previewName}`
    );

    const previousPreviewUri = previewState.previewUri;

    // Write content to the virtual file system
    oilPreviewProvider.writeFile(previewUri, fileContent);

    // Open the virtual document
    const fileDoc = await vscode.workspace.openTextDocument(previewUri);

    // Open to the side (right split) in preview mode
    const editor = await vscode.window.showTextDocument(fileDoc, {
      viewColumn: vscode.ViewColumn.Beside, // Opens in the editor group to the right
      preview: true,
      preserveFocus: true, // Keeps focus on the oil file
    });

    // Update preview state
    const newPreviewState = {
      ...previewState,
      previewedFile: targetPath,
      previewedEditor: editor,
      isDirectory: false,
      previewUri: previewUri,
    };
    setPreviewState(newPreviewState);

    if (previousPreviewUri) {
      oilPreviewProvider.delete(previousPreviewUri);
    }

    // Start listening for cursor movements if not already listening
    if (!previewState.cursorListenerDisposable) {
      const newState = {
        ...previewState,
        cursorListenerDisposable: vscode.window.onDidChangeTextEditorSelection(
          updatePreviewBasedOnCursorPosition
        ),
      };
      setPreviewState(newState);
    }
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to preview file: ${error}`);
  }
}

async function previewDirectory(directoryPath: string) {
  try {
    const oilState = getOilState();
    if (!oilState) {
      vscode.window.showErrorMessage("No oil state found.");
      return;
    }
    const previewName = path.basename(directoryPath);

    if (previewState.previewedFile === directoryPath) {
      return; // If already previewing this directory, do nothing
    }

    // Get directory listing in oil format
    const directoryContent = await getDirectoryListing(
      directoryPath,
      oilState,
      true
    );

    const previewUri = vscode.Uri.parse(
      `${OIL_PREVIEW_SCHEME}://oil-preview/${previewName}`
    );

    // Write content to the virtual file
    oilPreviewProvider.writeFile(previewUri, Buffer.from(directoryContent));

    // Open the virtual document
    const fileDoc = await vscode.workspace.openTextDocument(previewUri);
    await vscode.languages.setTextDocumentLanguage(fileDoc, "oil");

    // Show the document to the side
    const editor = await vscode.window.showTextDocument(fileDoc, {
      viewColumn: vscode.ViewColumn.Beside,
      preview: true,
      preserveFocus: true,
    });
    updateDecorations(editor);

    // Update preview state
    const newPreviewState = {
      ...previewState,
      previewedFile: directoryPath,
      previewedEditor: editor,
      isDirectory: true,
      previewUri: previewUri,
    };
    setPreviewState(newPreviewState);

    // Start listening for cursor movements if not already listening
    if (!previewState.cursorListenerDisposable) {
      const newState = {
        ...previewState,
        cursorListenerDisposable: vscode.window.onDidChangeTextEditorSelection(
          updatePreviewBasedOnCursorPosition
        ),
      };
      setPreviewState(newState);
    }
  } catch (error) {
    logger.error("Failed to preview directory:", error);
  }
}

export async function closePreview() {
  // Stop listening for cursor movements
  if (previewState.cursorListenerDisposable) {
    previewState.cursorListenerDisposable.dispose();
    const newState = { ...previewState, cursorListenerDisposable: null };
    setPreviewState(newState);
  }

  // Close the preview if it's open
  if (previewState.previewedFile && previewState.previewUri) {
    // For both file and directory previews using OilPreviewFileSystemProvider
    const previewUri = previewState.previewUri;

    // Reset state
    const newPreviewState = {
      ...previewState,
      previewedFile: null,
      previewedEditor: null,
      isDirectory: false,
      previewUri: null,
    };
    setPreviewState(newPreviewState);

    // Close any editors showing this virtual file
    for (const editor of vscode.window.visibleTextEditors) {
      if (
        editor.document.uri.scheme === OIL_PREVIEW_SCHEME &&
        editor.document.uri.toString() === previewUri.toString()
      ) {
        // Close the editor showing the preview
        await vscode.commands.executeCommand(
          "workbench.action.closeActiveEditor",
          editor.document.uri
        );
      }
    }

    // Clean up the virtual file
    try {
      oilPreviewProvider.delete(previewUri);
    } catch (err) {
      logger.error("Failed to delete virtual preview file:", err);
    }
  }
}

async function updatePreviewBasedOnCursorPosition(
  event: vscode.TextEditorSelectionChangeEvent
) {
  // Only respond to selection changes in the oil file
  if (
    !event.textEditor ||
    event.textEditor.document.uri.scheme !== OIL_SCHEME ||
    disableUpdatePreview
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
  const fileName = lineText.replace(/^\/\d{3} /, "").trim();

  // Skip if cursor is on empty line
  if (!fileName) {
    return;
  }

  const oilState = getOilState();
  if (!oilState) {
    vscode.window.showErrorMessage("Failed to get oil state.");
    return;
  }
  const currentFolderPath = getCurrentPath();
  if (!currentFolderPath) {
    vscode.window.showErrorMessage("No current folder path found.");
    return;
  }
  const previousPreviewedUri = previewState.previewUri;

  let targetPath: string;

  // Handle "../" special case
  if (fileName === "../") {
    targetPath = path.dirname(uriPathToDiskPath(currentFolderPath));
  } else {
    targetPath = path.join(uriPathToDiskPath(currentFolderPath), fileName);
  }

  // Skip if same file/directory is already being previewed
  if (previewState.previewedFile === targetPath) {
    return;
  }

  // Determine if it's a directory or file
  let isDir = false;
  try {
    isDir = fs.lstatSync(targetPath).isDirectory();
  } catch (error) {
    isDir = false; // If it doesn't exist, treat as file
  }

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

  if (previousPreviewedUri) {
    oilPreviewProvider.delete(previousPreviewedUri);
  }
}
