import * as vscode from 'vscode';

export interface OilEntry {
  identifier: string;
  value: string;
  path: string;
  isDir: boolean;
}

export interface OilState {
  tempFileUri: vscode.Uri;
  currentPath: string;
  identifierCounter: number;
  visitedPaths: Map<string, string[]>;
  editedPaths: Map<string, string[]>;
  openAfterSave?: string;
}

export interface PreviewState {
  previewedFile: string | null;
  previewedEditor: vscode.TextEditor | null;
  cursorListenerDisposable: vscode.Disposable | null;
  isDirectory: boolean;
  previewUri: vscode.Uri | null;
  previewEnabled: boolean;
}

// Custom URI scheme for main oil files
export const OIL_SCHEME = "oil";

// Custom URI scheme for oil preview files
export const OIL_PREVIEW_SCHEME = "oil-preview";

export const MAX_EXTENSION_DETECTION_RETRIES = 6;
export const EXTENSION_DETECTION_DELAY = 500; // ms
