import * as vscode from "vscode";
import { getOilState } from "../state/oilState";
import { checkAndEnableAutoSave } from "../utils/settings";
import { hasPendingChanges } from "../utils/oilUtils";

export function closeOil() {
  if (vscode.window.activeTextEditor?.document.languageId === "oil") {
    const oilState = getOilState();
    if (oilState) {
      if (!hasPendingChanges(oilState)) {
        checkAndEnableAutoSave();
      }
    }
    vscode.commands.executeCommand("workbench.action.closeActiveEditor");
  }
}
