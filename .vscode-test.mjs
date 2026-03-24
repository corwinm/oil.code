import { defineConfig } from "@vscode/test-cli";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const dirName = path.dirname(fileURLToPath(import.meta.url));
const testTempDir = path.join(dirName, "test-temp");
const fallbackVersion = "1.96.2";

// Ensure the test temp directory is created
if (!fs.existsSync(testTempDir)) {
  fs.mkdirSync(testTempDir, { recursive: true });
}

function resolveLocalVSCodeExecutablePath() {
  const candidates = [];

  if (process.env.VSCODE_EXECUTABLE_PATH) {
    candidates.push(process.env.VSCODE_EXECUTABLE_PATH);
  }

  if (process.platform === "darwin") {
    candidates.push(
      "/Applications/Visual Studio Code.app/Contents/MacOS/Electron",
      path.join(
        process.env.HOME ?? "",
        "Applications/Visual Studio Code.app/Contents/MacOS/Electron"
      )
    );
  }

  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA;
    const programFiles = process.env.ProgramFiles;
    const programFilesX86 = process.env["ProgramFiles(x86)"];

    if (localAppData) {
      candidates.push(
        path.join(localAppData, "Programs/Microsoft VS Code/Code.exe")
      );
    }

    if (programFiles) {
      candidates.push(
        path.join(programFiles, "Microsoft VS Code/Code.exe")
      );
    }

    if (programFilesX86) {
      candidates.push(
        path.join(programFilesX86, "Microsoft VS Code/Code.exe")
      );
    }
  }

  if (process.platform === "linux") {
    candidates.push(
      "/usr/bin/code",
      "/usr/share/code/code",
      "/snap/code/current/usr/share/code/code"
    );
  }

  return candidates.find((candidate) => candidate && fs.existsSync(candidate));
}

const localVSCodeExecutablePath = resolveLocalVSCodeExecutablePath();

export default defineConfig({
  files: "out/test/**/*.test.js",
  version: fallbackVersion,
  workspaceFolder: testTempDir,
  launchArgs: ["--disable-extensions"],
  useInstallation: localVSCodeExecutablePath
    ? { fromPath: localVSCodeExecutablePath }
    : undefined,
  mocha: {
    timeout: 10000,
  },
});
