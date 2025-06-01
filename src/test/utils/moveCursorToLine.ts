import * as vscode from "vscode";

export function moveCursorToLine(editor: vscode.TextEditor, lineNumber = 1) {
  editor.selection = new vscode.Selection(
    new vscode.Position(lineNumber, 0),
    new vscode.Position(lineNumber, 0)
  );
}
