import * as assert from "assert";

export async function waitFor(
  condition: () => boolean,
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
  while (!condition()) {
    if (Date.now() > endTime) {
      if (options?.onTimeout) {
        assert.fail(options.onTimeout());
      }
      assert.fail(options?.message || "Condition not met within timeout");
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}
