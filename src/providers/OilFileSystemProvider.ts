import * as vscode from "vscode";
import { getDirectoryListing } from "../utils/fileUtils";
import { getOilState, setOilState } from "../state/oilState";
import { oilUriToDiskPath } from "../utils/pathUtils";
import { initOilState } from "../state/initState";
import { logger } from "../logger";

export class OilFileSystemProvider implements vscode.FileSystemProvider {
  private readonly _onDidChangeFile = new vscode.EventEmitter<
    vscode.FileChangeEvent[]
  >();
  readonly onDidChangeFile = this._onDidChangeFile.event;

  // Create or update an in-memory document
  writeFile(_uri: vscode.Uri, _content: Uint8Array): void {}

  // Read an in-memory document
  async readFile(uri: vscode.Uri): Promise<Uint8Array> {
    logger.trace("Reading file from OilFileSystemProvider:", uri.toString());
    let oilState = getOilState();
    if (!oilState) {
      const newOilState = initOilState();
      setOilState(newOilState);
      oilState = newOilState;
    }
    const folderPath = oilUriToDiskPath(uri);
    const directoryContent = await getDirectoryListing(folderPath, oilState);
    if (!directoryContent) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }
    const buffer = Buffer.from(directoryContent);
    return buffer;
  }

  // Delete an in-memory document
  delete(uri: vscode.Uri): void {
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
      size: 0,
    };
  }

  readDirectory(_uri: vscode.Uri): [string, vscode.FileType][] {
    return [];
  }

  createDirectory(_uri: vscode.Uri): void {}

  rename(_oldUri: vscode.Uri, _newUri: vscode.Uri): void {}
}
