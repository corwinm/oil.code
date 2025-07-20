import * as vscode from "vscode";

export class OilFileSystemProvider implements vscode.FileSystemProvider {
  private readonly _onDidChangeFile = new vscode.EventEmitter<
    vscode.FileChangeEvent[]
  >();
  readonly onDidChangeFile = this._onDidChangeFile.event;

  private _documents = new Map<string, Uint8Array>();

  // Create or update an in-memory document
  writeFile(uri: vscode.Uri, content: Uint8Array): void {
    this._documents.set(uri.toString(), content);
    this._onDidChangeFile.fire([{ type: vscode.FileChangeType.Changed, uri }]);
  }

  // Read an in-memory document
  readFile(uri: vscode.Uri): Uint8Array {
    const content = this._documents.get(uri.toString());
    if (content) {
      return content;
    }
    throw vscode.FileSystemError.FileNotFound(uri);
  }

  // Delete an in-memory document
  delete(uri: vscode.Uri): void {
    this._documents.delete(uri.toString());
    this._onDidChangeFile.fire([{ type: vscode.FileChangeType.Changed, uri }]);
  }

  // Required methods for FileSystemProvider interface
  watch(_uri: vscode.Uri): vscode.Disposable {
    return new vscode.Disposable(() => {});
  }

  stat(_uri: vscode.Uri): vscode.FileStat {
    return {
      type: vscode.FileType.File,
      ctime: Date.now(),
      mtime: Date.now(),
      size: this._documents.get(_uri.toString())?.length || 0,
    };
  }

  readDirectory(_uri: vscode.Uri): [string, vscode.FileType][] {
    return [];
  }

  createDirectory(_uri: vscode.Uri): void {}

  rename(_oldUri: vscode.Uri, _newUri: vscode.Uri): void {}
}
