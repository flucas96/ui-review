#!/usr/bin/env node

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runMcpServer } from "./mcp/server.js";
import { startReviewServer } from "./server/review-server.js";

type ServeArguments = {
  readonly appId?: string;
  readonly command: "serve";
  readonly host: string;
  readonly port: number;
  readonly projectRoot: string;
  readonly target: string;
};

type McpArguments = {
  readonly command: "mcp";
  readonly projectRoot: string;
};

type CliArguments = McpArguments | ServeArguments;

const usage = `
UI Review — local visual feedback for coding agents

Usage:
  ui-review <url-or-path> [--app <name>] [--port 4317] [--host 127.0.0.1] [--root <path>]
  ui-review mcp [--root <path>]

Examples:
  ui-review http://127.0.0.1:5173
  ui-review ./dist/index.html --app marketing-site --port 4317
  ui-review mcp --root .
`.trim();

/** Run the UI Review command-line interface. */
export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(`${usage}\n`);
    return;
  }
  if (argv.includes("--version") || argv.includes("-v")) {
    process.stdout.write("0.1.0\n");
    return;
  }

  const parsed = parseArguments(argv);
  if (parsed.command === "mcp") {
    await runMcpServer(parsed.projectRoot);
    return;
  }

  const runningServer = await startReviewServer({
    ...(parsed.appId === undefined ? {} : { appId: parsed.appId }),
    host: parsed.host,
    port: parsed.port,
    projectRoot: parsed.projectRoot,
    target: parsed.target,
  });
  process.stdout.write(`\nUI Review is ready\n\n`);
  process.stdout.write(`  Review URL   ${runningServer.url}\n`);
  process.stdout.write(`  Target       ${parsed.target}\n`);
  process.stdout.write(`  Feedback     ${resolve(parsed.projectRoot, ".ui-review", "events.jsonl")}\n\n`);
  process.stdout.write("Open the review URL in VS Code with “Browser: Open Integrated Browser”.\n");
  process.stdout.write("Press Ctrl+C to stop.\n\n");

  const stop = (): void => {
    void runningServer.close().finally(() => process.exit(0));
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}

/** Parse CLI arguments without adding a runtime command framework. */
export function parseArguments(argv: readonly string[]): CliArguments {
  const values = [...argv];
  const isMcp = values[0] === "mcp";
  if (isMcp) {
    values.shift();
  }

  let host = "127.0.0.1";
  let port = 4317;
  let projectRoot = process.cwd();
  let appId: string | undefined;
  const positionals: string[] = [];

  for (let index = 0; index < values.length; index += 1) {
    const argument = values[index];
    if (argument === undefined) {
      continue;
    }
    if (argument === "--app" || argument === "--host" || argument === "--port" || argument === "--root") {
      const value = values[index + 1];
      if (value === undefined) {
        throw new Error(`Missing value for ${argument}\n\n${usage}`);
      }
      index += 1;
      if (argument === "--app") {
        if (value.trim().length === 0 || value.length > 200) {
          throw new Error("App identity must contain between 1 and 200 characters");
        }
        appId = value;
      } else if (argument === "--host") {
        host = value;
      } else if (argument === "--root") {
        projectRoot = resolve(value);
      } else {
        const parsedPort = Number.parseInt(value, 10);
        if (!Number.isInteger(parsedPort) || parsedPort < 0 || parsedPort > 65_535) {
          throw new Error(`Invalid port: ${value}`);
        }
        port = parsedPort;
      }
      continue;
    }
    if (argument.startsWith("-")) {
      throw new Error(`Unknown option: ${argument}\n\n${usage}`);
    }
    positionals.push(argument);
  }

  if (isMcp) {
    if (positionals.length > 0) {
      throw new Error(`The mcp command does not accept a target\n\n${usage}`);
    }
    return { command: "mcp", projectRoot };
  }

  const target = positionals[0];
  if (target === undefined || positionals.length !== 1) {
    throw new Error(`Provide exactly one URL, HTML file, or directory\n\n${usage}`);
  }
  return {
    ...(appId === undefined ? {} : { appId }),
    command: "serve",
    host,
    port,
    projectRoot,
    target,
  };
}

const invokedAsEntry = process.argv[1] !== undefined
  && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (invokedAsEntry) {
  void main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unexpected UI Review failure";
    process.stderr.write(`UI Review error: ${message}\n`);
    process.exitCode = 1;
  });
}

export { startReviewServer } from "./server/review-server.js";
