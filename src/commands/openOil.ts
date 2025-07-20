import * as path from "path";
import * as vscode from "vscode";
import { oilFileProvider } from "../providers/providers";
import { initOilStateWithPath, initOilState } from "../state/initState";
import { setOilState } from "../state/oilState";
import { checkAndDisableAutoSave } from "../utils/settings";
import { logger } from "../logger";
import { openParent } from "./openParent";
import { positionCursorOnFile } from "../utils/oilUtils";
import { resetPreviewState } from "../state/previewState";

export async function openOil(atPath?: string | undefined) {
  logger.trace("Opening oil file...");
  const activeEditor = vscode.window.activeTextEditor;

  if (activeEditor?.document.languageId === "oil" && !atPath) {
    openParent();
    return;
  }

  const oilState = atPath ? initOilStateWithPath(atPath) : initOilState();
  setOilState(oilState);
  resetPreviewState();

  const activeFile = path.basename(activeEditor?.document.uri.fsPath || "");

  const folderPath = oilState.currentPath;

  if (folderPath) {
    try {
      oilFileProvider.delete(oilState.tempFileUri);
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
