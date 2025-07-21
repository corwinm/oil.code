import * as assert from "assert";
import * as vscode from "vscode";
import * as sinon from "sinon";
import { waitFor } from "./utils/waitFor";
import { waitForDocumentText } from "./utils/waitForDocumentText";
import { newline } from "../newline";
import { saveFile } from "./utils/saveFile";
import { sleep } from "./utils/sleep";
import { assertProjectFileStructure } from "./utils/assertProjectFileStructure";
import { moveCursorToLine } from "./utils/moveCursorToLine";
import { assertSelectionOnLine } from "./utils/assertSelectionOnLine";

async function cleanupTestDir() {
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
}

suite("oil.code", () => {
  // Setup and teardown for Sinon stubs
  let showWarningMessageStub: sinon.SinonStub;
  let executeCommandSpy: sinon.SinonStub;

  setup(() => {
    // Stub vscode.window.showWarningMessage to automatically return a response
    // This avoids blocking dialogs during tests
    showWarningMessageStub = sinon.stub(vscode.window, "showWarningMessage");
    // Default to "Yes" response for dialogs
    showWarningMessageStub.resolves("Yes");
  });

  teardown(async () => {
    // Restore the original methods after each test
    showWarningMessageStub.restore();
    executeCommandSpy?.restore();

    await vscode.commands.executeCommand("oil-code.close");
    await sleep(100);

    // Close all editors
    const editors = vscode.window.tabGroups.all.flatMap((group) =>
      group.tabs.map((tab) => tab.input)
    );
    for await (const _ of editors) {
      await vscode.commands.executeCommand(
        "workbench.action.closeActiveEditor"
      );
      await sleep(100);
    }
    await cleanupTestDir();
  });

  test("Oil opens", async () => {
    await vscode.commands.executeCommand("oil-code.open");
    await waitForDocumentText("/000 ../");

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
    await waitForDocumentText("/000 ../");

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

    await saveFile();

    // Wait for file content to update
    await waitForDocumentText(["/000 ../", "/001 oil-file.ts"]);
    await assertProjectFileStructure(["oil-file.ts"]);
    assertSelectionOnLine(editor, 0);
  });

  test("Creates directory", async () => {
    await vscode.commands.executeCommand("oil-code.open");
    await waitForDocumentText("/000 ../");
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
    moveCursorToLine(editor, 1);

    await saveFile();

    // Wait for file content to update
    await waitForDocumentText(["/000 ../", "/001 oil-dir/"]);
    await assertProjectFileStructure(["oil-dir/"]);
    assertSelectionOnLine(editor, 1);
  });

  test("Creates directory and file in one line", async () => {
    await vscode.commands.executeCommand("oil-code.open");
    await waitForDocumentText("/000 ../");

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

    moveCursorToLine(editor, 1);

    await saveFile();

    // Wait for file content to update
    await waitForDocumentText(["/000 ../", "/001 oil-dir/"]);

    // Check if the file was created
    await assertProjectFileStructure(["oil-dir/", "  oil-file.ts"]);
    assertSelectionOnLine(editor, 1);
  });

  test("Creates various files and directories in one step", async () => {
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
        [
          "",
          "oil-file.md",
          "oil-file.js",
          "index.html",
          "oil-dir/",
          "oil-dir/oil-file.ts",
          "oil-dir1/oil-dir2/oil-file2.ts",
          "oil-dir1/oil-dir2/oil-file3.ts",
          "oil-dir3/oil-file4.ts",
        ].join(newline)
      );
    });

    moveCursorToLine(editor, 8);

    await saveFile();

    // Wait for file content to update
    await waitForDocumentText([
      "/000 ../",
      "/001 oil-dir/",
      "/002 oil-dir1/",
      "/003 oil-dir3/",
      "/004 index.html",
      "/005 oil-file.js",
      "/006 oil-file.md",
    ]);

    // Check if the file was created
    await assertProjectFileStructure([
      "index.html",
      "oil-dir/",
      "  oil-file.ts",
      "oil-dir1/",
      "  oil-dir2/",
      "    oil-file2.ts",
      "    oil-file3.ts",
      "oil-dir3/",
      "  oil-file4.ts",
      "oil-file.js",
      "oil-file.md",
    ]);

    // Check cursor position is updated
    assertSelectionOnLine(editor, 3);
  });

  test("Creates file and ignores empty lines", async () => {
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
        ["", "", "oil-file.md"].join(newline)
      );
    });
    moveCursorToLine(editor, 1);

    await saveFile();

    // Wait for file content to update
    await waitForDocumentText(["/000 ../", "/001 oil-file.md"]);

    // Check cursor position is updated
    assertSelectionOnLine(editor, 1);

    // Check if the file was created
    await assertProjectFileStructure(["oil-file.md"]);
  });

  test("Edit and renames file", async () => {
    await vscode.commands.executeCommand("oil-code.open");
    await waitForDocumentText("/000 ../");

    await sleep(100);
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

    await saveFile();

    // Wait for file content to update
    await waitForDocumentText(["/000 ../", "/001 oil-file.md"]);

    // Move cursor to the file name
    const position = new vscode.Position(1, 5);
    editor.selection = new vscode.Selection(position, position);
    await vscode.commands.executeCommand("oil-code.select");

    await sleep(300);

    const mockFileContent = `mock file content`;
    await vscode.window.activeTextEditor?.edit((editBuilder) => {
      editBuilder.insert(new vscode.Position(0, 0), mockFileContent);
    });

    await saveFile();

    await vscode.commands.executeCommand("oil-code.open");

    await waitForDocumentText(["/000 ../", "/001 oil-file.md"]);

    vscode.window.activeTextEditor?.edit((editBuilder) => {
      editBuilder.insert(new vscode.Position(1, 5), `new-`);
    });

    await saveFile();

    await waitForDocumentText(["/000 ../", "/002 new-oil-file.md"]);

    await assertProjectFileStructure(["new-oil-file.md"]);
  });

  test("Move file to another directory", async () => {
    await vscode.commands.executeCommand("oil-code.open");
    await waitForDocumentText("/000 ../");

    const editor = vscode.window.activeTextEditor;
    assert.ok(editor, "No active editor");

    await editor.edit((editBuilder) => {
      editBuilder.insert(
        new vscode.Position(1, 0),
        `${newline}sub-dir/${newline}oil-file.md`
      );
    });

    await saveFile();

    // Wait for file content to update
    await waitForDocumentText([
      "/000 ../",
      "/001 sub-dir/",
      "/002 oil-file.md",
    ]);

    // Move cursor to the file name
    const filePosition = new vscode.Position(2, 0);
    editor.selection = new vscode.Selection(filePosition, filePosition);
    await vscode.commands.executeCommand("oil-code.select");
    await sleep(200);

    const mockFileContent = `mock file content`;
    await vscode.window.activeTextEditor?.edit((editBuilder) => {
      editBuilder.insert(new vscode.Position(0, 0), mockFileContent);
    });

    await saveFile();

    await vscode.commands.executeCommand("oil-code.open");
    await sleep(100);

    // Move cursor to the file name
    const position = new vscode.Position(2, 0);
    const editor2 = vscode.window.activeTextEditor;
    assert.ok(editor2, "No active editor2");
    editor2.selection = new vscode.Selection(position, position);

    // Cut selection
    await vscode.commands.executeCommand("editor.action.deleteLines");

    // Move cursor to the new directory
    const position3 = new vscode.Position(1, 0);
    editor.selection = new vscode.Selection(position3, position3);

    await vscode.commands.executeCommand("oil-code.select");
    await sleep(200);

    const editor3 = vscode.window.activeTextEditor;
    assert.ok(editor3, "No active editor3");
    editor3.edit((editBuilder) => {
      editBuilder.insert(new vscode.Position(0, 8), newline);
      editBuilder.insert(new vscode.Position(1, 0), `/002 oil-file.md`);
    });

    await saveFile();

    await sleep(100);

    await waitForDocumentText(["/000 ../", "/003 oil-file.md"]);

    await assertProjectFileStructure(["sub-dir/", "  oil-file.md"]);
  });

  test("Move file to another directory and rename", async () => {
    await vscode.commands.executeCommand("oil-code.open");
    await waitForDocumentText("/000 ../");
    const editor = vscode.window.activeTextEditor;
    assert.ok(editor, "No active editor");

    await editor.edit((editBuilder) => {
      editBuilder.insert(
        new vscode.Position(1, 0),
        `${newline}sub-dir/${newline}oil-file.md`
      );
    });

    await saveFile();

    // Wait for file content to update
    await waitForDocumentText([
      "/000 ../",
      "/001 sub-dir/",
      "/002 oil-file.md",
    ]);

    // Move cursor to the file name
    const filePosition = new vscode.Position(2, 0);
    editor.selection = new vscode.Selection(filePosition, filePosition);
    await vscode.commands.executeCommand("oil-code.select");

    const mockFileContent = `mock file content`;
    await vscode.window.activeTextEditor?.edit((editBuilder) => {
      editBuilder.insert(new vscode.Position(0, 0), mockFileContent);
    });

    await saveFile();

    await vscode.commands.executeCommand("oil-code.open");
    await sleep(100);

    const editor2 = vscode.window.activeTextEditor;
    assert.ok(editor2, "No active editor2");
    // Move cursor to the file name
    const position = new vscode.Position(2, 0);
    editor2.selection = new vscode.Selection(position, position);

    await vscode.commands.executeCommand("editor.action.deleteLines");
    await sleep(100);

    // Move cursor to the new directory
    const position3 = new vscode.Position(1, 0);
    editor2.selection = new vscode.Selection(position3, position3);

    await vscode.commands.executeCommand("oil-code.select");
    await sleep(200);

    const editor3 = vscode.window.activeTextEditor;
    assert.ok(editor3, "No active editor3");
    editor3.edit((editBuilder) => {
      editBuilder.insert(new vscode.Position(0, 8), newline);
      editBuilder.insert(new vscode.Position(1, 0), `/002 oil-file-rename.md`);
    });

    await saveFile();

    await waitForDocumentText(["/000 ../", "/003 oil-file-rename.md"]);

    await assertProjectFileStructure(["sub-dir/", "  oil-file-rename.md"]);
  });

  test("Move directory to another directory", async () => {
    await vscode.commands.executeCommand("oil-code.open");
    await waitForDocumentText("/000 ../");
    const editor = vscode.window.activeTextEditor;
    assert.ok(editor, "No active editor");

    await editor.edit((editBuilder) => {
      editBuilder.insert(
        new vscode.Position(1, 0),
        ["", "oil-dir-parent/", "oil-dir-child/oil-file.md"].join(newline)
      );
    });

    await saveFile();

    // Wait for file content to update
    await waitForDocumentText([
      "/000 ../",
      "/001 oil-dir-child/",
      "/002 oil-dir-parent/",
    ]);

    editor.selection = new vscode.Selection(
      new vscode.Position(1, 0),
      new vscode.Position(1, 0)
    );
    await vscode.commands.executeCommand("editor.action.deleteLines");
    await sleep(100);
    editor.selection = new vscode.Selection(
      new vscode.Position(1, 0),
      new vscode.Position(1, 0)
    );
    await vscode.commands.executeCommand("oil-code.select");
    await sleep(200);

    const editor2 = vscode.window.activeTextEditor;
    assert.ok(editor2, "No active editor");
    editor2.edit((editBuilder) => {
      editBuilder.insert(
        new vscode.Position(1, 0),
        ["", "/001 oil-dir-child/"].join(newline)
      );
    });

    await saveFile();

    await waitForDocumentText(["/000 ../", "/003 oil-dir-child/"]);
    await assertProjectFileStructure([
      "oil-dir-parent/",
      "  oil-dir-child/",
      "    oil-file.md",
    ]);
  });

  test("Move directory to another directory and rename", async () => {
    await vscode.commands.executeCommand("oil-code.open");
    await waitForDocumentText("/000 ../");
    const editor = vscode.window.activeTextEditor;
    assert.ok(editor, "No active editor");

    await editor.edit((editBuilder) => {
      editBuilder.insert(
        new vscode.Position(1, 0),
        ["", "oil-dir-parent/", "oil-dir-child/oil-file.md"].join(newline)
      );
    });

    await saveFile();

    // Wait for file content to update
    await waitForDocumentText([
      "/000 ../",
      "/001 oil-dir-child/",
      "/002 oil-dir-parent/",
    ]);

    editor.selection = new vscode.Selection(1, 5, 1, 5);
    await vscode.commands.executeCommand("editor.action.deleteLines");
    await sleep(200);
    editor.selection = new vscode.Selection(1, 5, 1, 5);
    await vscode.commands.executeCommand("oil-code.select");
    await sleep(200);

    const editor2 = vscode.window.activeTextEditor;
    assert.ok(editor2, "No active editor");
    editor2.edit((editBuilder) => {
      editBuilder.insert(
        new vscode.Position(1, 0),
        ["", "/001 oil-dir-child-renamed/"].join(newline)
      );
    });

    await saveFile();

    await sleep(100);

    await waitForDocumentText(["/000 ../", "/003 oil-dir-child-renamed/"]);
    await assertProjectFileStructure([
      "oil-dir-parent/",
      "  oil-dir-child-renamed/",
      "    oil-file.md",
    ]);
  });

  test("Create directory and change working directory", async () => {
    await vscode.commands.executeCommand("oil-code.open");
    await waitForDocumentText("/000 ../");

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

    await saveFile();

    // Wait for file content to update
    await waitForDocumentText(["/000 ../", "/001 oil-dir/"]);

    // Move cursor to the file name
    const position = new vscode.Position(1, 0);
    editor.selection = new vscode.Selection(position, position);
    await vscode.commands.executeCommand("oil-code.select");

    await sleep(300);

    // Mock response to vscode.openFolder
    // This is a workaround since calling this causes the test to disconnect
    // from the test runner and fail.
    executeCommandSpy = sinon.stub(vscode.commands, "executeCommand");
    executeCommandSpy.withArgs("oil-code.cd").callThrough();
    executeCommandSpy.withArgs("vscode.openFolder").returns(Promise.resolve());
    await vscode.commands.executeCommand("oil-code.cd");

    await waitFor(() =>
      // Check that the vscode.openFolder command was called
      assert.ok(
        executeCommandSpy.calledWith("vscode.openFolder"),
        "vscode.openFolder was not called"
      )
    );
  });

  test("Displays help page", async () => {
    await vscode.commands.executeCommand("oil-code.open");
    await waitForDocumentText("/000 ../");

    await vscode.commands.executeCommand("oil-code.help");
    await sleep(100);
    await waitFor(() => {
      const tabGroup = vscode.window.tabGroups.all.at(0);
      assert.ok(tabGroup, "No tab group found");
      const previewTab = tabGroup.tabs.at(-1);
      assert.ok(previewTab, "No preview tab found in the tab group");
      assert.strictEqual(
        (previewTab.input as vscode.TabInputWebview).viewType,
        "mainThreadWebview-oilHelp"
      );

      assert.strictEqual(previewTab.label, "Oil Help");
    });
  });

  test("Preview file", async () => {
    const testContent = `# Oil FileThis${newline}is a test file for Oil Code extension.`;
    await vscode.workspace.fs.writeFile(
      vscode.Uri.joinPath(
        vscode.workspace.workspaceFolders![0].uri,
        "oil-file.md"
      ),
      Buffer.from(testContent, "utf-8")
    );
    await vscode.commands.executeCommand("oil-code.open");
    await waitForDocumentText(["/000 ../", "/001 oil-file.md"]);

    const editor = vscode.window.activeTextEditor;
    assert.ok(editor, "No active editor");

    // Move cursor to the file name
    const position = new vscode.Position(1, 0);
    editor.selection = new vscode.Selection(position, position);
    await vscode.commands.executeCommand("oil-code.preview");

    await waitFor(() => {
      const previewTab = vscode.window.tabGroups.all.at(1)?.tabs.at(0);
      assert.ok(previewTab, "Preview tab not found");
      assert.strictEqual(
        (previewTab.input as vscode.TabInputText).uri.toString(),
        "oil-preview://oil-preview/oil-file.md"
      );
      const previewEditor = vscode.window.visibleTextEditors.find(
        (editor) =>
          editor.document.uri.toString() ===
          "oil-preview://oil-preview/oil-file.md"
      );
      assert.ok(previewEditor, "No editor found for the preview tab");
      assert.strictEqual(
        previewEditor.document.getText(),
        testContent,
        "Preview content does not match expected content"
      );
    });
  });

  test("Preview directory and file", async () => {
    const testContent = `# Oil FileThis${newline}is a test file for Oil Code extension.`;
    await vscode.workspace.fs.createDirectory(
      vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, "oil-dir")
    );
    await vscode.workspace.fs.writeFile(
      vscode.Uri.joinPath(
        vscode.workspace.workspaceFolders![0].uri,
        "oil-dir",
        "oil-file1.md"
      ),
      Buffer.from(testContent, "utf-8")
    );
    await vscode.workspace.fs.writeFile(
      vscode.Uri.joinPath(
        vscode.workspace.workspaceFolders![0].uri,
        "oil-dir",
        "oil-file2.md"
      ),
      Buffer.from(testContent, "utf-8")
    );

    await vscode.commands.executeCommand("oil-code.open");
    await waitForDocumentText(["/000 ../", "/001 oil-dir/"]);

    const editor = vscode.window.activeTextEditor;
    assert.ok(editor, "No active editor");

    // Move cursor to the file name
    await sleep(100);
    editor.selection = new vscode.Selection(1, 5, 1, 5);
    await vscode.commands.executeCommand("oil-code.preview");

    await waitFor(() => {
      const previewTab = vscode.window.tabGroups.all.at(1)?.tabs.at(0);
      assert.ok(previewTab, "Preview tab not found");
      assert.strictEqual(
        (previewTab.input as vscode.TabInputText).uri.toString(),
        "oil-preview://oil-preview/oil-dir"
      );
      const previewEditor = vscode.window.visibleTextEditors.find(
        (editor) =>
          editor.document.uri.toString() === "oil-preview://oil-preview/oil-dir"
      );
      assert.ok(previewEditor, "No editor found for the preview tab");
      assert.strictEqual(
        previewEditor.document.getText(),
        ["/000 ../", "/000 oil-file1.md", "/000 oil-file2.md"].join(newline),
        "Preview content does not match expected content"
      );
    });

    await sleep(100);

    await vscode.commands.executeCommand("oil-code.select");

    await sleep(100);

    await waitForDocumentText([
      "/000 ../",
      "/002 oil-file1.md",
      "/003 oil-file2.md",
    ]);

    await waitFor(() => {
      const previewTab = vscode.window.tabGroups.all.at(1)?.tabs.at(0);
      assert.ok(previewTab, "Preview tab not found");
      assert.strictEqual(
        (previewTab.input as vscode.TabInputText).uri.toString(),
        "oil-preview://oil-preview/test-temp"
      );
      const previewEditor = vscode.window.visibleTextEditors.find(
        (editor) =>
          editor.document.uri.toString() ===
          "oil-preview://oil-preview/test-temp"
      );
      assert.ok(previewEditor, "No editor found for the preview tab");
      assert.strictEqual(
        previewEditor.document.getText(),
        ["/000 ../", "/000 oil-dir/"].join(newline),
        "Preview content does not match expected content"
      );
    });

    // Move cursor to the file name
    const editor3 = vscode.window.activeTextEditor;
    assert.ok(editor3, "No active editor");
    editor3.selection = new vscode.Selection(1, 5, 1, 5);

    await sleep(100);

    await waitFor(() => {
      const previewTab = vscode.window.tabGroups.all.at(1)?.tabs.at(0);
      assert.ok(previewTab, "Preview tab not found");
      assert.strictEqual(
        (previewTab.input as vscode.TabInputText).uri.toString(),
        "oil-preview://oil-preview/oil-file1.md"
      );
      const previewEditor = vscode.window.visibleTextEditors.find(
        (editor) =>
          editor.document.uri.toString() ===
          "oil-preview://oil-preview/oil-file1.md"
      );
      assert.ok(previewEditor, "No editor found for the preview tab");
      assert.strictEqual(
        previewEditor.document.getText(),
        testContent,
        "Preview content does not match expected content"
      );
    });
  });
});
