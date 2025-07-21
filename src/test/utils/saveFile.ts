import * as vscode from "vscode";
import { sleep } from "./sleep";

export async function saveFile() {
  await sleep(200);

  await vscode.commands.executeCommand("workbench.action.files.save");

  // Give the file save operation time to complete
  await new Promise((resolve) => setTimeout(resolve, 300));
}
