import * as path from "path";
import * as vscode from "vscode";
import { updateDecorations } from "../decorations";
import { oilFileProvider } from "../providers/providers";
import { initOilStateWithPath, initOilState } from "../state/initState";
import { setOilState } from "../state/oilState";
import { getDirectoryListing } from "../utils/fileUtils";
import { checkAndDisableAutoSave } from "../utils/settings";
import { logger } from "../logger";
import { openParent } from "./openParent";

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
      await checkAndDisableAutoSave();
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

      updateDecorations(editor);

      // Position cursor on the active file if it exists
      if (activeFile) {
        const document = editor.document;
        const text = document.getText();
        const lines = text.split("\n");
        for (let i = 0; i < lines.length; i++) {
          const lineName = lines[i].replace(/^\/\d{3} /, "").trim();
          if (lineName === activeFile) {
            editor.selection = new vscode.Selection(i, 0, i, 0);
            editor.revealRange(new vscode.Range(i, 0, i, 0));
            break;
          }
        }
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to open oil file: ${error}`);
    }
  } else {
    vscode.window.showErrorMessage("Unable to determine the folder to open.");
  }
}
