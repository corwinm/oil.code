import * as vscode from "vscode";
import * as path from "path";
import { getNerdFontFileIcon } from "./nerd-fonts";
import { peekOilState } from "./state/oilState";
import { getDetailsVisible } from "./state/columnState";
import { getColumnsSettings } from "./utils/settings";
import { formatMetadataColumns } from "./utils/metadataUtils";
import { oilUriToDiskPath, normalizePathToUri, removeTrailingSlash } from "./utils/pathUtils";

// Create decoration type for hidden prefix
const hiddenPrefixDecoration = vscode.window.createTextEditorDecorationType({
  textDecoration: "none; font-size: 0pt",
  rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
});

// Get file icon based on file extension or type
function getFileIcon(fileName: string, isDirectory: boolean): string {
  if (isDirectory) {
    return "📁 "; // Folder icon
  }

  const ext = path.extname(fileName).toLowerCase();

  // Map common extensions to icons
  switch (ext) {
    case ".html":
    case ".htm":
      return "🌐"; // HTML
    case ".js":
    case ".ts":
    case ".sh":
    case ".bash":
    case ".zsh":
    case ".ksh":
    case ".fish":
    case ".bat":
    case ".cmd":
    case ".ps1":
      return "📜"; // Scripts
    case ".jsx":
    case ".tsx":
      return "⚛️"; // React components
    case ".css":
    case ".scss":
    case ".sass":
    case ".less":
      return "#"; // CSS
    case ".md":
      return "⬇︎"; // Markdown
    case ".java":
    case ".class":
    case ".jar":
      return "☕"; // Java
    case ".py":
    case ".pyc":
    case ".pyo":
      return "🐍"; // Python
    case ".rb":
    case ".gem":
      return "💎"; // Ruby
    case ".php":
    case ".phtml":
      return "🐘"; // PHP
    case ".go":
      return "🐹"; // Go
    case ".rs":
      return "🦀"; // Rust
    case ".c":
    case ".cpp":
    case ".cxx":
    case ".h":
    case ".hpp":
    case ".hxx":
      return "C"; // C/C++
    case ".swift":
      return "🦄"; // Swift
    case ".png":
    case ".jpg":
    case ".jpeg":
    case ".gif":
    case ".svg":
    case ".bmp":
      return "🖼️"; // Images
    case ".mp3":
    case ".wav":
    case ".flac":
    case ".ogg":
    case ".m4a":
    case ".aac":
    case ".wma":
      return "🎵"; // Audio
    case ".mp4":
    case ".mov":
    case ".avi":
      return "🎬"; // Video
    case ".zip":
    case ".tar":
    case ".gz":
    case ".rar":
      return "📦"; // Archives
    case ".exe":
    case ".dll":
    case ".app":
    case ".apk":
    case ".iso":
    case ".bin":
      return "⚙️"; // Executables
    case ".gitignore":
    case ".gitattributes":
      return "🔧"; // Git files
    default:
      return "📄"; // Default file icon
  }
}

// Decoration types for different file types (created on demand)
const fileIconDecorations = new Map<string, vscode.TextEditorDecorationType>();

// Single decoration type for all metadata before-text (style only; contentText is per-instance).
// Applied AFTER icon decorations so VSCode stacks it between the icon and the filename text.
let metadataDecorationType: vscode.TextEditorDecorationType | null = null;
function getMetadataDecorationType(): vscode.TextEditorDecorationType {
  if (!metadataDecorationType) {
    metadataDecorationType = vscode.window.createTextEditorDecorationType({
      before: {
        color: new vscode.ThemeColor("editorInlayHint.foreground"),
        fontStyle: "italic",
      },
    });
  }
  return metadataDecorationType;
}

// Apply decorations to hide prefixes
export function updateDecorations(editor: vscode.TextEditor | undefined) {
  if (!editor || editor.document.languageId !== "oil") {
    return;
  }

  const document = editor.document;
  const hiddenRanges: vscode.Range[] = [];

  // Clear previous icon decorations
  fileIconDecorations.forEach((decoration) => {
    editor.setDecorations(decoration, []);
  });

  // Clear previous metadata decorations
  editor.setDecorations(getMetadataDecorationType(), []);

  // Track icon decorations for this update
  const iconDecorations = new Map<string, vscode.Range[]>();

  // Determine if metadata columns should be rendered
  const oilState = peekOilState();
  const columns = getColumnsSettings();
  const detailsVisible = getDetailsVisible();
  const metaColumns = columns.filter((c) => c !== "icon");
  const showMetadata = oilState !== undefined && detailsVisible && metaColumns.length > 0;

  // Resolve the metadata map for the current directory (once, before the line loop)
  let metadataMap: Map<string, import("./constants").FileMetadata> | undefined;
  if (showMetadata) {
    try {
      const diskPath = oilUriToDiskPath(document.uri);
      const folderPathUri = removeTrailingSlash(normalizePathToUri(diskPath));
      metadataMap = oilState!.metadataCache.get(folderPathUri);
    } catch {
      // Not a valid oil URI — skip metadata rendering
    }
  }

  const metaDecorations: vscode.DecorationOptions[] = [];

  // Add icon after the prefix and space
  // Get appropriate icon based on configuration
  const config = vscode.workspace.getConfiguration("oil-code");
  const hasNerdFont = config.get("hasNerdFont") === true;

  // Find all matches of "/ddd " pattern at the start of lines
  for (let i = 0; i < document.lineCount; i++) {
    const line = document.lineAt(i);
    const text = line.text;

    // Match /ddd pattern at start of line
    const match = text.match(/^(\/\d{3} )(.*)/);
    if (match) {
      const prefixLength = match[1].length;
      const fileName = match[2].trim();
      const isDirectory = fileName.endsWith("/");

      // Hide the prefix
      const startPos = new vscode.Position(i, 0);
      const endPos = new vscode.Position(i, prefixLength);
      hiddenRanges.push(new vscode.Range(startPos, endPos));

      let icon;
      let fontColor = "inherit";
      let iconKey = "";
      if (hasNerdFont) {
        const {
          icon: nerdIcon,
          color,
          extension,
        } = getNerdFontFileIcon(fileName, isDirectory);
        icon = nerdIcon;
        fontColor = color;
        iconKey = extension;
      } else {
        icon = getFileIcon(fileName, isDirectory);
        iconKey = isDirectory ? "directory" : path.extname(fileName) || "file";
      }

      // Create decoration type if it doesn't exist
      if (!fileIconDecorations.has(iconKey)) {
        fileIconDecorations.set(
          iconKey,
          vscode.window.createTextEditorDecorationType({
            before: {
              contentText: icon,
              width: "1.5em",
              color: fontColor,
            },
          })
        );
      }

      // Get or create the ranges array for this icon type
      if (!iconDecorations.has(iconKey)) {
        iconDecorations.set(iconKey, []);
      }

      // Add decoration range at the beginning of visible part
      iconDecorations
        .get(iconKey)!
        .push(
          new vscode.Range(
            new vscode.Position(i, prefixLength),
            new vscode.Position(i, prefixLength)
          )
        );

      // Add metadata before-decoration for this line (renders between icon and filename)
      if (showMetadata && metadataMap) {
        const meta = metadataMap.get(fileName);
        if (meta) {
          const metaText = formatMetadataColumns(meta, metaColumns);
          if (metaText) {
            const filenameStartPos = new vscode.Position(i, prefixLength);
            metaDecorations.push({
              range: new vscode.Range(filenameStartPos, filenameStartPos),
              renderOptions: {
                before: { contentText: metaText },
              },
            });
          }
        }
      }

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

  // Apply the hidden prefix decoration
  editor.setDecorations(hiddenPrefixDecoration, hiddenRanges);

  // Apply file type icon decorations
  for (const [iconKey, ranges] of iconDecorations.entries()) {
    const decoration = fileIconDecorations.get(iconKey);
    if (decoration) {
      editor.setDecorations(decoration, ranges);
    }
  }

  // Apply metadata after-decorations
  editor.setDecorations(getMetadataDecorationType(), metaDecorations);
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

  function decorateDocument(document: vscode.TextDocument) {
    const editors = vscode.window.visibleTextEditors.filter(
      (editor) => editor.document.uri === document.uri
    );

    editors.forEach((editor) => {
      updateDecorations(editor);
      if (!editor) {
        return;
      }
      const firstLine = document.lineAt(0).text;
      const match = firstLine.match(/^(\/\d{3} )/);
      const isEditingLine = document
        .lineAt(editor.selection.start.line)
        .text.startsWith("/");
      if (
        match &&
        isEditingLine &&
        editor.selection.start.character < match[1].length
      ) {
        const newPosition = new vscode.Position(0, match[1].length);
        editor.selection = new vscode.Selection(newPosition, newPosition);
      }
    });
  }

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      const changeIsMoreThanOneCharacter = event.contentChanges.some(
        (change) => change.text.length !== 1
      );
      if (event.document.languageId === "oil" && changeIsMoreThanOneCharacter) {
        decorateDocument(event.document);
      }
    })
  );

  // Handle initial file open to position cursor correctly
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((document) => {
      if (document.languageId === "oil") {
        // Position cursor on first visible character on document open
        setTimeout(() => {
          decorateDocument(document);
        }, 50); // Small delay to ensure document is fully loaded
      }
    })
  );

  // Make sure we clean up all decorations
  context.subscriptions.push(decorationUpdateListener, {
    dispose: () => {
      hiddenPrefixDecoration.dispose();
      fileIconDecorations.forEach((decoration) => decoration.dispose());
      fileIconDecorations.clear();

      if (decorationUpdateListener) {
        decorationUpdateListener.dispose();
        decorationUpdateListener = null;
      }
    },
  });
}
