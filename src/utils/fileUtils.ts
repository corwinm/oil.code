import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { GO_UP_IDENTIFIER, OilState } from "../constants";
import { removeTrailingSlash, normalizePathToUri } from "./pathUtils";
import { newline } from "../newline";

export async function getDirectoryListing(
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
      return `${GO_UP_IDENTIFIER} ${name}`;
    }
    if (existingFiles.has(name)) {
      return existingFiles.get(name)!;
    }

    // Use and increment the global counter for each file/directory
    const identifier = preview
      ? GO_UP_IDENTIFIER
      : `/${oilState.identifierCounter.toString().padStart(3, "0")}`;

    if (!preview) {
      oilState.identifierCounter++;
    }

    return `${identifier} ${name}`;
  });

  oilState.visitedPaths.set(folderPathUri, listingsWithIds);

  return listingsWithIds.join(newline);
}

export async function removeDirectoryRecursively(
  dirPath: string
): Promise<void> {
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
