import { defineConfig } from "@vscode/test-cli";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const dirName = path.dirname(fileURLToPath(import.meta.url));
const testTempDir = path.join(dirName, "test-temp");

// Ensure the test temp directory is created
if (!fs.existsSync(testTempDir)) {
  fs.mkdirSync(testTempDir);
}

export default defineConfig({
  files: "out/test/**/*.test.js",
  workspaceFolder: testTempDir,
  launchArgs: ["--disable-extensions"],
  mocha: {
    timeout: 10000,
  },
});
