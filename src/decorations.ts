import * as vscode from "vscode";

// Create decoration type for hidden prefix
const hiddenPrefixDecoration = vscode.window.createTextEditorDecorationType({
  textDecoration: "none; display: none",
  opacity: "0",
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

      // If cursor is within the prefix area, move it to the first visible character
      for (let selection of editor.selections) {
        if (
          selection.active.line === i &&
          selection.active.character < prefixLength
        ) {
          const newPosition = new vscode.Position(i, prefixLength);
          const newSelection = new vscode.Selection(newPosition, newPosition);

          // Use a timeout to ensure this happens after all current operations
          setTimeout(() => {
            if (editor) {
              editor.selection = newSelection;
            }
          }, 0);
        }
      }
    }
  }

  // Apply the decoration
  editor.setDecorations(hiddenPrefixDecoration, ranges);
}

// Disposable for cleanup
let decorationUpdateListener: vscode.Disposable | null = null;
let handlingCursorMovement = false;

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

  // Add listener for cursor position changes to prevent entering hidden prefix area
  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection((event) => {
      const editor = event.textEditor;

      // Only handle if it's an oil file and we're not already handling movement
      if (editor.document.languageId !== "oil" || handlingCursorMovement) {
        return;
      }

      handlingCursorMovement = true;

      const document = editor.document;
      const newSelections: vscode.Selection[] = [];
      let selectionChanged = false;

      // Check each selection to see if it's in a hidden area
      for (const selection of editor.selections) {
        const line = selection.active.line;
        const character = selection.active.character;
        const lineText = document.lineAt(line).text;

        // Check if this line has a hidden prefix
        const match = lineText.match(/^(\/\d{3} )/);
        if (match && character < match[1].length) {
          // Cursor is in hidden area, move it to the first visible character
          const newPosition = new vscode.Position(line, match[1].length);
          newSelections.push(new vscode.Selection(newPosition, newPosition));
          selectionChanged = true;
        } else {
          // Keep the selection as is
          newSelections.push(selection);
        }
      }

      // If any selections were adjusted, update them
      if (selectionChanged) {
        editor.selections = newSelections;
      }

      handlingCursorMovement = false;
    })
  );

  // Handle initial file open to position cursor correctly
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((document) => {
      if (document.languageId === "oil") {
        // Position cursor on first visible character on document open
        setTimeout(() => {
          const editor = vscode.window.activeTextEditor;
          if (editor && editor.document === document) {
            const firstLine = document.lineAt(0).text;
            const match = firstLine.match(/^(\/\d{3} )/);
            if (match) {
              const newPosition = new vscode.Position(0, match[1].length);
              editor.selection = new vscode.Selection(newPosition, newPosition);
            }
          }
        }, 50); // Small delay to ensure document is fully loaded
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
