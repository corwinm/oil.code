import { defineConfig } from "@vscode/test-cli";
import path from "path";
import { fileURLToPath } from "url";

// Get the directory name equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  files: "out/test/**/*.test.js",
  // launchArgs: [path.join(__dirname, "test-temp")],
  workspaceFolder: path.join(__dirname, "test-temp"),
  mocha: {
    timeout: 20000,
  },
});
