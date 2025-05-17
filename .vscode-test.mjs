import { defineConfig } from "@vscode/test-cli";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

// Get the directory name equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure the test temp directory is created
const testTempDir = path.join(__dirname, "test-temp");
if (!fs.existsSync(testTempDir)) {
  fs.mkdirSync(testTempDir);
}

export default defineConfig({
  files: "out/test/**/*.test.js",
  // launchArgs: [path.join(__dirname, "test-temp")],
  workspaceFolder: path.join(__dirname, "test-temp"),
  mocha: {
    timeout: 10000,
  },
});
