import * as vscode from "vscode";
import { activateDecorations } from "./decorations";
import {
  OIL_SCHEME,
  OIL_PREVIEW_SCHEME,
  MAX_EXTENSION_DETECTION_RETRIES,
  EXTENSION_DETECTION_DELAY,
} from "./constants";
import { resetPreviewState } from "./state/previewState";
import { oilFileProvider, oilPreviewProvider } from "./providers/providers";
import { getDisableOpenCwdNothingOpenSetting } from "./utils/settings";
import { attemptRegisteringVimKeymaps } from "./vim/vimKeymaps";
import { onDidChangeActiveTextEditor } from "./handlers/onDidChangeActiveTextEditor";
import { onDidSaveTextDocument } from "./handlers/onDidSaveTextDocument";
import { closePreview } from "./commands/preview";

// Commands
import { openOil } from "./commands/openOil";
import { help } from "./commands/help";
import { closeOil } from "./commands/close";
import { select } from "./commands/select";
import { openParent } from "./commands/openParent";
import { openCwd } from "./commands/openCwd";
import { preview } from "./commands/preview";
import { refresh } from "./commands/refresh";
import { cd } from "./commands/cd";
import { logger } from "./logger";

// In your extension's activate function
export function activate(context: vscode.ExtensionContext) {
  logger.trace("oil.code extension started.");

  // Register our custom file system providers
  context.subscriptions.push(
    vscode.workspace.registerFileSystemProvider(OIL_SCHEME, oilFileProvider, {
      isReadonly: false,
    }),
    vscode.workspace.registerFileSystemProvider(
      OIL_PREVIEW_SCHEME,
      oilPreviewProvider,
      {
        isReadonly: new vscode.MarkdownString(
          "This is a oil.code preview and cannot be edited."
        ),
      }
    )
  );

  // Activate decorations to hide prefixes
  activateDecorations(context);

  // Reset preview state
  resetPreviewState();

  // Set up listener for extension changes (activation/deactivation)
  const extensionChangeListener = vscode.extensions.onDidChange(() => {
    logger.info("Extension change detected, checking for Vim extensions");
    attemptRegisteringVimKeymaps(1, 1000); // One retry after extension changes
  });

  // Add the listener to the subscriptions for proper disposal
  context.subscriptions.push(extensionChangeListener);

  context.subscriptions.push(
    logger,
    vscode.window.onDidChangeActiveTextEditor(onDidChangeActiveTextEditor),
    vscode.workspace.onDidSaveTextDocument(onDidSaveTextDocument),
    vscode.commands.registerCommand("oil-code.open", openOil),
    vscode.commands.registerCommand("oil-code.help", help),
    vscode.commands.registerCommand("oil-code.close", closeOil),
    vscode.commands.registerCommand("oil-code.select", select),
    vscode.commands.registerCommand("oil-code.selectVertical", () =>
      select({ viewColumn: vscode.ViewColumn.Beside })
    ),
    vscode.commands.registerCommand("oil-code.selectTab", () =>
      select({ viewColumn: vscode.ViewColumn.Active })
    ),
    vscode.commands.registerCommand("oil-code.openParent", openParent),
    vscode.commands.registerCommand("oil-code.openCwd", openCwd),
    vscode.commands.registerCommand("oil-code.preview", preview),
    vscode.commands.registerCommand("oil-code.refresh", refresh),
    vscode.commands.registerCommand("oil-code.cd", cd)
  );

  // Make initial attempt to register Vim keymaps with retries
  attemptRegisteringVimKeymaps(
    MAX_EXTENSION_DETECTION_RETRIES,
    EXTENSION_DETECTION_DELAY
  ).then(() => {
    logger.info("Vim keymaps registration completed");
    const disableOpenCwdNothingOpen = getDisableOpenCwdNothingOpenSetting();
    if (disableOpenCwdNothingOpen) {
      logger.info(
        "Open CWD when nothing is open setting is disabled. Skipping initial open."
      );
      return;
    }
    const rootUri = vscode.workspace.workspaceFolders?.[0].uri;
    const openFiles = vscode.workspace.textDocuments.some(
      (doc) => doc.uri.scheme === "file"
    );
    const openOilFiles = vscode.workspace.textDocuments.filter(
      (doc) => doc.uri.scheme === OIL_SCHEME
    );
    const hasOilLoaded = openOilFiles.some((doc) => {
      const content = doc.getText();
      return content.length > 0;
    });
    if (rootUri && !openFiles && !hasOilLoaded) {
      // Open the oil file in the editor
      openOil(rootUri.fsPath);
    }
  });
}

// This method is called when your extension is deactivated
export function deactivate() {
  // Make sure to clean up by closing any preview
  closePreview();
}
