# UI Review

UI Review adds a polished visual feedback layer to any local web app without changing that app. Open the review URL in VS Code, select a DOM element or draw a free-form area, and discuss the note with Claude Code in the same thread.

It is designed for remote development over SSH: the proxy, feedback store, and coding agent all run on the Linux host, while the interface opens through VS Code's integrated Chromium browser. No Edge extension is required.

## What works

- React, Vite, and other development servers through an HTTP and WebSocket proxy
- Built HTML sites, individual HTML files, and static directories
- Element selection with selector, DOM path, text, accessibility, layout, and style context
- Free-form rectangular area feedback
- Threaded reviewer and agent replies with live updates
- One-click Resolve/Reopen actions and bulk resolution from the comments overview; resolved items are archived behind Show resolved
- `open`, `in_progress`, `review`, and `resolved` states
- Local append-only storage in `.ui-review/events.jsonl`
- A generic MCP server plus a Claude Code `/review-feedback` skill
- Multiple reviewed apps in one repository without comment collisions
- React Router, hash routing, and separate feedback per application route

## Try the included fixtures

Requirements: Node.js 20 or newer and npm.

```bash
npm install
npm run build
```

Start the React fixture in one terminal:

```bash
npm run dev:react
```

Start UI Review in a second terminal:

```bash
node packages/ui-review/dist/cli.js http://127.0.0.1:5173 --app react-fixture
```

Open `http://127.0.0.1:4317` with **Browser: Open Integrated Browser** in VS Code. With Remote SSH, accept VS Code's port-forwarding prompt if it appears.

The small violet button opens the toolbar. Choose **Element** to target a rendered element or **Area** to draw anywhere on the page. Submit a comment, then run `/review-feedback` in Claude Code. Agent replies and status changes appear in the open thread without a reload.

## Use it with an existing app

For React or another framework, keep the normal development server running and pass its URL:

```bash
npx ui-review http://127.0.0.1:3000 --app product-ui
```

UI Review forwards normal requests and development WebSockets, so Vite-style hot reload continues to work through the review URL.

React applications can contain any number of pages. UI Review separates annotations by `pathname` and query string and notices client-side route changes automatically. Comments on `/dashboard`, `/settings`, and `/users/42` therefore remain independent. Hash routers are supported with `--include-hash`. Direct route reloads work whenever the underlying development server or static SPA fallback serves that route.

For a built site or plain HTML file, pass a directory or file instead:

```bash
npx ui-review ./dist --app marketing-site
npx ui-review ./prototype.html --app prototype
```

The `--app` value keeps annotations separate when several apps use the same route. If omitted, UI Review derives a stable identity from the target URL or absolute path.

Ordinary document anchors such as `#pricing` stay attached to the current page by default. For applications that use the URL hash as an actual router, add `--include-hash` to keep each hash route independent.

Useful options:

```text
--port <number>   Review port, default 4317
--host <address>  Bind address, default 127.0.0.1
--root <path>     Project root for .ui-review data, default current directory
--app <name>      Stable application identity
--include-hash    Treat URL hash changes as separate routes
```

Keep the default loopback host for SSH development. VS Code forwards the port through the authenticated SSH connection, so the review server does not need to be exposed publicly.

## Connect Claude Code

This repository includes [.mcp.json](./.mcp.json) and project skills for [starting UI Review](./.claude/skills/start-ui-review/SKILL.md), [processing feedback](./.claude/skills/review-feedback/SKILL.md), and [stopping the session](./.claude/skills/stop-ui-review/SKILL.md). After building the package, approve the project MCP server when Claude Code prompts for trust, then invoke:

```text
/review-feedback
```

The MCP server gives any compatible coding agent five typed tools:

- `ui_review_list_annotations`
- `ui_review_get_annotation`
- `ui_review_set_status`
- `ui_review_reply`
- `ui_review_delete_annotation`

The skill tells Claude to acknowledge an item, make a scoped change, verify it, reply in the thread, and move it to **Ready for review**. Only the human reviewer marks it **Resolved**.

### Install the complete personal workflow

Install the CLI, synchronize the three skills to `~/.claude/skills`, and configure a user-scoped MCP server with one command:

```bash
npm ci
npm run install:claude
```

The installer packs the current `ui-review` package before installing it globally, so the command does not depend on this repository remaining in the same location. Claude Code supplies its current project through `CLAUDE_PROJECT_DIR`, allowing the user-scoped MCP server to read the correct local annotation store in every project.

The resulting workflow is:

```text
/start-ui-review   Detect and launch HTML or a framework app behind UI Review
/review-feedback   Implement open annotations and reply in their threads
/stop-ui-review    Stop only the processes managed for the review session
```

The start skill keeps review code out of the target application, binds to loopback, reuses healthy development servers, and records managed session metadata under `.ui-review/`. The stop skill preserves annotations and never terminates a development server that it did not start.

Useful installer options:

```text
--dry-run         Show planned changes
--target <path>   Install skills somewhere other than ~/.claude/skills
--skip-cli        Synchronize skills without installing the global CLI
--skip-mcp        Leave Claude Code's user MCP configuration unchanged
```

Claude Code detects edits to an existing personal skills directory immediately. Restart it only when `~/.claude/skills` was created for the first time.

For a team-shared project setup without the personal installer, copy the desired skills into that project's `.claude/skills/` directory and commit this `.mcp.json` equivalent:

```json
{
  "mcpServers": {
    "ui-review": {
      "type": "stdio",
      "command": "ui-review",
      "args": ["mcp"]
    }
  }
}
```

## Connect Codex

This repository includes the project MCP configuration at [.codex/config.toml](./.codex/config.toml) and the reusable skill at [.agents/skills/review-feedback/SKILL.md](./.agents/skills/review-feedback/SKILL.md).

Build the package, open the repository as a trusted Codex project, and restart Codex once after cloning:

```bash
npm ci
npm run build --workspace ui-review
```

In Codex, run `/mcp` and verify that `ui-review` is connected. Process feedback by mentioning `$review-feedback` or asking Codex to address the open UI Review comments. Codex can also select the skill automatically when the request clearly refers to visual annotations.

The Codex app, CLI, and IDE extension share the project MCP configuration on the same host. Cloud tasks cannot read the local `.ui-review/events.jsonl`; use a local Codex task for the current MVP.

## Architecture

```mermaid
flowchart LR
  A["React dev server or HTML files"] -->|"HTTP + WebSocket"| P["UI Review proxy"]
  P -->|"Injected Shadow DOM overlay"| B["VS Code integrated browser"]
  B <-->|"REST + live events"| S["Local event log"]
  C["Claude Code or another MCP client"] <-->|"MCP tools"| S
```

The reverse proxy keeps review code out of the target application and makes the browser client same-origin. All reviewer and agent text is rendered with DOM text nodes, never inserted as HTML.

When an upstream development server sends a strict HTTP Content Security Policy, the proxy generates a per-response nonce for the injected module and isolated overlay styles and permits same-origin review API connections. CSP declared only through an HTML `<meta>` tag is not rewritten in the current release.

## Development

```bash
npm run check
npm test
npm run build
```

The product code uses strict TypeScript. Browser flows are tested against both fixtures with a real Chromium session.

The detailed trade-offs and delivery plan live in [docs/implementation-plan.md](./docs/implementation-plan.md).

## Current scope

The first release is local-first and intended for one reviewer plus one coding-agent session. Authentication, shared cloud deployments, simultaneous reviewers, screenshot attachments, and framework-specific source maps are deliberately deferred.

## License

MIT
