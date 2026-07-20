---
name: update-ui-review
description: Update an existing UI Review installation from its GitHub checkout and refresh its CLI, Claude Code skills, and MCP configuration.
---

# Update UI Review

Update UI Review without discarding local work.

## Locate the installation

- Read `~/.ui-review/installation.json` and use its `sourceRoot` as the UI Review checkout.
- Validate that the directory exists and contains the UI Review `package.json` plus `scripts/update-claude-code.mjs`.
- If the state file or checkout is missing, stop and provide the repository's documented installation commands. Do not search unrelated directories or clone over an existing path.

## Apply the update

- Run `npm run update:claude` in the recorded source checkout.
- The updater must use a fast-forward-only Git pull. Never stash, reset, overwrite, or discard local changes to make an update succeed.
- If Git reports local changes or a divergent branch, show the affected checkout and explain that the user must preserve or commit those changes before retrying.
- After success, run `ui-review --version` and `claude mcp get ui-review`.

## Hand off

Report the installed version and MCP status. Tell the user to restart the active Claude Code session so updated skill instructions and MCP tool schemas are loaded. Existing `.ui-review/events.jsonl` files are project data and remain untouched.
