export function tryCatch<T>(fn: () => T): [T | undefined, Error | undefined] {
  try {
    const result = fn();
    return [result, undefined];
  } catch (error) {
    return [undefined, error as Error];
  }
}
