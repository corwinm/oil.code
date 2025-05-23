import * as assert from "assert";
import { tryCatch } from "../../tryCatch";

export async function waitFor(
  assertion: () => void,
  options?: {
    timeout?: number;
    interval?: number;
    message?: string;
    onTimeout?: () => string;
  }
): Promise<void> {
  const startTime = Date.now();
  const timeout = options?.timeout || 3000;
  const interval = options?.interval || 100;
  const endTime = startTime + timeout;
  const [_, error] = tryCatch(() => assertion());
  while (error) {
    if (Date.now() > endTime) {
      if (options?.onTimeout) {
        assert.fail(options.onTimeout());
      }
      throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}
