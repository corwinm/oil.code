import * as vscode from "vscode";

export function getDisableVimKeymapsSetting(): boolean {
  const config = vscode.workspace.getConfiguration("oil-code");
  return config.get<boolean>("disableVimKeymaps") || false;
}

export function getDisableOpenCwdNothingOpenSetting(): boolean {
  const config = vscode.workspace.getConfiguration("oil-code");
  return config.get<boolean>("disableOpenCwdNothingOpen") || false;
}

export function getdisableUnderscoreOpenCwdSetting(): boolean {
  const config = vscode.workspace.getConfiguration("oil-code");
  return config.get<boolean>("disableUnderscoreOpenCwd") || false;
}

export function getEnableWorkspaceEditSetting(): boolean {
  const config = vscode.workspace.getConfiguration("oil-code");
  return config.get<boolean>("enableWorkspaceEdit") || false;
}

export function getEnableAlternateConfirmationSetting(): boolean {
  const config = vscode.workspace.getConfiguration("oil-code");
  return config.get<boolean>("enableAlternateConfirmation") || false;
}

let restoreAutoSave = false;

export async function checkAndDisableAutoSave() {
  const config = vscode.workspace.getConfiguration("files");
  const autoSave = config.get<string>("autoSave");
  if (autoSave === "afterDelay") {
    restoreAutoSave = true;
    await config.update("autoSave", "off", vscode.ConfigurationTarget.Global);
  }
}

export async function checkAndEnableAutoSave() {
  const config = vscode.workspace.getConfiguration("files");
  if (restoreAutoSave) {
    await config.update(
      "autoSave",
      "afterDelay",
      vscode.ConfigurationTarget.Global
    );
    restoreAutoSave = false;
  }
}
