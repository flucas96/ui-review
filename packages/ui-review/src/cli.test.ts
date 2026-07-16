import { describe, expect, it } from "vitest";
import { parseArguments } from "./cli.js";

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
});
