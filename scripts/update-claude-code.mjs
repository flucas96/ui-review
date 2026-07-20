#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const installationStatePath = resolve(homedir(), ".ui-review", "installation.json");

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: "inherit",
  });
  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${String(result.status)}`);
  }
}

/** Recover installer flags so updates preserve the original installation choices. */
export async function loadInstallerArguments(statePath = installationStatePath) {
  try {
    const state = JSON.parse(await readFile(statePath, "utf8"));
    const args = [];
    if (typeof state.skillTarget === "string" && state.skillTarget.length > 0) {
      args.push("--target", state.skillTarget);
    }
    if (state.installCli === false) {
      args.push("--skip-cli");
    }
    if (state.configureMcp === false) {
      args.push("--skip-mcp");
    }
    return args;
  } catch (error) {
    if (error !== null && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

/** Fast-forward the source checkout and reinstall every Claude Code integration. */
export async function updateClaudeInstallation(runCommand = run, loadArguments = loadInstallerArguments) {
  const installerArguments = await loadArguments();
  runCommand("git", ["pull", "--ff-only"]);
  runCommand("npm", ["ci"]);
  runCommand("npm", ["run", "install:claude", ...(installerArguments.length === 0 ? [] : ["--", ...installerArguments])]);
}

const invokedAsEntry = process.argv[1] !== undefined
  && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (invokedAsEntry) {
  void updateClaudeInstallation().then(() => {
    process.stdout.write("UI Review is up to date. Restart running Claude Code sessions to load updated skills and MCP tools.\n");
  }).catch((error) => {
    const message = error instanceof Error ? error.message : "Unexpected update failure";
    process.stderr.write(`UI Review update failed: ${message}\n`);
    process.stderr.write("No local changes were discarded. Resolve any reported Git conflict and run the command again.\n");
    process.exitCode = 1;
  });
}
