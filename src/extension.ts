import path from "path";
import * as vscode from "vscode";
import * as fs from "fs";
import { activateDecorations } from "./decorations";

const logger = vscode.window.createOutputChannel("oil.code", { log: true });

interface OilEntry {
  identifier: string;
  value: string;
  path: string;
  isDir: boolean;
}

interface OilState {
  tempFileUri: vscode.Uri;
  currentPath: string | undefined;
  identifierCounter: number;
  visitedPaths: Map<string, string[]>;
  editedPaths: Map<string, string[]>;
  openAfterSave?: string;
}

const oils = new Map<string, OilState>();

// Custom URI scheme for main oil files
const OIL_SCHEME = "oil";

// Custom URI scheme for oil preview files
const OIL_PREVIEW_SCHEME = "oil-preview";

function initOilState() {
  const currentOrWorkspacePath = vscode.window.activeTextEditor
    ? path.dirname(vscode.window.activeTextEditor.document.uri.fsPath)
    : vscode.workspace.workspaceFolders?.at(0)?.uri.fsPath;

  const tempFileUri = vscode.Uri.parse(
    `${OIL_SCHEME}:/${currentOrWorkspacePath}`
  );

  const newState = {
    tempFileUri: tempFileUri,
    currentPath: currentOrWorkspacePath,
    identifierCounter: 1,
    visitedPaths: new Map(),
    editedPaths: new Map(),
  };

  oils.set(tempFileUri.toString(), newState);

  return newState;
}

function getOilState(): OilState | undefined {
  const activeEditor = vscode.window.activeTextEditor;
  if (activeEditor) {
    const documentUri = activeEditor.document.uri;
    if (documentUri.scheme === OIL_SCHEME) {
      return oils.get(documentUri.toString());
    }
  }
  return undefined;
}

// Helper function to update the URI when changing directories
function updateOilUri(oilState: OilState, newPath: string): vscode.Uri {
  // Remove the old URI from the oils map
  oils.delete(oilState.tempFileUri.toString());

  const newUri = vscode.Uri.parse(`${OIL_SCHEME}:/${newPath}`);

  // Update the state with the new URI
  oilState.tempFileUri = newUri;

  // Add the updated state to the map with the new key
  oils.set(newUri.toString(), oilState);

  return newUri;
}

// Virtual file system provider for oil main files
class OilFileSystemProvider implements vscode.FileSystemProvider {
  private _onDidChangeFile = new vscode.EventEmitter<
    vscode.FileChangeEvent[]
  >();
  readonly onDidChangeFile = this._onDidChangeFile.event;

  private documents = new Map<string, Uint8Array>();

  // Create or update an in-memory document
  writeFile(uri: vscode.Uri, content: Uint8Array): void {
    this.documents.set(uri.toString(), content);
    this._onDidChangeFile.fire([{ type: vscode.FileChangeType.Changed, uri }]);
  }

  // Read an in-memory document
  readFile(uri: vscode.Uri): Uint8Array {
    const content = this.documents.get(uri.toString());
    if (content) {
      return content;
    }
    throw vscode.FileSystemError.FileNotFound(uri);
  }

  // Delete an in-memory document
  delete(uri: vscode.Uri): void {
    this.documents.delete(uri.toString());
    this._onDidChangeFile.fire([{ type: vscode.FileChangeType.Deleted, uri }]);
  }

  // Required methods for FileSystemProvider interface
  watch(_uri: vscode.Uri): vscode.Disposable {
    return { dispose: () => {} };
  }
  stat(_uri: vscode.Uri): vscode.FileStat {
    return {
      type: vscode.FileType.File,
      ctime: Date.now(),
      mtime: Date.now(),
      size: this.documents.get(_uri.toString())?.length || 0,
    };
  }
  readDirectory(_uri: vscode.Uri): [string, vscode.FileType][] {
    return [];
  }
  createDirectory(_uri: vscode.Uri): void {}
  rename(_oldUri: vscode.Uri, _newUri: vscode.Uri): void {}
}

// Create the provider
const oilFileProvider = new OilFileSystemProvider();

// Virtual file system provider for oil preview documents
class OilPreviewFileSystemProvider implements vscode.FileSystemProvider {
  private _onDidChangeFile = new vscode.EventEmitter<
    vscode.FileChangeEvent[]
  >();
  readonly onDidChangeFile = this._onDidChangeFile.event;

  private documents = new Map<string, Uint8Array>();

  // Create or update an in-memory document
  writeFile(uri: vscode.Uri, content: Uint8Array): void {
    this.documents.set(uri.toString(), content);
    this._onDidChangeFile.fire([{ type: vscode.FileChangeType.Changed, uri }]);
  }

  // Read an in-memory document
  readFile(uri: vscode.Uri): Uint8Array {
    const content = this.documents.get(uri.toString());
    if (content) return content;
    throw vscode.FileSystemError.FileNotFound(uri);
  }

  // Delete an in-memory document
  delete(uri: vscode.Uri): void {
    this.documents.delete(uri.toString());
    this._onDidChangeFile.fire([{ type: vscode.FileChangeType.Deleted, uri }]);
  }

  // Required methods for FileSystemProvider interface
  watch(_uri: vscode.Uri): vscode.Disposable {
    return { dispose: () => {} };
  }
  stat(_uri: vscode.Uri): vscode.FileStat {
    return {
      type: vscode.FileType.File,
      ctime: Date.now(),
      mtime: Date.now(),
      size: this.documents.get(_uri.toString())?.length || 0,
    };
  }
  readDirectory(_uri: vscode.Uri): [string, vscode.FileType][] {
    return [];
  }
  createDirectory(_uri: vscode.Uri): void {}
  rename(_oldUri: vscode.Uri, _newUri: vscode.Uri): void {}
}

// Create and register the provider
const oilPreviewProvider = new OilPreviewFileSystemProvider();

// Function to exclude oil files from recent files by adding to exclude patterns
async function configureRecentFilesExclusions() {
  try {
    // Exclude from files.exclude (affects Explorer view and cmd+p search)
    const filesConfig = vscode.workspace.getConfiguration("files");
    const filesExcludes = filesConfig.get<object>("exclude") || {};

    // Add our patterns to excludes - more comprehensive with escaped characters
    const updatedFilesExcludes = {
      ...filesExcludes,
      [`${OIL_SCHEME}:/**`]: true,
      [`${OIL_PREVIEW_SCHEME}:/**`]: true,
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

    // Add our patterns to search excludes - with same comprehensive patterns
    const updatedSearchExcludes = {
      ...searchExcludes,
      [`${OIL_SCHEME}:/**`]: true,
      [`${OIL_PREVIEW_SCHEME}:/**`]: true,
    };

    // Update the search configuration
    await searchConfig.update(
      "exclude",
      updatedSearchExcludes,
      vscode.ConfigurationTarget.Global
    );

    // Also exclude from file watcher to avoid unnecessary refresh events
    const watcherConfig = vscode.workspace.getConfiguration(
      "files.watcherExclude"
    );
    const watcherExcludes = watcherConfig.get<object>("") || {};

    const updatedWatcherExcludes = {
      ...watcherExcludes,
      [`${OIL_SCHEME}:/**`]: true,
      [`${OIL_PREVIEW_SCHEME}:/**`]: true,
    };

    await watcherConfig.update(
      "",
      updatedWatcherExcludes,
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

  if (activeEditor?.document.languageId === "oil") {
    openParent();
    return;
  }

  const oilState = initOilState();
  const activeFile = path.basename(activeEditor?.document.uri.fsPath || "");

  const folderPath = oilState.currentPath;

  if (folderPath) {
    try {
      // Get the directory listing
      let directoryContent = await getDirectoryListing(folderPath, oilState);

      // Create an in-memory file
      oilFileProvider.writeFile(
        oilState.tempFileUri,
        Buffer.from(directoryContent)
      );

      // Open the in-memory document
      let doc = await vscode.workspace.openTextDocument(oilState.tempFileUri);
      await vscode.languages.setTextDocumentLanguage(doc, "oil");

      let editor = await vscode.window.showTextDocument(doc, { preview: true });

      if (activeEditor) {
        await vscode.commands.executeCommand(
          "workbench.action.closeActiveEditor",
          activeEditor.document.uri
        );
      }

      // Position cursor on the previously selected file if it exists in this directory
      positionCursorOnFile(editor, activeFile);

      await checkAndDisableAutoSave();
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to create or open the oil file: ${error}`
      );
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

  let listings = results.map(([name, type]) => {
    return type & vscode.FileType.Directory ? `${name}/` : name;
  });

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
  // Check if the current file is our oil file by checking the scheme
  if (activeEditor.document.uri.scheme !== OIL_SCHEME) {
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

  if (fs.existsSync(targetPath) && fs.lstatSync(targetPath).isDirectory()) {
    try {
      // Update the URI to represent the new directory path
      const oldUri = document.uri;
      oilState.currentPath = targetPath;

      // Update the URI to reflect the new directory
      const newUri = updateOilUri(oilState, targetPath);

      const directoryContent = await getDirectoryListing(targetPath, oilState);

      // Transfer the content to the new URI
      oilFileProvider.writeFile(newUri, Buffer.from(directoryContent));

      // Open the document with the new URI
      const newDoc = await vscode.workspace.openTextDocument(newUri);
      await vscode.languages.setTextDocumentLanguage(newDoc, "oil");

      // Close the old document
      await vscode.window.showTextDocument(oldUri);
      await vscode.commands.executeCommand(
        "workbench.action.revertAndCloseActiveEditor"
      );

      // Show the new document in the same editor
      const editor = await vscode.window.showTextDocument(newDoc, {
        viewColumn: activeEditor.viewColumn,
        preview: true,
      });

      // Remove the old URI from the oils map
      oils.delete(oldUri.toString());

      // Position cursor appropriately
      if (isGoingUp) {
        // When going up a directory, we need to find the directory we came from
        const lastSelected = currentFile.replace(/^\/\d{3} /, "");

        // Use setTimeout to ensure the editor content is updated
        setTimeout(() => {
          if (editor) {
            // Find the line with the directory name (with trailing slash)
            const docText = editor.document.getText();
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
              editor.selection = new vscode.Selection(
                foundIndex,
                0,
                foundIndex,
                0
              );
              editor.revealRange(
                new vscode.Range(foundIndex, 0, foundIndex, 0)
              );
            } else {
              // Default to first line if not found
              editor.selection = new vscode.Selection(0, 0, 0, 0);
            }
          }
        }, 100);
      } else {
        // When going into a directory, position at first line
        editor.selection = new vscode.Selection(0, 0, 0, 0);
      }

      // Mark the file as modified if there are pending changes
      if (!hasPendingChanges()) {
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
      if (document.isDirty) {
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
    const fileUri = vscode.Uri.file(targetPath);
    const fileDoc = await vscode.workspace.openTextDocument(fileUri);
    await vscode.window.showTextDocument(activeEditor.document.uri);
    await vscode.commands.executeCommand(
      "workbench.action.revertAndCloseActiveEditor"
    );
    await vscode.window.showTextDocument(fileDoc, {
      viewColumn: activeEditor.viewColumn,
      preview: true,
    });
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to open file.`);
  }
}

async function openParent() {
  logger.trace("Opening parent directory...");
  await select("../");
}

async function onDidChangeActiveTextEditor(
  editor: vscode.TextEditor | undefined
) {
  if (!editor) {
    return;
  }
  const oilState = getOilState();

  // Close preview when leaving oil view
  if (editor.document.uri.scheme !== OIL_SCHEME && previewState.previewedFile) {
    await closePreview();
  }
  if (!oilState) {
    await checkAndEnableAutoSave();
    return;
  }
}

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
  previewUri: vscode.Uri | null; // URI to the in-memory preview document
}

let previewState: PreviewState = {
  previewedFile: null,
  previewedEditor: null,
  cursorListenerDisposable: null,
  isDirectory: false,
  previewUri: null,
};

// Function to preview a file
async function previewFile(targetPath: string) {
  try {
    const fileUri = vscode.Uri.file(targetPath);
    const fileDoc = await vscode.workspace.openTextDocument(fileUri);

    // Close previous previewed editor if it exists
    if (previewState.previewedEditor) {
      // Check if the preview editor's document is still open
      const isPreviewOpen = vscode.window.visibleTextEditors.some(
        (editor) =>
          editor.document.uri.toString() ===
          previewState.previewedEditor!.document.uri.toString()
      );

      if (isPreviewOpen) {
        await vscode.commands.executeCommand(
          "workbench.action.closeActiveEditor",
          previewState.previewedEditor.document.uri
        );
      }
    }

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

// Function to preview a directory with in-memory document
async function previewDirectory(directoryPath: string) {
  try {
    const oilState = getOilState();
    if (!oilState) {
      vscode.window.showErrorMessage("No oil state found.");
      return;
    }

    // Get directory listing in oil format
    const directoryContent = await getDirectoryListing(directoryPath, oilState);

    const previewName = path.basename(directoryPath);
    const previewUri = vscode.Uri.parse(
      `${OIL_PREVIEW_SCHEME}:/${previewName}`
    );

    // Check if the preview URI already exists
    if (
      previewState.previewUri &&
      previewState.previewUri.toString() === previewUri.toString()
    ) {
      // If the URI already exists, just update the content
      oilPreviewProvider.writeFile(previewUri, Buffer.from(directoryContent));
      return;
    }

    // Write content to the virtual file
    oilPreviewProvider.writeFile(previewUri, Buffer.from(directoryContent));

    // Open the virtual document
    const fileDoc = await vscode.workspace.openTextDocument(previewUri);
    await vscode.languages.setTextDocumentLanguage(fileDoc, "oil");

    // Close previous previewed editor if it exists
    if (previewState.previewedEditor) {
      const previewedEditorUri = previewState.previewedEditor.document.uri;
      setTimeout(async () => {
        // Check if the preview editor's document is still open in any visible editors
        const isPreviewOpen = vscode.window.visibleTextEditors.some(
          (editor) =>
            editor.document.uri.toString() === previewedEditorUri.toString()
        );

        if (isPreviewOpen) {
          await vscode.commands.executeCommand(
            "workbench.action.closeActiveEditor",
            previewedEditorUri
          );
        }
      }, 0);
    }

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
    previewState.previewUri = previewUri;

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
    event.textEditor.document.uri.scheme !== OIL_SCHEME
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
  const currentFolderPath = oilState.currentPath;
  if (!currentFolderPath) {
    vscode.window.showErrorMessage("No current folder path found.");
    return;
  }

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
    if (previewState.isDirectory && previewState.previewUri) {
      // For directory previews, close and clean up the virtual file
      const previewUri = previewState.previewUri;

      // Close any editors showing this virtual file
      for (const editor of vscode.window.visibleTextEditors) {
        if (editor.document.uri.toString() === previewUri.toString()) {
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
    previewState.previewUri = null;
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

function oilLinesToOilEntries(
  lines: string[],
  path: string
): Array<[string, OilEntry]> {
  const map = new Array<[string, OilEntry]>();
  for (const line of lines) {
    const entry = oilLineToOilEntry(line, path);
    if (entry.identifier === "/000") {
      continue;
    }
    map.push([entry.identifier, entry]);
  }
  return map;
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
    const visitedFiles = Array.from(oilState.visitedPaths.keys());
    const originalFilesMap = new Map<string, OilEntry>();
    visitedFiles.forEach((dir) => {
      const lines = oilState.visitedPaths.get(dir);
      if (lines) {
        const entriesMap = oilLinesToOilMap(lines, dir);
        entriesMap.forEach((entry, key) => {
          originalFilesMap.set(key, entry);
        });
      }
    });

    const movedLines = new Array<[string, string]>();
    const copiedLines = new Array<[string, string]>();
    const addedLines = new Set<string>();
    const deletedLines = new Set<string>();

    for (const [dirPath, lines] of oilState.editedPaths.entries()) {
      const editedEntries = oilLinesToOilMap(lines, dirPath);
      // Check for deleted entries
      const fileOriginalEntries = oilLinesToOilEntries(
        oilState.visitedPaths.get(dirPath) || [],
        dirPath
      );
      for (const [key, entry] of fileOriginalEntries) {
        if (!editedEntries.has(key)) {
          deletedLines.add(path.join(dirPath, entry.value));
        }
        if (
          editedEntries.has(key) &&
          entry.path === editedEntries.get(key)?.path &&
          entry.value !== editedEntries.get(key)?.value
        ) {
          // Check if the entry has been moved
          deletedLines.add(path.join(dirPath, entry.value));
        }
      }
    }

    for (const [dirPath, lines] of oilState.editedPaths.entries()) {
      const editedEntries = oilLinesToOilEntries(lines, dirPath);
      for (const [key, entry] of editedEntries) {
        const originalEntry = originalFilesMap.get(key);
        if (originalEntry) {
          // Check if the entry has been renamed or moved
          if (
            entry.value !== originalEntry.value ||
            entry.path !== originalEntry.path
          ) {
            copiedLines.push([
              path.join(originalEntry.path, originalEntry.value),
              path.join(dirPath, entry.value),
            ]);
          }
        } else {
          // New entry added
          addedLines.add(path.join(dirPath, entry.value));
        }
      }
    }
    // Check for moved entries
    // Check for entries that are both copied and deleted (these are moves)
    for (const [oldPath, newPath] of copiedLines) {
      if (deletedLines.has(oldPath)) {
        // This is actually a move operation (copy + delete)
        movedLines.push([oldPath, newPath]);
        deletedLines.delete(oldPath); // Remove from deletedLines since it's a move, not a delete
      }
    }
    // Filter out copied lines that are actually moves
    const filteredCopiedLines = copiedLines.filter(([oldPath, newPath]) => {
      // Check if this copy operation is already handled as a move
      return !movedLines.some(
        ([moveOldPath, moveNewPath]) =>
          oldPath === moveOldPath && newPath === moveNewPath
      );
    });

    // Replace the original copiedLines with the filtered version
    copiedLines.length = 0;
    copiedLines.push(...filteredCopiedLines);

    // Find items that are in both addedLines and deletedLines and remove them from both
    // This is a workaround for when file identifiers get out of sync
    const duplicates = new Set<string>();
    addedLines.forEach((addedItem) => {
      if (deletedLines.has(addedItem)) {
        duplicates.add(addedItem);
      }
    });

    // Remove duplicates from both sets
    duplicates.forEach((item) => {
      addedLines.delete(item);
      deletedLines.delete(item);
    });

    return {
      movedLines,
      copiedLines,
      addedLines,
      deletedLines,
    };
  }
}

// Format the path to be relative to the current working directory
function formatPath(path: string): string {
  return vscode.workspace.asRelativePath(path);
}

async function onDidSaveTextDocument(document: vscode.TextDocument) {
  // Check if the saved document is our oil file
  if (document.uri.scheme === OIL_SCHEME) {
    try {
      const oilState = getOilState();
      if (!oilState) {
        vscode.window.showErrorMessage("Failed to get oil state.");
        return;
      }
      if (!oilState.currentPath) {
        vscode.window.showErrorMessage("No current path found.");
        return;
      }

      // Process changes - now we need to handle both current changes
      // and any pending changes from navigation
      // Read the current content of the file
      const currentContent = document.getText();
      const currentLines = currentContent.split("\n");
      const currentValue = oilState.visitedPaths.get(oilState.currentPath);
      if (currentValue?.join("") !== currentLines.join("")) {
        oilState.editedPaths.set(oilState.currentPath, currentLines);
      }
      if (
        oilState.editedPaths.get(oilState.currentPath)?.join("") !==
        currentLines.join("")
      ) {
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

      // Check for duplicate destinations or existing file conflicts
      if (duplicateDestinations.size > 0 || existingFileConflicts.size > 0) {
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
        message,
        { modal: true },
        "Yes",
        "No"
      );
      if (response !== "Yes") {
        oilState.openAfterSave = undefined;
        return;
      }
      // Process the changes
      // Move files
      for (const [oldPath, newPath] of movedLines) {
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
            `Failed to move file: ${formatPath(oldPath)} to ${newPath.replace(
              oilState.currentPath + path.sep,
              ""
            )} - ${error}`
          );
        }
      }
      // Copy files
      for (const [oldPath, newPath] of copiedLines) {
        try {
          // Create directory structure if needed
          const isDir = newPath.endsWith("/");
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

      if (oilState.openAfterSave) {
        await select(oilState.openAfterSave);
        oilState.openAfterSave = undefined;
      }
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

vim.api.nvim_create_autocmd({'FileType'}, {
  pattern = {"oil"},
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

async function preview() {
  const activeEditor = vscode.window.activeTextEditor;

  if (!activeEditor) {
    vscode.window.showErrorMessage("No active editor found.");
    return;
  }

  // Check if the current file is our oil temp file
  if (path.basename(activeEditor.document.uri.scheme) !== OIL_SCHEME) {
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

  const currentFolderPath = oilState.currentPath;
  if (!currentFolderPath) {
    vscode.window.showErrorMessage("No current folder path found.");
    return;
  }

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

// In your extension's activate function
export function activate(context: vscode.ExtensionContext) {
  logger.trace("oil.code extension started.");

  // Register our custom file system providers
  context.subscriptions.push(
    vscode.workspace.registerFileSystemProvider(OIL_SCHEME, oilFileProvider, {
      isReadonly: false,
    }),
    vscode.workspace.registerFileSystemProvider(
      OIL_PREVIEW_SCHEME,
      oilPreviewProvider,
      { isReadonly: false }
    )
  );

  // Activate decorations to hide prefixes
  activateDecorations(context);

  // Reset preview state
  previewState = {
    previewedFile: null,
    previewedEditor: null,
    cursorListenerDisposable: null,
    isDirectory: false,
    previewUri: null,
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
