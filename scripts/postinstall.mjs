/**
 * Patches vscode-jsonrpc package.json exports field.
 *
 * The vscode-jsonrpc package ships with an exports map that is missing
 * entrypoints required by @anthropic-ai/claude-agent-sdk (e.g. './node').
 * This script adds the missing entrypoints after install.
 */
import { readFileSync, writeFileSync } from "node:fs";

const PACKAGE_PATH = "node_modules/vscode-jsonrpc/package.json";
const EXPECTED_EXPORTS = {
  ".": "./lib/node/main.js",
  "./node": "./node.js",
  "./node.js": "./node.js",
  "./browser": "./browser.js",
  "./browser.js": "./browser.js",
};

try {
  const pkg = JSON.parse(readFileSync(PACKAGE_PATH, "utf-8"));
  if (JSON.stringify(pkg.exports) !== JSON.stringify(EXPECTED_EXPORTS)) {
    pkg.exports = EXPECTED_EXPORTS;
    writeFileSync(PACKAGE_PATH, JSON.stringify(pkg, null, "\t") + "\n");
  }
} catch {
  // Package not installed yet or not applicable — skip silently
}
