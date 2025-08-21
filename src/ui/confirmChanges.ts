import * as vscode from "vscode";

export type Change =
  | { kind: "create"; to: string }
  | { kind: "delete"; from: string }
  | { kind: "rename" | "move"; from: string; to: string }
  | { kind: "modify"; from: string }
  | { kind: "copy"; from: string; to: string };

export async function confirmChanges(changes: Change[]): Promise<boolean> {
  if (changes.length === 0) {
    return true;
  }
  return confirmChangesQuickPick(changes);
}

async function confirmChangesQuickPick(changes: Change[]): Promise<boolean> {
  const qp = vscode.window.createQuickPick<vscode.QuickPickItem>();
  qp.title = "oil.code — Confirm changes";
  qp.matchOnDetail = true;
  qp.ignoreFocusOut = true;
  qp.canSelectMany = false; // display-only list; Enter = Apply

  const items = changes.map(toQuickPickItem);
  qp.items = items;

  const APPLY_BUTTON: vscode.QuickInputButton = {
    iconPath: new vscode.ThemeIcon("check"),
    tooltip: "Apply changes",
  };
  const CANCEL_BUTTON: vscode.QuickInputButton = {
    iconPath: new vscode.ThemeIcon("close"),
    tooltip: "Cancel",
  };
  qp.buttons = [APPLY_BUTTON, CANCEL_BUTTON];

  const decision = await new Promise<boolean>((resolve) => {
    qp.onDidTriggerButton((btn) => {
      resolve(btn === APPLY_BUTTON);
      qp.hide();
    });
    qp.onDidAccept(() => {
      // Treat Enter as "Apply"
      resolve(true);
      qp.hide();
    });
    qp.onDidHide(() => resolve(false)); // clicks outside => cancel
    qp.show();
  });
  qp.dispose();
  return decision;
}

function toQuickPickItem(c: Change): vscode.QuickPickItem {
  switch (c.kind) {
    case "create":
      return {
        label: "$(diff-added) create",
        detail: c.to,
      };
    case "delete":
      return {
        label: "$(diff-removed) delete",
        detail: c.from,
      };
    case "modify":
      return {
        label: "$(edit) modify",
        detail: c.from,
      };
    case "rename":
    case "move":
      return {
        label: `$(diff-renamed) ${c.kind}`,
        detail: `${c.from} \u2192 ${c.to}`,
      };
    case "copy":
      return {
        label: "$(diff-added) copy",
        detail: `${c.from} \u2192 ${c.to}`,
      };
  }
}
