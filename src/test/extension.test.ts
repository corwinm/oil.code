import * as assert from "assert";

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from "vscode";
import * as sinon from "sinon";
import { waitFor } from "./waitFor";

suite("Extension Test Suite", () => {
  // Setup and teardown for Sinon stubs
  let showWarningMessageStub: sinon.SinonStub;

  setup(() => {
    // Stub vscode.window.showWarningMessage to automatically return a response
    // This avoids blocking dialogs during tests
    showWarningMessageStub = sinon.stub(vscode.window, "showWarningMessage");
    // Default to "Yes" response for dialogs
    showWarningMessageStub.resolves("Yes");
  });

  teardown(async () => {
    await vscode.commands.executeCommand("oil-code.close");
    // Restore the original methods after each test
    showWarningMessageStub.restore();
    // Clean up any test files created during tests
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder) {
      const testTempDir = vscode.Uri.joinPath(workspaceFolder.uri);
      try {
        const files = await vscode.workspace.fs.readDirectory(testTempDir);
        for (const [name, type] of files) {
          if (type === vscode.FileType.File) {
            await vscode.workspace.fs.delete(
              vscode.Uri.joinPath(testTempDir, name)
            );
          }
          if (type === vscode.FileType.Directory) {
            await vscode.workspace.fs.delete(
              vscode.Uri.joinPath(testTempDir, name),
              { recursive: true }
            );
          }
        }
      } catch (error) {
        // Directory might not exist yet, which is fine
        console.log(
          "Test-temp cleanup error (can be ignored if directory does not exist):",
          error
        );
      }
    }
  });

  test.only("Oil opens", async () => {
    await vscode.commands.executeCommand("oil-code.open");
    await waitFor(
      () => vscode.window.activeTextEditor?.document.getText() === "/000 ../"
    );
    const editor = vscode.window.activeTextEditor;
    assert.ok(editor, "No active editor");
    assert.strictEqual(
      editor.document.languageId,
      "oil",
      "Language ID is not oil"
    );
  });

  test("Creates file", async () => {
    await vscode.commands.executeCommand("oil-code.open");
    await waitFor(
      () => vscode.window.activeTextEditor?.document.getText() === "/000 ../"
    );
    const editor = vscode.window.activeTextEditor;
    assert.ok(editor, "No active editor");

    await editor.edit((editBuilder) => {
      editBuilder.insert(new vscode.Position(1, 0), "\noil-file.ts");
    });

    assert.strictEqual(
      editor.document.getText(),
      "/000 ../\noil-file.ts",
      "Text file was not typed into editor"
    );

    await vscode.commands.executeCommand("workbench.action.files.saveAll");

    // Give the file save operation time to complete
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Wait for file content to update
    await waitFor(
      () => editor.document.getText() === "/000 ../\n/001 oil-file.ts"
    );

    assert.strictEqual(
      editor.document.getText(),
      "/000 ../\n/001 oil-file.ts",
      "File was not saved with correct content"
    );
  });

  test("Creates directory", async () => {
    await vscode.commands.executeCommand("oil-code.open");
    await waitFor(
      () => vscode.window.activeTextEditor?.document.getText() === "/000 ../"
    );
    const editor = vscode.window.activeTextEditor;
    assert.ok(editor, "No active editor");

    await editor.edit((editBuilder) => {
      editBuilder.insert(new vscode.Position(1, 0), "\noil-dir/");
    });

    assert.strictEqual(
      editor.document.getText(),
      "/000 ../\noil-dir/",
      "Text was not typed into editor"
    );

    await vscode.commands.executeCommand("workbench.action.files.saveAll");

    // Give the file save operation time to complete
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Wait for file content to update
    await waitFor(
      () => editor.document.getText() === "/000 ../\n/001 oil-dir/"
    );

    assert.strictEqual(
      editor.document.getText(),
      "/000 ../\n/001 oil-dir/",
      "File was not saved with correct content"
    );
  });

  test("Creates directory and file in one line", async () => {
    await vscode.commands.executeCommand("oil-code.open");
    await waitFor(
      () => vscode.window.activeTextEditor?.document.getText() === "/000 ../"
    );
    const editor = vscode.window.activeTextEditor;
    assert.ok(editor, "No active editor");

    await editor.edit((editBuilder) => {
      editBuilder.insert(new vscode.Position(1, 0), "\noil-dir/oil-file.ts");
    });

    assert.strictEqual(
      editor.document.getText(),
      "/000 ../\noil-dir/oil-file.ts",
      "Text was not typed into editor"
    );

    await vscode.commands.executeCommand("workbench.action.files.saveAll");

    // Give the file save operation time to complete
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Wait for file content to update
    await waitFor(
      () => editor.document.getText() === "/000 ../\n/001 oil-dir/"
    );

    assert.strictEqual(
      editor.document.getText(),
      "/000 ../\n/001 oil-dir/",
      "File was not saved with correct content"
    );

    // Check if the file was created
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder) {
      const testTempDir = vscode.Uri.joinPath(workspaceFolder.uri, "oil-dir");
      const files = await vscode.workspace.fs.readDirectory(testTempDir);
      const fileExists = files.some(
        ([name, type]) =>
          type === vscode.FileType.File && name === "oil-file.ts"
      );
      assert.ok(fileExists, "File was not created in the directory");
    }
  });
});
