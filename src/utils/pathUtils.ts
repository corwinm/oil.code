import * as vscode from "vscode";

export function normalizePathToUri(path: string | undefined = ""): string {
  if (path.startsWith("/")) {
    return path;
  }
  // Normalize the path to a URI format
  const normalizedPath = path.replace(/\\/g, "/");
  return `/${normalizedPath}`;
}

export function uriPathToDiskPath(path: string): string {
  // If Windows, convert URI path to disk path
  if (process.platform === "win32") {
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
  const newUri = vscode.Uri.parse(`oil://oil${normalizedPath}`);

  // Update the state with the new URI
  oilState.tempFileUri = newUri;

  return newUri;
}

export function formatPath(path: string): string {
  return vscode.workspace.asRelativePath(path);
}

export function oilUriToDiskPath(uri: vscode.Uri): string {
  // Convert an Oil URI to a file system path
  if (!(uri.scheme === "oil" || uri.scheme === "oil-preview")) {
    throw new Error("Invalid Oil URI");
  }
  return `${uri.path
    .replace("oil://oil", "")
    .replace("oil-preview://oil-preview", "")}/`;
}
