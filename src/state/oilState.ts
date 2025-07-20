import * as vscode from "vscode";
import { OIL_PREVIEW_SCHEME, OIL_SCHEME, OilState } from "../constants";

let oilState: OilState | undefined;

export function getOilState(): OilState | undefined {
  const activeEditor = vscode.window.activeTextEditor;
  if (activeEditor && oilState) {
    const scheme = activeEditor.document.uri.scheme;
    if (scheme === OIL_SCHEME || scheme === OIL_PREVIEW_SCHEME) {
      return oilState;
    }
  }
  return undefined;
}

export function setOilState(state: OilState | undefined) {
  oilState = state;
}

export function getCurrentPath(): string | undefined {
  const activeEditor = vscode.window.activeTextEditor;
  if (activeEditor && oilState) {
    const documentUri = activeEditor.document.uri;
    const scheme = activeEditor.document.uri.scheme;
    // Check if the scheme is either "oil" or "oil-preview"
    if (scheme === OIL_SCHEME || scheme === OIL_PREVIEW_SCHEME) {
      return documentUri.path;
    }
  }
  return undefined;
}
