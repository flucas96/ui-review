#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runMcpServer } from "./mcp/server.js";
import { defaultFeedbackRootRegistry } from "./server/feedback-roots.js";
import { startReviewServer } from "./server/review-server.js";
import { uiReviewVersion } from "./shared/version.js";

type ServeArguments = {
  readonly appId?: string;
  readonly basePath: string;
  readonly command: "serve";
  readonly host: string;
  readonly includeHash: boolean;
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
  ui-review <url-or-path> [--app <name>] [--include-hash] [--port 4317] [--host 127.0.0.1] [--root <path>] [--base-path <prefix>]
  ui-review mcp [--root <path>]

Examples:
  ui-review http://127.0.0.1:5173
  ui-review ./dist/index.html --app marketing-site --port 4317
  ui-review http://127.0.0.1:5173 --base-path /codeeditor/default/ports/4317
  ui-review mcp --root .

--base-path prefixes the injected overlay's asset and API URLs so UI Review works when it is
reached through a reverse proxy that serves it under a sub-path (e.g. SageMaker code-editor's
/ports/<port>/ forward). Leave it unset for direct 127.0.0.1:<port> access.
`.trim();

/** Run the UI Review command-line interface. */
export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(`${usage}\n`);
    return;
  }
  if (argv.includes("--version") || argv.includes("-v")) {
    process.stdout.write(`${uiReviewVersion}\n`);
    return;
  }

  const parsed = parseArguments(argv);
  if (parsed.command === "mcp") {
    await runMcpServer(parsed.projectRoot);
    return;
  }

  const runningServer = await startReviewServer({
    ...(parsed.appId === undefined ? {} : { appId: parsed.appId }),
    basePath: parsed.basePath,
    feedbackRootRegistry: defaultFeedbackRootRegistry(),
    host: parsed.host,
    includeHash: parsed.includeHash,
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
  let includeHash = false;
  let port = 4317;
  let projectRoot = defaultProjectRoot();
  let appId: string | undefined;
  let basePath = "";
  const positionals: string[] = [];

  for (let index = 0; index < values.length; index += 1) {
    const argument = values[index];
    if (argument === undefined) {
      continue;
    }
    if (argument === "--include-hash") {
      includeHash = true;
      continue;
    }
    if (
      argument === "--app" ||
      argument === "--host" ||
      argument === "--port" ||
      argument === "--root" ||
      argument === "--base-path"
    ) {
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
      } else if (argument === "--base-path") {
        basePath = normalizeBasePath(value);
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
    basePath,
    command: "serve",
    host,
    includeHash,
    port,
    projectRoot,
    target,
  };
}

/** Normalize a base-path prefix to a leading slash and no trailing slash ("" when empty/root).
 *
 * Accepts the value with or without a leading slash and tolerates a trailing one, so
 * "/codeeditor/default/ports/4317", "codeeditor/.../4317/" and "/" all normalize predictably. */
export function normalizeBasePath(value: string): string {
  const trimmed = value.trim();
  if (trimmed === "" || trimmed === "/") {
    return "";
  }
  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLeadingSlash.replace(/\/+$/, "");
}

/** Resolve the project root supplied by Claude Code or the current shell. */
export function defaultProjectRoot(
  environment: Readonly<Record<string, string | undefined>> = process.env,
  currentDirectory = process.cwd(),
): string {
  return resolve(environment.CLAUDE_PROJECT_DIR ?? currentDirectory);
}

/** Check whether Node invoked this module directly, including through an npm bin symlink. */
export function isEntryPoint(candidate: string | undefined, modulePath = fileURLToPath(import.meta.url)): boolean {
  if (candidate === undefined) {
    return false;
  }
  try {
    return realpathSync(candidate) === realpathSync(modulePath);
  } catch {
    return false;
  }
}

const invokedAsEntry = isEntryPoint(process.argv[1]);

if (invokedAsEntry) {
  void main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unexpected UI Review failure";
    process.stderr.write(`UI Review error: ${message}\n`);
    process.exitCode = 1;
  });
}

export { startReviewServer } from "./server/review-server.js";
