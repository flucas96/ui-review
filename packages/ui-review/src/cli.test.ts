import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { defaultProjectRoot, isEntryPoint, parseArguments } from "./cli.js";

describe("parseArguments", () => {
  it("parses a named application and review server options", () => {
    expect(parseArguments([
      "http://127.0.0.1:5173",
      "--app",
      "dashboard",
      "--include-hash",
      "--port",
      "0",
      "--host",
      "localhost",
    ])).toMatchObject({
      appId: "dashboard",
      command: "serve",
      host: "localhost",
      includeHash: true,
      port: 0,
      target: "http://127.0.0.1:5173",
    });
  });

  it("parses the MCP command independently from serve options", () => {
    expect(parseArguments(["mcp", "--root", "."])).toMatchObject({ command: "mcp" });
  });

  it("rejects invalid ports and unknown options", () => {
    expect(() => parseArguments(["./dist", "--port", "70000"])).toThrow("Invalid port");
    expect(() => parseArguments(["./dist", "--unknown"])).toThrow("Unknown option");
  });

  it("uses the Claude project directory for a user-scoped MCP server", () => {
    expect(defaultProjectRoot({ CLAUDE_PROJECT_DIR: "/tmp/product-ui" }, "/tmp/fallback")).toBe("/tmp/product-ui");
    expect(defaultProjectRoot({}, "/tmp/fallback")).toBe("/tmp/fallback");
  });

  it("recognizes an npm bin symlink as the CLI entry point", () => {
    const directory = mkdtempSync(join(tmpdir(), "ui-review-cli-"));
    const modulePath = join(directory, "cli.js");
    const binPath = join(directory, "ui-review");
    try {
      writeFileSync(modulePath, "");
      symlinkSync(modulePath, binPath);

      expect(isEntryPoint(binPath, modulePath)).toBe(true);
      expect(isEntryPoint(undefined, modulePath)).toBe(false);
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  });
});
