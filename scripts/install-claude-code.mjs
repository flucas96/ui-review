#!/usr/bin/env node

import { cp, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const installationStatePath = join(homedir(), ".ui-review", "installation.json");
const skillNames = ["review-feedback", "start-ui-review", "stop-ui-review", "update-ui-review"];

/** Parse installer flags into a stable configuration. */
export function parseInstallerArguments(argv) {
  const options = {
    configureMcp: true,
    dryRun: false,
    installCli: true,
    target: join(homedir(), ".claude", "skills"),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--dry-run") {
      options.dryRun = true;
    } else if (argument === "--skip-cli") {
      options.installCli = false;
    } else if (argument === "--skip-mcp") {
      options.configureMcp = false;
    } else if (argument === "--target") {
      const target = argv[index + 1];
      if (target === undefined) {
        throw new Error("Missing value for --target");
      }
      options.target = resolve(target);
      index += 1;
    } else if (argument === "--help" || argument === "-h") {
      return { ...options, help: true };
    } else {
      throw new Error(`Unknown option: ${argument}`);
    }
  }

  return options;
}

/** Copy the bundled Claude Code skills into a personal or test directory. */
export async function installSkills(target, sourceRoot = repositoryRoot) {
  await mkdir(target, { recursive: true });
  for (const skillName of skillNames) {
    await cp(
      join(sourceRoot, ".claude", "skills", skillName),
      join(target, skillName),
      { force: true, recursive: true },
    );
  }
}

/** Record the source checkout used for future UI Review updates. */
export async function writeInstallationState(
  target = installationStatePath,
  sourceRoot = repositoryRoot,
  options = { configureMcp: true, installCli: true, target: join(homedir(), ".claude", "skills") },
) {
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify({
    configureMcp: options.configureMcp,
    installCli: options.installCli,
    schemaVersion: 1,
    skillTarget: options.target,
    sourceRoot,
  }, null, 2)}\n`, "utf8");
}

function run(command, args, allowFailure = false) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: "inherit",
  });
  if (result.error !== undefined && !allowFailure) {
    throw result.error;
  }
  if (result.status !== 0 && !allowFailure) {
    throw new Error(`${command} exited with status ${String(result.status)}`);
  }
  return result.status === 0;
}

function printHelp() {
  process.stdout.write(`Install UI Review for Claude Code\n\n`);
  process.stdout.write(`Usage: npm run install:claude -- [options]\n\n`);
  process.stdout.write(`  --target <path>  Skill destination, default ~/.claude/skills\n`);
  process.stdout.write(`  --skip-cli       Do not build and globally install the ui-review CLI\n`);
  process.stdout.write(`  --skip-mcp       Do not configure the user-scoped Claude MCP server\n`);
  process.stdout.write(`  --dry-run        Print the planned actions without changing anything\n`);
}

async function main() {
  const options = parseInstallerArguments(process.argv.slice(2));
  if (options.help === true) {
    printHelp();
    return;
  }

  process.stdout.write(`Claude skills: ${options.target}\n`);
  if (options.dryRun) {
    process.stdout.write(`Would synchronize: ${skillNames.join(", ")}\n`);
    process.stdout.write(`Would install CLI: ${String(options.installCli)}\n`);
    process.stdout.write(`Would configure MCP: ${String(options.configureMcp)}\n`);
    process.stdout.write(`Would record update source: ${installationStatePath}\n`);
    return;
  }

  await installSkills(options.target);
  process.stdout.write(`Synchronized ${skillNames.length} Claude Code skills.\n`);

  if (options.installCli) {
    run("npm", ["run", "build", "--workspace", "ui-review"]);
    const packDirectory = await mkdtemp(join(tmpdir(), "ui-review-package-"));
    try {
      run("npm", ["pack", "--workspace", "ui-review", "--pack-destination", packDirectory]);
      const archives = (await readdir(packDirectory)).filter((fileName) => fileName.endsWith(".tgz"));
      if (archives.length !== 1 || archives[0] === undefined) {
        throw new Error("Expected one packed ui-review archive");
      }
      run("npm", ["install", "--global", join(packDirectory, archives[0])]);
      run("ui-review", ["--version"]);
      process.stdout.write("Installed the ui-review CLI globally.\n");
    } finally {
      await rm(packDirectory, { force: true, recursive: true });
    }
  }

  if (options.configureMcp) {
    const hasClaude = run("claude", ["--version"], true);
    if (!hasClaude) {
      process.stdout.write("Claude Code was not found; skipped MCP configuration.\n");
    } else {
      run("claude", ["mcp", "remove", "--scope", "user", "ui-review"], true);
      run("claude", ["mcp", "add", "--transport", "stdio", "--scope", "user", "ui-review", "--", "ui-review", "mcp"]);
      process.stdout.write("Configured the user-scoped ui-review MCP server.\n");
    }
  }

  await writeInstallationState(installationStatePath, repositoryRoot, options);
  process.stdout.write(`Recorded the update source in ${installationStatePath}.\n`);
  process.stdout.write("Restart Claude Code only if the personal skills directory was created for the first time.\n");
}

const invokedAsEntry = process.argv[1] !== undefined
  && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (invokedAsEntry) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : "Unexpected installer failure";
    process.stderr.write(`Claude setup failed: ${message}\n`);
    process.exitCode = 1;
  });
}
