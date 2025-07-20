import * as vscode from "vscode";
import * as path from "path";
import { OilState, OIL_SCHEME } from "../constants";
import { normalizePathToUri } from "../utils/pathUtils";

export function initOilState(): OilState {
  const activeEditor = vscode.window.activeTextEditor;
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

  let currentOrWorkspacePath = workspaceFolder?.uri.fsPath || "";

  if (activeEditor && activeEditor.document.uri.scheme === "file") {
    const filePath = activeEditor.document.uri.fsPath;
    const dirPath = path.dirname(filePath);
    currentOrWorkspacePath = dirPath;
  }

  const normalizedPath = normalizePathToUri(currentOrWorkspacePath);
  const tempFileUri = vscode.Uri.parse(`${OIL_SCHEME}://oil${normalizedPath}`);

  const newState: OilState = {
    tempFileUri: tempFileUri,
    currentPath: currentOrWorkspacePath, // Use the actual disk path, not normalized
    identifierCounter: 1,
    visitedPaths: new Map(),
    editedPaths: new Map(),
  };

  return newState;
}

export function initOilStateWithPath(path: string): OilState {
  const normalizedPath = normalizePathToUri(path);
  const tempFileUri = vscode.Uri.parse(`${OIL_SCHEME}://oil${normalizedPath}`);

  const newState: OilState = {
    tempFileUri: tempFileUri,
    currentPath: path, // Use the actual disk path, not normalized
    identifierCounter: 1,
    visitedPaths: new Map(),
    editedPaths: new Map(),
  };

  return newState;
}
