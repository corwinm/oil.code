import * as assert from "assert";
import * as vscode from "vscode";
import * as sinon from "sinon";
import { waitFor } from "./waitFor";
import * as path from "path";

const newline = path.sep === "\\" ? "\r\n" : "\n";

suite("oil.code", () => {
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

    // Close all editors
    const editors = vscode.window.visibleTextEditors;
    for (const _ of editors) {
      await vscode.commands.executeCommand(
        "workbench.action.closeActiveEditor"
      );
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

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

  test("Oil opens", async () => {
    await vscode.commands.executeCommand("oil-code.open");
    await waitFor(() =>
      assert.strictEqual(
        vscode.window.activeTextEditor?.document.getText(),
        "/000 ../"
      )
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
    await waitFor(() =>
      assert.strictEqual(
        vscode.window.activeTextEditor?.document.getText(),
        "/000 ../"
      )
    );
    const editor = vscode.window.activeTextEditor;
    assert.ok(editor, "No active editor");

    await editor.edit((editBuilder) => {
      editBuilder.insert(new vscode.Position(1, 0), `${newline}oil-file.ts`);
    });

    assert.strictEqual(
      editor.document.getText(),
      `/000 ../${newline}oil-file.ts`,
      "Text file was not typed into editor"
    );

    await vscode.commands.executeCommand("workbench.action.files.save");

    // Give the file save operation time to complete
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Wait for file content to update
    await waitFor(() =>
      assert.strictEqual(
        editor.document.getText(),
        `/000 ../${newline}/001 oil-file.ts`
      )
    );
  });

  test("Creates directory", async () => {
    await vscode.commands.executeCommand("oil-code.open");
    await waitFor(() =>
      assert.strictEqual(
        vscode.window.activeTextEditor?.document.getText(),
        "/000 ../"
      )
    );
    const editor = vscode.window.activeTextEditor;
    assert.ok(editor, "No active editor");

    await editor.edit((editBuilder) => {
      editBuilder.insert(new vscode.Position(1, 0), `${newline}oil-dir/`);
    });

    assert.strictEqual(
      editor.document.getText(),
      `/000 ../${newline}oil-dir/`,
      "Text was not typed into editor"
    );

    await vscode.commands.executeCommand("workbench.action.files.save");

    // Give the file save operation time to complete
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Wait for file content to update
    await waitFor(() =>
      assert.strictEqual(
        editor.document.getText(),
        `/000 ../${newline}/001 oil-dir/`
      )
    );
  });

  test("Creates directory and file in one line", async () => {
    await vscode.commands.executeCommand("oil-code.open");
    await waitFor(() =>
      assert.strictEqual(
        vscode.window.activeTextEditor?.document.getText(),
        "/000 ../"
      )
    );
    const editor = vscode.window.activeTextEditor;
    assert.ok(editor, "No active editor");

    await editor.edit((editBuilder) => {
      editBuilder.insert(
        new vscode.Position(1, 0),
        `${newline}oil-dir/oil-file.ts`
      );
    });

    assert.strictEqual(
      editor.document.getText(),
      `/000 ../${newline}oil-dir/oil-file.ts`,
      "Text was not typed into editor"
    );

    await vscode.commands.executeCommand("workbench.action.files.save");

    // Give the file save operation time to complete
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Wait for file content to update
    await waitFor(() =>
      assert.strictEqual(
        editor.document.getText(),
        `/000 ../${newline}/001 oil-dir/`
      )
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

  test("Edit and renames file", async () => {
    await vscode.commands.executeCommand("oil-code.open");
    await waitFor(() =>
      assert.strictEqual(
        vscode.window.activeTextEditor?.document.getText(),
        "/000 ../"
      )
    );
    const editor = vscode.window.activeTextEditor;
    assert.ok(editor, "No active editor");

    await editor.edit((editBuilder) => {
      editBuilder.insert(new vscode.Position(1, 0), `${newline}oil-file.md`);
    });

    assert.strictEqual(
      editor.document.getText(),
      `/000 ../${newline}oil-file.md`,
      "Text file was not typed into editor"
    );

    await vscode.commands.executeCommand("workbench.action.files.save");

    // Give the file save operation time to complete
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Wait for file content to update
    await waitFor(() =>
      assert.strictEqual(
        editor.document.getText(),
        `/000 ../${newline}/001 oil-file.md`
      )
    );

    // Move cursor to the file name
    const position = new vscode.Position(1, 0);
    editor.selection = new vscode.Selection(position, position);
    await vscode.commands.executeCommand("oil-code.select");

    const mockFileContent = `mock file content`;
    await vscode.window.activeTextEditor?.edit((editBuilder) => {
      editBuilder.insert(new vscode.Position(0, 0), mockFileContent);
    });

    await vscode.commands.executeCommand("workbench.action.files.save");

    await new Promise((resolve) => setTimeout(resolve, 300));

    await vscode.commands.executeCommand("oil-code.open");

    await waitFor(() =>
      assert.strictEqual(
        vscode.window.activeTextEditor?.document.getText(),
        `/000 ../${newline}/001 oil-file.md`
      )
    );

    const editor2 = vscode.window.activeTextEditor;
    assert.ok(editor2, "No active editor");
    const position2 = new vscode.Position(1, 5);
    editor2.selection = new vscode.Selection(position2, position2);
    editor2.edit((editBuilder) => {
      editBuilder.insert(new vscode.Position(1, 5), `new-`);
    });
    await vscode.commands.executeCommand("workbench.action.files.save");
    await waitFor(() =>
      assert.strictEqual(
        vscode.window.activeTextEditor?.document.getText(),
        `/000 ../${newline}/001 new-oil-file.md`
      )
    );

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    assert.ok(workspaceFolder, "No workspace folder found");
    // Check if the file was renamed
    const files = await vscode.workspace.fs.readDirectory(workspaceFolder.uri);
    const fileExists = files.some(
      ([name, type]) =>
        type === vscode.FileType.File && name === "new-oil-file.md"
    );
    assert.ok(fileExists, "File was not renamed correctly");
  });

  test("Move file to another directory", async () => {
    await vscode.commands.executeCommand("oil-code.open");
    await waitFor(() =>
      assert.strictEqual(
        vscode.window.activeTextEditor?.document.getText(),
        "/000 ../"
      )
    );
    const editor = vscode.window.activeTextEditor;
    assert.ok(editor, "No active editor");

    await editor.edit((editBuilder) => {
      editBuilder.insert(
        new vscode.Position(1, 0),
        `${newline}sub-dir/${newline}oil-file.md`
      );
    });

    assert.strictEqual(
      editor.document.getText(),
      `/000 ../${newline}sub-dir/${newline}oil-file.md`,
      "Text file was not typed into editor"
    );

    await vscode.commands.executeCommand("workbench.action.files.save");

    // Give the file save operation time to complete
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Wait for file content to update
    await waitFor(() =>
      assert.strictEqual(
        editor.document.getText(),
        `/000 ../${newline}/001 sub-dir/${newline}/002 oil-file.md`
      )
    );

    // Move cursor to the file name
    const position = new vscode.Position(2, 0);
    editor.selection = new vscode.Selection(position, position);

    // Cut selection
    await vscode.commands.executeCommand("editor.action.deleteLines");

    // Move cursor to the new directory
    const position3 = new vscode.Position(1, 0);
    editor.selection = new vscode.Selection(position3, position3);

    await vscode.commands.executeCommand("oil-code.select");
    await new Promise((resolve) => setTimeout(resolve, 100));

    const editor2 = vscode.window.activeTextEditor;
    assert.ok(editor2, "No active editor");
    editor2.selection = new vscode.Selection(position3, position3);
    editor2.edit((editBuilder) => {
      editBuilder.insert(new vscode.Position(0, 8), newline);
      editBuilder.insert(new vscode.Position(1, 0), `/002 oil-file.md`);
    });
    await new Promise((resolve) => setTimeout(resolve, 100));

    await vscode.commands.executeCommand("workbench.action.files.save");
    await new Promise((resolve) => setTimeout(resolve, 300));

    await waitFor(() =>
      assert.strictEqual(
        editor2.document.getText(),
        `/000 ../${newline}/003 oil-file.md`
      )
    );

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    assert.ok(workspaceFolder, "No workspace folder found");
    // Check if the file was moved
    const files = await vscode.workspace.fs.readDirectory(workspaceFolder.uri);
    const fileExists = files.some(
      ([name, type]) => type === vscode.FileType.File && name === "oil-file.md"
    );
    assert.ok(!fileExists, "File was not moved correctly");

    const files2 = await vscode.workspace.fs.readDirectory(
      vscode.Uri.joinPath(workspaceFolder.uri, "sub-dir")
    );
    const fileExists2 = files2.some(
      ([name, type]) => type === vscode.FileType.File && name === "oil-file.md"
    );
    assert.ok(fileExists2, "File was not moved correctly");
  });

  test("Move directory to another directory", async () => {
    await vscode.commands.executeCommand("oil-code.open");
    await waitFor(() =>
      assert.strictEqual(
        vscode.window.activeTextEditor?.document.getText(),
        "/000 ../"
      )
    );
    const editor = vscode.window.activeTextEditor;
    assert.ok(editor, "No active editor");

    await editor.edit((editBuilder) => {
      editBuilder.insert(
        new vscode.Position(1, 0),
        ["", "oil-dir-parent/", "oil-dir-child/oil-file.md"].join(newline)
      );
    });

    await vscode.commands.executeCommand("workbench.action.files.save");

    // Give the file save operation time to complete
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Wait for file content to update
    await waitFor(() =>
      assert.strictEqual(
        editor.document.getText(),
        ["/000 ../", "/001 oil-dir-child/", "/002 oil-dir-parent/"].join(
          newline
        )
      )
    );

    editor.selection = new vscode.Selection(
      new vscode.Position(1, 0),
      new vscode.Position(1, 0)
    );
    await vscode.commands.executeCommand("editor.action.deleteLines");
    await new Promise((resolve) => setTimeout(resolve, 100));
    editor.selection = new vscode.Selection(
      new vscode.Position(1, 0),
      new vscode.Position(1, 0)
    );
    await vscode.commands.executeCommand("oil-code.select");
    await new Promise((resolve) => setTimeout(resolve, 100));

    const editor2 = vscode.window.activeTextEditor;
    assert.ok(editor2, "No active editor");
    editor2.selection = new vscode.Selection(
      new vscode.Position(1, 0),
      new vscode.Position(1, 0)
    );
    editor2.edit((editBuilder) => {
      editBuilder.insert(
        new vscode.Position(1, 0),
        ["", "/001 oil-dir-child/"].join(newline)
      );
    });
    await new Promise((resolve) => setTimeout(resolve, 100));

    await vscode.commands.executeCommand("workbench.action.files.save");
    await new Promise((resolve) => setTimeout(resolve, 300));

    await waitFor(() =>
      assert.strictEqual(
        editor2.document.getText(),
        ["/000 ../", "/003 oil-dir-child/"].join(newline)
      )
    );

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    assert.ok(workspaceFolder, "No workspace folder found");
    // Check if the file was moved
    const files = await vscode.workspace.fs.readDirectory(workspaceFolder.uri);
    const parentDirExists = files.some(
      ([name, type]) =>
        type === vscode.FileType.Directory && name === "oil-dir-parent"
    );
    assert.ok(parentDirExists, "Parent directory was not where it should be");
    const childDirExists = files.some(
      ([name, type]) =>
        type === vscode.FileType.Directory && name === "oil-dir-child"
    );
    assert.ok(!childDirExists, "Child directory was not moved from parent");

    const parentDirFiles = await vscode.workspace.fs.readDirectory(
      vscode.Uri.joinPath(workspaceFolder.uri, "oil-dir-parent")
    );
    const childDir = parentDirFiles.some(
      ([name, type]) =>
        type === vscode.FileType.Directory && name === "oil-dir-child"
    );
    assert.ok(childDir, "Child directory was not moved to parent");

    const childDirFiles = await vscode.workspace.fs.readDirectory(
      vscode.Uri.joinPath(
        workspaceFolder.uri,
        "oil-dir-parent",
        "oil-dir-child"
      )
    );
    const childFileExists = childDirFiles.some(
      ([name, type]) => type === vscode.FileType.File && name === "oil-file.md"
    );
    assert.ok(
      childFileExists,
      "Child directory files was not moved with child dir"
    );
  });

  // Move file to another directory and rename
  // Move directory to another directory and rename
});
