import assert from "assert";
import * as vscode from "vscode";
import { waitFor } from "./waitFor";
import { newline } from "../../newline";

export async function waitForDocumentText(documentText: string | string[]) {
  await waitFor(() =>
    assert.strictEqual(
      vscode.window.activeTextEditor?.document.getText(),
      Array.isArray(documentText) ? documentText.join(newline) : documentText
    )
  );
}
