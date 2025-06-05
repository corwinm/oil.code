import * as assert from "assert";
import * as vscode from "vscode";

export function assertSelectionOnLine(
  editor: vscode.TextEditor,
  lineNumber: number
) {
  assert.strictEqual(
    editor.selection.active.line,
    lineNumber,
    "Cursor position is not updated"
  );
}
