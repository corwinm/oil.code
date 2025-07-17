import * as vscode from "vscode";
import { OIL_SCHEME, OIL_PREVIEW_SCHEME } from "../constants";
import { getOilState } from "../state/oilState";
import { previewState } from "../state/previewState";
import { closePreview, preview } from "../commands/preview";
import { checkAndEnableAutoSave } from "../utils/settings";

export async function onDidChangeActiveTextEditor(
  editor: vscode.TextEditor | undefined
) {
  if (!editor) {
    return;
  }
  const oilState = getOilState();

  // Close preview when leaving oil view
  if (
    ![OIL_SCHEME, OIL_PREVIEW_SCHEME].includes(editor.document.uri.scheme) &&
    previewState.previewedFile
  ) {
    await closePreview();
  }

  // If we are returning to an oil file and preview is enabled, update the preview
  if (
    editor.document.uri.scheme === OIL_SCHEME &&
    previewState.previewEnabled
  ) {
    await preview(true);
  }

  if (!oilState) {
    await checkAndEnableAutoSave();
    return;
  }
}
