import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

const packagePath = resolve(process.cwd(), "package.json");
const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));

for (const key of ["name", "displayName", "version", "publisher", "description", "repository"]) {
  if (!packageJson[key]) {
    fail(`package.json is missing required key: ${key}`);
  }
}

if (!packageJson.engines?.vscode) {
  fail("package.json must define engines.vscode");
}

const refName = process.env.GITHUB_REF_NAME;
if (refName && refName.startsWith("v")) {
  const expectedVersion = refName.slice(1);
  if (packageJson.version !== expectedVersion) {
    fail(`release tag and package version mismatch: tag=${refName}, package.json=${packageJson.version}`);
  }
}

console.log("Release metadata checks passed.");
