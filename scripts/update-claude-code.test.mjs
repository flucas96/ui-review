import assert from "node:assert/strict";
import test from "node:test";
import { updateClaudeInstallation } from "./update-claude-code.mjs";

test("updates source and reinstalls all Claude Code components in order", async () => {
  const calls = [];

  await updateClaudeInstallation(
    (command, args) => calls.push([command, args]),
    async () => ["--target", "/srv/claude-skills", "--skip-mcp"],
  );

  assert.deepEqual(calls, [
    ["git", ["pull", "--ff-only"]],
    ["npm", ["ci"]],
    ["npm", ["run", "install:claude", "--", "--target", "/srv/claude-skills", "--skip-mcp"]],
  ]);
});
