import { select } from "./select";
import { logger } from "../logger";

export async function openParent() {
  logger.trace("Opening parent directory...");
  await select({ overRideLineText: "../" });
}
