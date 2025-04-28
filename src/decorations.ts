import * as vscode from "vscode";

// Create decoration type for hidden prefix
const hiddenPrefixDecoration = vscode.window.createTextEditorDecorationType({
  textDecoration: "none; display: none",
  opacity: "0",
  //   width: "0",
  //   height: "0",
  letterSpacing: "-100em",
  fontWeight: "normal",
  fontStyle: "normal",
  rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
});

// Apply decorations to hide prefixes
export function updateDecorations(editor: vscode.TextEditor | undefined) {
  if (!editor || editor.document.languageId !== "oil") {
    return;
  }

  const document = editor.document;
  const ranges: vscode.Range[] = [];

  // Find all matches of "/ddd " pattern at the start of lines
  for (let i = 0; i < document.lineCount; i++) {
    const line = document.lineAt(i);
    const text = line.text;

    // Match /ddd pattern at start of line
    const match = text.match(/^(\/\d{3} )/);
    if (match) {
      const prefixLength = match[1].length;
      const startPos = new vscode.Position(i, 0);
      const endPos = new vscode.Position(i, prefixLength);
      ranges.push(new vscode.Range(startPos, endPos));
    }
  }

  // Apply the decoration
  editor.setDecorations(hiddenPrefixDecoration, ranges);
}

// Disposable for cleanup
let decorationUpdateListener: vscode.Disposable | null = null;

// Start tracking decorations for the current editor
export function activateDecorations(context: vscode.ExtensionContext) {
  // Update decorations for active editor
  if (vscode.window.activeTextEditor) {
    updateDecorations(vscode.window.activeTextEditor);
  }

  // Update when editor changes or content changes
  decorationUpdateListener = vscode.window.onDidChangeActiveTextEditor(
    (editor) => {
      updateDecorations(editor);
    }
  );

  // Update when text changes in any document
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (
        vscode.window.activeTextEditor &&
        event.document === vscode.window.activeTextEditor.document
      ) {
        updateDecorations(vscode.window.activeTextEditor);
      }
    })
  );

  // Make sure we can clean up
  context.subscriptions.push(decorationUpdateListener, {
    dispose: () => {
      hiddenPrefixDecoration.dispose();
      if (decorationUpdateListener) {
        decorationUpdateListener.dispose();
        decorationUpdateListener = null;
      }
    },
  });
}
