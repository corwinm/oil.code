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

  // Outside click should cancel -> allow hide on blur
  qp.ignoreFocusOut = false;

  // Read-only list feel
  qp.items = changes.map(toQuickPickItem);
  qp.canSelectMany = false;

  // "Hide" the input and instruct the user
  qp.placeholder = "[Y]es  [N]o";
  qp.value = "";

  // We don't want buttons; Y/N only
  qp.buttons = [];

  const disposables: vscode.Disposable[] = [];
  const decision = await new Promise<boolean>((resolve) => {
    let finished = false;
    const finish = (ok: boolean) => {
      if (finished) {
        return;
      }
      finished = true;
      try {
        qp.hide();
      } catch {}
      resolve(ok);
    };

    // Make rows feel non-interactive
    disposables.push(
      qp.onDidChangeSelection(() => {
        qp.selectedItems = [];
      }),
      qp.onDidChangeActive(() => {
        qp.activeItems = [];
      }),

      // Ignore Enter entirely (only Y/N should close)
      qp.onDidAccept(() => {
        /* no-op */
      }),

      // Capture last typed char; accept only Y or N
      qp.onDidChangeValue((val) => {
        const ch = val.trim().slice(-1).toLowerCase();
        qp.value = ""; // keep the field visually empty
        if (ch === "y") {
          return finish(true);
        }
        if (ch === "n") {
          return finish(false);
        }
      }),

      // Esc or outside click hides -> cancel
      qp.onDidHide(() => {
        if (!finished) {
          resolve(false);
        }
      })
    );

    qp.show();
  });

  disposables.forEach((d) => d.dispose());
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
