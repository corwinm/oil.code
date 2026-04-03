import * as fs from "fs";
import * as path from "path";
import { FileMetadata, MetadataColumn, OilState } from "../constants";
import { normalizePathToUri, removeTrailingSlash } from "./pathUtils";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// Returns at most 5 chars (e.g. "999B", " 1.0K", "99.9M") so padStart(5) always gives
// a fixed-width right-aligned string.
export function formatSize(bytes: number): string {
  if (bytes < 1000) {
    return `${bytes}B`; // max "999B" = 4 chars
  }
  if (bytes < 1000 * 1024) {
    const k = bytes / 1024;
    return k >= 10 ? `${Math.round(k)}K` : `${k.toFixed(1)}K`; // max "999K" = 4 chars
  }
  if (bytes < 1000 * 1024 * 1024) {
    const m = bytes / (1024 * 1024);
    return m >= 10 ? `${Math.round(m)}M` : `${m.toFixed(1)}M`; // max "999M" = 4 chars
  }
  const g = bytes / (1024 * 1024 * 1024);
  return g >= 10 ? `${Math.round(g)}G` : `${g.toFixed(1)}G`; // max "999G" = 4 chars
}

export function formatMtime(mtime: Date): string {
  const month = MONTHS[mtime.getMonth()];
  const day = String(mtime.getDate()).padStart(2, "0");
  const now = new Date();
  if (mtime.getFullYear() === now.getFullYear()) {
    const hours = String(mtime.getHours()).padStart(2, "0");
    const minutes = String(mtime.getMinutes()).padStart(2, "0");
    return `${month}\u00A0${day}\u00A0${hours}:${minutes}`;
  }
  return `${month}\u00A0${day}\u00A0\u00A0${mtime.getFullYear()}`;
}

export function formatPermissions(stat: fs.Stats): string {
  const typeChar = stat.isDirectory() ? "d" : stat.isSymbolicLink() ? "l" : "-";

  if (process.platform === "win32") {
    const readonly = !(stat.mode & 0o200);
    return readonly ? `${typeChar}r--r--r--` : `${typeChar}rw-rw-rw-`;
  }

  const mode = stat.mode & 0o777;
  const rwx = ["---", "--x", "-w-", "-wx", "r--", "r-x", "rw-", "rwx"];
  return `${typeChar}${rwx[(mode >> 6) & 7]}${rwx[(mode >> 3) & 7]}${rwx[mode & 7]}`;
}

export function getFileMetadata(filePath: string, stat: fs.Stats): FileMetadata {
  return {
    permissions: formatPermissions(stat),
    size: formatSize(stat.size),
    mtime: formatMtime(stat.mtime),
  };
}

// Column widths (monospace chars), all padding uses non-breaking spaces (\u00A0):
//   permissions : exactly 10  (e.g. "-rw-r--r--")
//   size        : right-aligned in 4, padded left with NBSP (e.g. "\u00A012K", "999B")
//   mtime       : exactly 12  (e.g. "Mar\u00A014\u00A014:23", "Mar\u00A014\u00A0\u00A02024")
// Separator between columns: 2 NBSP.  Leading 2 NBSP (gap from icon), trailing 2 NBSP before filename.
// All rows in the same directory with the same column set are identical width.
export function formatMetadataColumns(
  meta: FileMetadata,
  columns: MetadataColumn[]
): string {
  const parts: string[] = [];
  for (const col of columns) {
    switch (col) {
      case "permissions":
        parts.push(meta.permissions); // always 10 chars
        break;
      case "size":
        parts.push(meta.size.padStart(4, "\u00A0")); // right-aligned, always 4 chars, NBSP padding
        break;
      case "mtime":
        parts.push(meta.mtime); // always 12 chars
        break;
      // "icon" is not a metadata column — silently ignored
    }
  }
  // Leading 2 NBSP (gap from icon), 2 NBSP between columns, 2 NBSP before filename
  return parts.length > 0 ? "\u00A0\u00A0" + parts.join("\u00A0\u00A0") + "\u00A0\u00A0" : "";
}

export function populateMetadataCache(
  folderPath: string,
  listings: string[],
  oilState: OilState
): void {
  const folderPathUri = removeTrailingSlash(normalizePathToUri(folderPath));
  const fileMap = new Map<string, FileMetadata>();

  for (const name of listings) {
    if (name === "../") {
      fileMap.set(name, {
        permissions: "-".padStart(10, "\u00A0"),
        size: "-",
        mtime: "-".padStart(12, "\u00A0"),
      });
      continue;
    }
    try {
      const fullPath = path.join(folderPath, name.replace(/\/$/, ""));
      const stat = fs.statSync(fullPath);
      fileMap.set(name, getFileMetadata(fullPath, stat));
    } catch {
      // Skip entries we can't stat (broken symlinks, permission errors, etc.)
    }
  }

  oilState.metadataCache.set(folderPathUri, fileMap);
}
