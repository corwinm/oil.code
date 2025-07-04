import path from "path";
import * as vscode from "vscode";
import * as fs from "fs";
import { activateDecorations, updateDecorations } from "./decorations";
import { newline } from "./newline";
import oilCodeLua from "./oil.code.lua";

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

let oilState: OilState | undefined;

// Custom URI scheme for main oil files
const OIL_SCHEME = "oil";

// Custom URI scheme for oil preview files
const OIL_PREVIEW_SCHEME = "oil-preview";

function initOilState() {
  const currentOrWorkspacePath = normalizePathToUri(
    vscode.window.activeTextEditor
      ? path.dirname(vscode.window.activeTextEditor.document.uri.fsPath)
      : vscode.workspace.workspaceFolders?.at(0)?.uri.fsPath
  );

  const tempFileUri = vscode.Uri.parse(
    `${OIL_SCHEME}://oil${currentOrWorkspacePath}`
  );

  const existingState = oilState;
  if (existingState) {
    existingState.tempFileUri = tempFileUri;
    existingState.currentPath = currentOrWorkspacePath;
    // If the state already exists, return it
    return existingState;
  }

  const newState = {
    tempFileUri: tempFileUri,
    currentPath: currentOrWorkspacePath,
    identifierCounter: 1,
    visitedPaths: new Map(),
    editedPaths: new Map(),
  };

  oilState = newState;

  return newState;
}

function initOilStateWithPath(path: string) {
  const normalizedPath = normalizePathToUri(path);
  const tempFileUri = vscode.Uri.parse(`${OIL_SCHEME}://oil${normalizedPath}`);

  const newState = {
    tempFileUri: tempFileUri,
    currentPath: normalizedPath,
    identifierCounter: 1,
    visitedPaths: new Map(),
    editedPaths: new Map(),
  };

  oilState = newState;

  return newState;
}

function getOilState(): OilState | undefined {
  const activeEditor = vscode.window.activeTextEditor;
  if (activeEditor && oilState) {
    const documentUri = activeEditor.document.uri;
    if (documentUri.scheme === OIL_SCHEME) {
      return oilState;
    }
  }
  return undefined;
}

function getCurrentPath(): string | undefined {
  const activeEditor = vscode.window.activeTextEditor;
  if (activeEditor && oilState) {
    const documentUri = activeEditor.document.uri;
    if (documentUri.scheme === OIL_SCHEME) {
      return documentUri.path;
    }
  }
  return undefined;
}

function normalizePathToUri(path: string | undefined = ""): string {
  if (path.startsWith("/")) {
    return path;
  }
  // Normalize the path to a URI format
  const normalizedPath = path.replace(/\\/g, "/");
  return `/${normalizedPath}`;
}

function uriPathToDiskPath(path: string): string {
  // If Windows, convert URI path to disk path
  if (process.platform === "win32") {
    return path.replace(/%20/g, " ").replace(/^\//, "").replaceAll("/", "\\");
  }
  // For other platforms, return the path as is
  return path;
}

function removeTrailingSlash(path: string): string {
  return path.endsWith("/") ? path.slice(0, -1) : path;
}

// Helper function to update the URI when changing directories
function updateOilUri(oilState: OilState, newPath: string): vscode.Uri {
  const normalizedPath = removeTrailingSlash(normalizePathToUri(newPath));
  const newUri = vscode.Uri.parse(`${OIL_SCHEME}://oil${normalizedPath}`);

  // Update the state with the new URI
  oilState.tempFileUri = newUri;

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
    if (content) {
      return content;
    }
    return new Uint8Array(); // Return empty array if not found
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

async function openOil(atPath?: string | undefined) {
  logger.trace("Opening oil file...");
  const activeEditor = vscode.window.activeTextEditor;

  if (activeEditor?.document.languageId === "oil" && !atPath) {
    openParent();
    return;
  }

  const oilState = atPath ? initOilStateWithPath(atPath) : initOilState();
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
      const doc = await vscode.workspace.openTextDocument(oilState.tempFileUri);
      await vscode.languages.setTextDocumentLanguage(doc, "oil");

      const editor = await vscode.window.showTextDocument(doc, {
        preview: false,
      });

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

function closeOil() {
  if (vscode.window.activeTextEditor?.document.languageId === "oil") {
    const oilState = getOilState();
    if (oilState) {
      checkForVisitedCleanup(oilState);
    }
    vscode.commands.executeCommand("workbench.action.closeActiveEditor");
  }
}

async function getDirectoryListing(
  folderPath: string,
  oilState: OilState,
  preview: boolean = false
): Promise<string> {
  let pathUri = vscode.Uri.file(folderPath);

  const folderPathUri = removeTrailingSlash(normalizePathToUri(folderPath));
  if (oilState.editedPaths.has(folderPathUri)) {
    return oilState.editedPaths.get(folderPathUri)!.join(newline);
  }

  if (
    oilState.editedPaths.size > 0 &&
    oilState.visitedPaths.has(folderPathUri)
  ) {
    // If we have visited this path before, return the cached listing
    return oilState.visitedPaths.get(folderPathUri)!.join(newline);
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

  let existingFiles = new Map<string, string>();
  // Diff against the cached version and remove any deleted files and add new ones
  if (oilState.visitedPaths.has(folderPathUri)) {
    const previousListings = oilState.visitedPaths.get(folderPathUri)!;
    for (const file of previousListings) {
      const fileName = file.slice(4);
      if (listings.includes(fileName)) {
        existingFiles.set(fileName, file);
      }
    }
  }

  // Generate listings with hidden identifiers using global counter
  let listingsWithIds = listings.map((name) => {
    if (name === "../") {
      return `/000 ${name}`;
    }
    if (existingFiles.has(name)) {
      return existingFiles.get(name)!;
    }

    // Use and increment the global counter for each file/directory
    const identifier = preview
      ? "/000"
      : `/${oilState.identifierCounter.toString().padStart(3, "0")}`;

    if (!preview) {
      oilState.identifierCounter++;
    }

    return `${identifier} ${name}`;
  });

  oilState.visitedPaths.set(folderPathUri, listingsWithIds);

  return listingsWithIds.join(newline);
}

async function select({
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

  disableUpdatePreview = true;

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
          if (editor) {
            // Find the line with the directory name (with trailing slash)
            const docText = editor.document.getText();
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

            disableUpdatePreview = false;
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
            if (previewState.previewEnabled) {
              preview(true);
            }
          }
        }, 100);
      } else {
        setTimeout(() => {
          disableUpdatePreview = false;
          // When going into a directory, position at first line
          editor.selection = new vscode.Selection(0, 0, 0, 0);
          // Manually update preview if enabled
          if (previewState.previewEnabled) {
            preview(true);
          }
        }, 100);
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
      if (document.isDirty && !hasPendingChanges()) {
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

function checkForVisitedCleanup(oilState: OilState) {
  if (
    vscode.window.visibleTextEditors.filter(
      (editor) => editor.document.languageId === "oil"
    ).length === 1 &&
    !oilState.editedPaths.size
  ) {
    oilState.visitedPaths.clear();
    oilState.identifierCounter = 1;
  }
}

async function openParent() {
  logger.trace("Opening parent directory...");
  await select({ overRideLineText: "../" });
}

async function openCwd() {
  logger.trace("Opening current working directory...");
  const cwd = vscode.workspace.workspaceFolders?.at(0)?.uri.fsPath;
  await select({ overRideLineText: "../", overRideTargetPath: cwd });
}

async function onDidChangeActiveTextEditor(
  editor: vscode.TextEditor | undefined
) {
  if (!editor) {
    return;
  }
  const oilState = getOilState();

  // Close preview when leaving oil view
  if (
    ![OIL_SCHEME, OIL_PREVIEW_SCHEME].includes(editor.document.uri.scheme) &&
    previewState.previewedFile
  ) {
    await closePreview();
  }

  // If we are returning to an oil file and preview is enabled, update the preview
  if (
    editor.document.uri.scheme === OIL_SCHEME &&
    previewState.previewEnabled
  ) {
    await preview(true);
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
  const lines = text.split(newline);

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

// Function to refresh the current oil view
async function refresh() {
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
    const directoryContent = await getDirectoryListing(currentPath, oilState);

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
    if (!hasPendingChanges()) {
      // Reset the document's dirty state
      await activeEditor.document.save();
    }
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to refresh directory: ${error}`);
  }
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
  previewUri: vscode.Uri | null; // URI to the virtual preview document (used for both files and directories)
  previewEnabled: boolean; // Whether preview is enabled
}

let previewState: PreviewState = {
  previewedFile: null,
  previewedEditor: null,
  cursorListenerDisposable: null,
  isDirectory: false,
  previewUri: null,
  previewEnabled: false, // Whether preview is enabled
};

// Function to preview a file
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
    previewState.previewedFile = targetPath;
    previewState.previewedEditor = editor;
    previewState.isDirectory = false;
    previewState.previewUri = previewUri;

    if (previousPreviewUri) {
      oilPreviewProvider.delete(previousPreviewUri);
    }

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
    logger.error("Failed to preview directory:", error);
  }
}

let disableUpdatePreview = false;

// Helper function to update preview based on cursor position
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

// Helper function to close the current preview
async function closePreview() {
  // Stop listening for cursor movements
  if (previewState.cursorListenerDisposable) {
    previewState.cursorListenerDisposable.dispose();
    previewState.cursorListenerDisposable = null;
  }

  // Close the preview if it's open
  if (previewState.previewedFile && previewState.previewUri) {
    // For both file and directory previews using OilPreviewFileSystemProvider
    const previewUri = previewState.previewUri;

    // Reset state
    previewState.previewedFile = null;
    previewState.previewedEditor = null;
    previewState.isDirectory = false;
    previewState.previewUri = null;

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
    if (!entry.value) {
      continue; // Skip empty lines
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
      const editedEntries = oilLinesToOilEntries(lines, dirPath);
      // Check for deleted entries
      const fileOriginalEntries = oilLinesToOilEntries(
        oilState.visitedPaths.get(dirPath) || [],
        dirPath
      );
      for (const [key, entry] of fileOriginalEntries) {
        const editedEntry = editedEntries.find(
          (editedEntry) =>
            editedEntry[0] === key && editedEntry[1].value === entry.value
        );
        if (!editedEntry) {
          deletedLines.add(path.join(uriPathToDiskPath(dirPath), entry.value));
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
              path.join(
                uriPathToDiskPath(originalEntry.path),
                originalEntry.value
              ),
              path.join(uriPathToDiskPath(dirPath), entry.value),
            ]);
          }
        } else {
          // New entry added
          addedLines.add(path.join(uriPathToDiskPath(dirPath), entry.value));
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
      logger.debug("Processing changes...");
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
              currentPath + path.sep,
              ""
            )} - ${error}`
          );
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
      // Delete files/directories
      for (const line of deletedLines) {
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
      const updatedContent = await getDirectoryListing(currentPath, oilState);

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

const MAX_EXTENSION_DETECTION_RETRIES = 6;
const EXTENSION_DETECTION_DELAY = 500; // ms

// Helper function to get setting for disabling vim keymaps
function getDisableVimKeymapsSetting(): boolean {
  const config = vscode.workspace.getConfiguration("oil-code");
  return config.get<boolean>("disableVimKeymaps") || false;
}

function getDisableOpenCwdNothingOpenSetting(): boolean {
  const config = vscode.workspace.getConfiguration("oil-code");
  return config.get<boolean>("disableOpenCwdNothingOpen") || false;
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
      await vscode.commands.executeCommand("vscode-neovim.lua", oilCodeLua);

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
      const hasOilOpenBinding = normalModeKeymap.some((binding) =>
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
      const hasOilSelectBinding = normalModeKeymap.some((binding) =>
        binding.commands?.some(
          (cmd: { command: string }) => cmd.command === "oil-code.select"
        )
      );

      if (!hasOilSelectBinding) {
        updatedKeymap.push({
          before: ["<cr>"],
          commands: [{ command: "oil-code.select" }],
        });
        keymapChanged = true;
      }

      // Check for and add the Oil refresh binding if not present
      const hasOilRefreshBinding = normalModeKeymap.some((binding) =>
        binding.commands?.some(
          (cmd: { command: string }) => cmd.command === "oil-code.refresh"
        )
      );

      if (!hasOilRefreshBinding) {
        updatedKeymap.push({
          before: ["<c-l>"],
          commands: [{ command: "oil-code.refresh" }],
        });
        keymapChanged = true;
      }

      // Check for and add the Oil cd binding if not present
      const hasOilCdBinding = normalModeKeymap.some((binding) =>
        binding.commands?.some(
          (cmd: { command: string }) => cmd.command === "oil-code.cd"
        )
      );
      if (!hasOilCdBinding) {
        updatedKeymap.push({
          before: ["`"],
          commands: [{ command: "oil-code.cd" }],
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
    if (neovimRegistered || vscodevimRegistered) {
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

async function preview(overrideEnabled: boolean = false) {
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
    previewState.previewEnabled = overrideEnabled;
    if (!overrideEnabled) {
      await closePreview();
    }
    return;
  }
  previewState.previewEnabled = true;

  // Preview differently based on whether it's a file or directory
  if (isDir) {
    await previewDirectory(targetPath);
  } else {
    await previewFile(targetPath);
  }
}

// Change the VSCode working directory to current oil directory
async function changeDirectory() {
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

let helpPanel: vscode.WebviewPanel | null = null;

// Displays helpful information about oil commands that are available
async function showHelp() {
  helpPanel?.dispose(); // Close any existing help panel
  const helpHeaders = [
    "Command",
    "Vim Key Binding",
    "Default Shortcut",
    "Description",
  ];
  // Create a table of commands and default keymaps
  const helpTable = [
    ["open", "-", "alt+-", "Open oil from the currents file parent directory"],
    ["help", "", "alt+shift+h", "Show this help information"],
    ["close", "", "alt+c", "Close oil explorer"],
    ["select", "Enter", "alt+Enter", "Open selected file/directory"],
    ["selectTab", "ctrl+t", "alt+t", "Open selected file in a new tab"],
    ["selectVertical", "", "alt+s", "Open selected file in a vertical split"],
    ["openParent", "-", "alt+-", "Navigate to parent directory"],
    ["openCwd", "_", "alt_shift+-", "Navigate to workspace root"],
    ["preview", "ctrl+p", "alt+p", "Preview file/directory at cursor"],
    ["refresh", "ctrl+l", "alt+l", "Refresh current directory view"],
    [
      "cd",
      "`",
      "alt+`",
      "Change VSCode working directory to current oil directory",
    ],
  ];

  // Display the message in a Markdown preview panel
  const panel = vscode.window.createWebviewPanel(
    "oilHelp",
    "Oil Help",
    vscode.ViewColumn.Active,
    {
      enableScripts: false,
    }
  );

  panel.webview.html = `
  <!DOCTYPE html>
  <html>
  <head>
    <style>
      body { font-family: var(--vscode-editor-font-family); padding: 20px; }
      h1 { margin-bottom: 20px; margin-top: 0; }
      p { margin-bottom: 10px; max-width: 600px; }
      table { border-collapse: collapse; margin: 20px 0; }
      caption { font-weight: bold; margin-bottom: 10px; }
      th, td { padding: 8px 16px; text-align: left; }
      th { border-bottom: 2px solid var(--vscode-list-hoverBackground); }
      td { border-bottom: 1px solid var(--vscode-list-hoverBackground); }
      .horizontal-links { display: flex; list-style: none; padding: 0; }
      .horizontal-links li { margin-right: 20px; }
    </style>
  </head>
  <body>
    <div class="markdown-preview">
      <h1>Oil Help</h1>
      <p>Oil.code is a file explorer for VSCode that allows you to navigate and manage files and directories directly in your editor window.</p>
      <table>
        <caption>Available Commands with default keybinding/shortcut</caption>
        <tr>
          ${helpHeaders.map((header) => `<th>${header}</th>`).join("")}
        </tr>
        ${helpTable
          .map(
            (row) =>
              `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`
          )
          .join("")}
      </table>
      <h2 id="oil-links">Links</h2>
      <ul class="horizontal-links" aria-labelledby="oil-links">
        <li><a href="https://github.com/corwinm/oil.code">GitHub Repository</a></li>
        <li><a href="https://marketplace.visualstudio.com/items?itemName=haphazarddev.oil-code">VS Code Marketplace</a></li>
        <li><a href="https://github.com/corwinm/oil.code/issues">Issue Tracker</a></li>
        <li><a href="https://github.com/corwinm/oil.code/issues/new?template=bug_report.yml">Report a Bug</a></li>
        <li><a href="https://github.com/corwinm/oil.code/issues/new?template=feature_request.yml">Request a Feature</a></li>
      </ul>
      <p>If you find oil.code useful, please consider starring the repository on <a href="https://github.com/corwinm/oil.code">GitHub</a> and reviewing it on the <a href="https://marketplace.visualstudio.com/items?itemName=haphazarddev.oil-code">VS Code Marketplace</a>.</p>
    </div>
  </body>
  </html>`;

  helpPanel = panel;
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
      {
        isReadonly: new vscode.MarkdownString(
          "This is a oil.code preview and cannot be edited."
        ),
      }
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
    previewEnabled: false,
  };

  // Set up listener for extension changes (activation/deactivation)
  const extensionChangeListener = vscode.extensions.onDidChange(() => {
    logger.info("Extension change detected, checking for Vim extensions");
    attemptRegisteringVimKeymaps(1, 1000); // One retry after extension changes
  });

  // Add the listener to the subscriptions for proper disposal
  context.subscriptions.push(extensionChangeListener);

  context.subscriptions.push(
    logger,
    vscode.window.onDidChangeActiveTextEditor(onDidChangeActiveTextEditor),
    vscode.workspace.onDidSaveTextDocument(onDidSaveTextDocument),
    vscode.commands.registerCommand("oil-code.open", openOil),
    vscode.commands.registerCommand("oil-code.help", showHelp),
    vscode.commands.registerCommand("oil-code.close", closeOil),
    vscode.commands.registerCommand("oil-code.select", select),
    vscode.commands.registerCommand("oil-code.selectVertical", () =>
      select({ viewColumn: vscode.ViewColumn.Beside })
    ),
    vscode.commands.registerCommand("oil-code.selectTab", () =>
      select({ viewColumn: vscode.ViewColumn.Active })
    ),
    vscode.commands.registerCommand("oil-code.openParent", openParent),
    vscode.commands.registerCommand("oil-code.openCwd", openCwd),
    vscode.commands.registerCommand("oil-code.preview", preview),
    vscode.commands.registerCommand("oil-code.refresh", refresh),
    vscode.commands.registerCommand("oil-code.cd", changeDirectory)
  );

  // Make initial attempt to register Vim keymaps with retries
  attemptRegisteringVimKeymaps(
    MAX_EXTENSION_DETECTION_RETRIES,
    EXTENSION_DETECTION_DELAY
  ).then(() => {
    logger.info("Vim keymaps registration completed");
    const disableOpenCwdNothingOpen = getDisableOpenCwdNothingOpenSetting();
    if (disableOpenCwdNothingOpen) {
      logger.info(
        "Open CWD when nothing is open setting is disabled. Skipping initial open."
      );
      return;
    }
    const rootUri = vscode.workspace.workspaceFolders?.[0].uri;
    const openFiles = vscode.workspace.textDocuments.some(
      (doc) => doc.uri.scheme === "file"
    );
    const openOilFiles = vscode.workspace.textDocuments.filter(
      (doc) => doc.uri.scheme === OIL_SCHEME
    );
    const hasOilLoaded = openOilFiles.some((doc) => {
      const content = doc.getText();
      return content.length > 0;
    });
    if (rootUri && !openFiles && !hasOilLoaded) {
      // Open the oil file in the editor
      openOil(rootUri.fsPath);
    }
  });
}

// This method is called when your extension is deactivated
export function deactivate() {
  // Make sure to clean up by closing any preview
  closePreview();
}
