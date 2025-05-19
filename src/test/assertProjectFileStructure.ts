import * as assert from "assert";
import * as vscode from "vscode";

async function getProjectFileStructure(
  workspaceFolder: vscode.Uri,
  indent: number = 0
): Promise<string[]> {
  const files = await vscode.workspace.fs.readDirectory(workspaceFolder);
  const indentString = "  ".repeat(indent);
  const fileNames: string[] = [];
  for await (const [name, type] of files) {
    if (type === vscode.FileType.File) {
      fileNames.push(indentString + name);
    } else if (type === vscode.FileType.Directory) {
      fileNames.push(`${indentString}${name}/`);
      const subFiles = await getProjectFileStructure(
        vscode.Uri.joinPath(workspaceFolder, name),
        indent + 1
      );
      fileNames.push(...subFiles);
    }
  }
  return fileNames;
}

export async function assertProjectFileStructure(expectedStructure: string[]) {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  assert.ok(workspaceFolder, "No workspace folder found.");
  const fileNames = await getProjectFileStructure(workspaceFolder.uri);
  assert.deepStrictEqual(fileNames, expectedStructure);
}
