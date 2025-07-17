import * as vscode from "vscode";
import * as path from "path";
import { OilEntry, OilState } from "../constants";
import { newline } from "../newline";

export function oilLineToOilEntry(line: string, path: string): OilEntry {
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

export function oilLinesToOilEntries(
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

export function oilLinesToOilMap(
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

export function positionCursorOnFile(
  editor: vscode.TextEditor,
  fileName: string
) {
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

export function hasPendingChanges(oilState: OilState | undefined): boolean {
  if (!oilState) {
    return false;
  }
  return oilState.editedPaths.size > 0;
}

export function checkForVisitedCleanup(oilState: OilState) {
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

export function determineChanges(oilState: OilState) {
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

function uriPathToDiskPath(path: string): string {
  // If Windows, convert URI path to disk path
  if (process.platform === "win32") {
    return path.replace(/^\//, "");
  }
  // For other platforms, return the path as is
  return path;
}
