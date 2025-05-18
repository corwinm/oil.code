import { defineConfig } from "@vscode/test-cli";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const dirName = path.dirname(fileURLToPath(import.meta.url));

// Ensure the test temp directory is created
const testTempDir = path.join(dirName, "test-temp");
if (!fs.existsSync(testTempDir)) {
  fs.mkdirSync(testTempDir);
}

export default defineConfig({
  files: "out/test/**/*.test.js",
  workspaceFolder: path.join(dirName, "test-temp"),
  mocha: {
    timeout: 10000,
  },
});
