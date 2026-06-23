import * as vscode from "vscode";
import { toggleDetailsVisible } from "../state/columnState";
import { updateDecorations } from "../decorations";

export function toggleDetails(): void {
  toggleDetailsVisible();

  // Redraw decorations on all visible oil editors
  for (const editor of vscode.window.visibleTextEditors) {
    if (editor.document.languageId === "oil") {
      updateDecorations(editor);
    }
  }
}
