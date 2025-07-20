import * as vscode from "vscode";
import { select } from "./select";
import { logger } from "../logger";

export async function openCwd() {
  logger.trace("Opening current working directory...");
  const cwd = vscode.workspace.workspaceFolders?.at(0)?.uri.fsPath;
  await select({ overRideLineText: "../", overRideTargetPath: cwd });
}
