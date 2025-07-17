import * as vscode from "vscode";
import { getDisableVimKeymapsSetting } from "../utils/settings";
import { logger } from "../logger";

export function isVSCodeVimAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      // VSCodeVim extension adds a "vim" configuration section
      const vimConfig = vscode.workspace.getConfiguration("vim");

      // Check if a known setting exists to confirm the extension is activated
      if (vimConfig && vimConfig.has("normalModeKeyBindings")) {
        logger.info("VSCodeVim extension is available");
        resolve(true);
      } else {
        logger.info(
          "VSCodeVim extension not available or not fully initialized"
        );
        resolve(false);
      }
    } catch (error) {
      logger.error("Error checking VSCodeVim availability:", error);
      resolve(false);
    }
  });
}

export async function registerVSCodeVimKeymap(): Promise<boolean> {
  // Check if vim keymaps are disabled in settings
  const isDisabled = getDisableVimKeymapsSetting();
  if (isDisabled) {
    logger.info("Vim keymaps are disabled in settings.");
    return false;
  }

  // Check if the extension is available before attempting to register keymaps
  if (await isVSCodeVimAvailable()) {
    try {
      logger.info("Registering VSCodeVim keymaps");

      // Configure VSCodeVim using workspace configuration
      const vimConfig = vscode.workspace.getConfiguration("vim");
      const normalModeKeymap =
        vimConfig.get<any[]>("normalModeKeyBindings") || [];
      let updatedKeymap = [...normalModeKeymap]; // Make a copy
      let keymapChanged = false;

      // Check for and add the Oil open binding if not present
      const hasOilOpenBinding = normalModeKeymap.some((binding) =>
        binding.commands?.some(
          (cmd: { command: string }) => cmd.command === "oil-code.open"
        )
      );

      if (!hasOilOpenBinding) {
        updatedKeymap.push({
          before: ["-"],
          commands: [{ command: "oil-code.open" }],
        });
        keymapChanged = true;
      }

      // Check for and add the Oil select binding if not present
      const hasOilSelectBinding = normalModeKeymap.some((binding) =>
        binding.commands?.some(
          (cmd: { command: string }) => cmd.command === "oil-code.select"
        )
      );

      if (!hasOilSelectBinding) {
        updatedKeymap.push({
          before: ["<cr>"],
          commands: [{ command: "oil-code.select" }],
        });
        keymapChanged = true;
      }

      // Check for and add the Oil refresh binding if not present
      const hasOilRefreshBinding = normalModeKeymap.some((binding) =>
        binding.commands?.some(
          (cmd: { command: string }) => cmd.command === "oil-code.refresh"
        )
      );

      if (!hasOilRefreshBinding) {
        updatedKeymap.push({
          before: ["<c-l>"],
          commands: [{ command: "oil-code.refresh" }],
        });
        keymapChanged = true;
      }

      // Check for and add the Oil cd binding if not present
      const hasOilCdBinding = normalModeKeymap.some((binding) =>
        binding.commands?.some(
          (cmd: { command: string }) => cmd.command === "oil-code.cd"
        )
      );
      if (!hasOilCdBinding) {
        updatedKeymap.push({
          before: ["`"],
          commands: [{ command: "oil-code.cd" }],
        });
        keymapChanged = true;
      }

      // Update the configuration if changes were made
      if (keymapChanged) {
        await vimConfig.update(
          "normalModeKeyBindings",
          updatedKeymap,
          vscode.ConfigurationTarget.Global
        );
        logger.info("VSCodeVim keymaps updated successfully");
      } else {
        logger.info("VSCodeVim keymaps already configured");
      }

      return true;
    } catch (error) {
      logger.error("Failed to register VSCodeVim keymap:", error);
      return false;
    }
  }

  logger.info(
    "VSCodeVim extension not available, skipping keymap registration"
  );
  return false;
}
