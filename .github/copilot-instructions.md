# Oil.code Development Guide

## Architecture Overview

Oil.code is a VSCode extension that provides oil.nvim-like file system editing capabilities. The core architecture revolves around:

- **Custom FileSystemProviders** (`src/providers/`) - Virtual file systems using `oil://` and `oil-preview://` schemes
- **State Management** (`src/state/`) - Centralized state for navigation history, edits, and preview
- **Command System** (`src/commands/`) - User actions like select, preview, navigation
- **Vim Integration** (`src/vim/`) - Dynamic keymap registration for VSCodeVim and vscode-neovim

## Key Patterns

### URI Schemes and Path Translation

The extension uses custom URI schemes that must be translated to/from disk paths:

```typescript
// oil://current-path → disk path
const diskPath = oilUriToDiskPath(uri);
// disk path → oil://path
const oilUri = updateOilUri(oilState, targetPath);
```

### State-Driven File Operations

File operations are handled through state changes rather than direct filesystem calls:

```typescript
// Pattern: Update state → Save document → onDidSaveTextDocument handler processes changes
oilState.editedPaths.set(currentPath, modifiedLines);
await document.save(); // Triggers actual filesystem operations
```

### Line Format Convention

Files/directories are displayed with hidden identifiers: `/000 ../`, `/001 filename.txt`, `/002 folder/`

- Extract actual names: `lineText.replace(/^\/\d{3} /, "")`
- Directory detection: `fileName.endsWith("/")`

### Dynamic Extension Detection

Vim keymap registration uses retry logic since extensions load asynchronously:

```typescript
attemptRegisteringVimKeymaps(
  MAX_EXTENSION_DETECTION_RETRIES,
  EXTENSION_DETECTION_DELAY
);
```

## Testing Patterns

Tests in `src/test/extension.test.ts` follow this structure:

- **Setup**: `cleanupTestDir()`, stub `showWarningMessage` for modal dialogs
- **Actions**: Use `vscode.commands.executeCommand()` + `editor.edit()`
- **Assertions**: `waitForDocumentText()`, `assertProjectFileStructure()`, `assertSelectionOnLine()`
- **Timing**: Liberal use of `sleep()` for async operations

### Critical Test Utilities

- `waitForDocumentText(expectedLines)` - Wait for oil view to update
- `assertProjectFileStructure(structure)` - Verify actual filesystem changes
- `moveCursorToLine(editor, lineNumber)` - Position cursor for selections

## Build & Development

```bash
# Watch builds (run both for full development)
npm run watch:tsc     # TypeScript compilation
npm run watch:esbuild # Bundle for extension

# Testing
npm test              # Run extension tests
```

### ESBuild Integration

The extension uses a custom esbuild plugin to inline `.lua` files as text (see `esbuild.js`). Lua files in `src/vim/` are embedded for neovim integration.

## Navigation & Editor Management

### Document Transitions

When navigating directories, the extension opens new documents and closes old ones rather than in-place URI changes (VSCode limitation). The `closeOldDocument()` function handles tab cleanup with timing delays.

### Preview System

- Two-column layout: main oil view (left) + preview (right)
- Preview uses separate `oil-preview://` scheme with readonly provider
- Cursor movement triggers preview updates when enabled

## Common Gotchas

1. **Async timing**: Many operations need `sleep()` delays for VSCode state consistency
2. **Modal dialogs**: Stub `vscode.window.showWarningMessage` in tests to avoid blocking
3. **Extension loading**: Vim extensions may not be available immediately at activation
4. **State persistence**: `editedPaths` tracks unsaved changes across navigation
5. **Path normalization**: Always use `removeTrailingSlash()` for consistent path handling

## File Organization

- `src/commands/` - User-facing command implementations
- `src/handlers/` - Event handlers (save, editor change)
- `src/providers/` - FileSystemProvider implementations
- `src/state/` - Global state management
- `src/utils/` - Path utilities, file operations, oil-specific helpers
- `src/vim/` - Vim extension integration and keymaps
