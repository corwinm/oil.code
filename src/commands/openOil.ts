import * as path from "path";
import * as vscode from "vscode";
import { oilFileProvider } from "../providers/providers";
import { initOilStateWithPath, initOilState } from "../state/initState";
import { setOilState } from "../state/oilState";
import { getDirectoryListing } from "../utils/fileUtils";
import { checkAndDisableAutoSave } from "../utils/settings";
import { logger } from "../logger";
import { openParent } from "./openParent";
import { positionCursorOnFile } from "../utils/oilUtils";

export async function openOil(atPath?: string | undefined) {
  logger.trace("Opening oil file...");
  const activeEditor = vscode.window.activeTextEditor;

  if (activeEditor?.document.languageId === "oil" && !atPath) {
    openParent();
    return;
  }

  const oilState = atPath ? initOilStateWithPath(atPath) : initOilState();
  setOilState(oilState);

  const activeFile = path.basename(activeEditor?.document.uri.fsPath || "");

  const folderPath = oilState.currentPath;

  if (folderPath) {
    try {
      const directoryContent = await getDirectoryListing(folderPath, oilState);

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

      // Position cursor on the active file if it exists
      positionCursorOnFile(editor, activeFile);
      await checkAndDisableAutoSave();
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to open oil file: ${error}`);
    }
  } else {
    vscode.window.showErrorMessage("Unable to determine the folder to open.");
  }
}
