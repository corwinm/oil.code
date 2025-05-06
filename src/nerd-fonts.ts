import { iconsByFilename } from "./iconsByFilename";
import { iconsByFileExtension } from "./iconsByFileExtension";

/**
 * Mapping of file extensions to Nerd Font icons and their colors
 */
interface FileIconMapping {
  icon: string;
  color: string;
  extension: string;
}

// Default icon for unknown file types
const DEFAULT_FILE_ICON: FileIconMapping = {
  icon: "󰈔",
  color: "#89a2b0",
  extension: "file",
};
const DEFAULT_DIRECTORY_ICON: FileIconMapping = {
  icon: "󰉋",
  color: "#90a4ae",
  extension: "directory",
};

/**
 * Get a Nerd Font icon and color for a given file name
 *
 * @param fileName - The name of the file
 * @param isDirectory - Whether the file is a directory
 * @param isOpen - Whether the directory is open (only relevant if isDirectory is true)
 * @returns An object containing the icon and color for the file
 */
export function getNerdFontFileIcon(
  fileName: string,
  isDirectory = false
): FileIconMapping {
  // Handle directories
  if (isDirectory) {
    const icon = iconsByFilename[fileName.toLowerCase()];
    if (icon) {
      return { ...icon, extension: "directory" };
    }
    return DEFAULT_DIRECTORY_ICON;
  }

  // Check for file name matches
  const icon = iconsByFilename[fileName.toLowerCase()];
  if (icon) {
    return { ...icon, extension: fileName };
  }

  let fileExtension = fileName
    .substring(fileName.indexOf(".") + 1)
    .toLowerCase();
  while (fileExtension) {
    const icon = iconsByFileExtension[fileExtension];
    if (icon) {
      return { ...icon, extension: fileExtension };
    }
    const nextDotIndex = fileExtension.indexOf(".");
    if (nextDotIndex === -1) {
      break;
    }
    fileExtension = fileExtension.substring(nextDotIndex + 1);
  }

  return DEFAULT_FILE_ICON;
}
