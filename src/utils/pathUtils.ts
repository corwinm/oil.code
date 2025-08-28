import * as vscode from "vscode";
import { OIL_PREVIEW_SCHEME, OIL_SCHEME } from "../constants";

export function normalizePathToUri(path: string | undefined = ""): string {
  if (path.startsWith("/")) {
    return path;
  }
  // Normalize the path to a URI format
  const normalizedPath = path.replace(/\\/g, "/");
  return `/${normalizedPath}`;
}

export function isWindows(): boolean {
  return process.platform === "win32";
}

export function uriPathToDiskPath(path: string): string {
  // If Windows, convert URI path to disk path
  if (isWindows()) {
    return path.replace(/^\//, "");
  }
  // For other platforms, return the path as is
  return path;
}

export function removeTrailingSlash(path: string): string {
  return path.endsWith("/") ? path.slice(0, -1) : path;
}

export function updateOilUri(
  oilState: { tempFileUri: vscode.Uri },
  newPath: string
): vscode.Uri {
  const normalizedPath = removeTrailingSlash(normalizePathToUri(newPath));
  const newUri = vscode.Uri.parse(`${OIL_SCHEME}://oil${normalizedPath}`);

  // Update the state with the new URI
  oilState.tempFileUri = newUri;

  return newUri;
}

export function formatPath(path: string): string {
  return vscode.workspace.asRelativePath(path);
}

const MAX_LINE_LENGTH = 80;

export function addNewlinesToLongLines(text: string): string {
  if (!isWindows()) {
    return text;
  }
  const initialLines = text.split("\n");
  const lines: string[] = [];
  for (const line of initialLines) {
    let currentLine = line;

    while (currentLine.length > MAX_LINE_LENGTH) {
      lines.push(currentLine.substring(0, MAX_LINE_LENGTH));
      currentLine = currentLine.substring(MAX_LINE_LENGTH);
    }

    if (currentLine.length > 0) {
      lines.push(currentLine);
    }
  }

  return lines.join("\n");
}

export function oilUriToDiskPath(uri: vscode.Uri): string {
  // Convert an Oil URI to a file system path
  if (!(uri.scheme === OIL_SCHEME || uri.scheme === OIL_PREVIEW_SCHEME)) {
    throw new Error("Invalid Oil URI");
  }
  return `${uri.path
    .replace(`${OIL_SCHEME}://oil`, "")
    .replace(`${OIL_PREVIEW_SCHEME}://oil-preview`, "")}/`;
}
