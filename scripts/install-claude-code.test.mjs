import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { installSkills, parseInstallerArguments } from "./install-claude-code.mjs";

test("parses safe installer options", () => {
  const options = parseInstallerArguments(["--target", "./temporary-skills", "--skip-cli", "--skip-mcp", "--dry-run"]);

  assert.equal(options.configureMcp, false);
  assert.equal(options.dryRun, true);
  assert.equal(options.installCli, false);
  assert.match(options.target, /temporary-skills$/);
});

test("copies every Claude Code skill", async () => {
  const target = await mkdtemp(join(tmpdir(), "ui-review-skills-"));
  try {
    await installSkills(target);
    const startSkill = await readFile(join(target, "start-ui-review", "SKILL.md"), "utf8");
    const stopSkill = await readFile(join(target, "stop-ui-review", "SKILL.md"), "utf8");
    const feedbackSkill = await readFile(join(target, "review-feedback", "SKILL.md"), "utf8");

    assert.match(startSkill, /name: start-ui-review/);
    assert.match(stopSkill, /name: stop-ui-review/);
    assert.match(feedbackSkill, /name: review-feedback/);
  } finally {
    await rm(target, { force: true, recursive: true });
  }
});
