# UI Review implementation plan

## Goal

Build a local-first visual review layer for static HTML and framework-based web applications. A reviewer opens the proxied application in the VS Code integrated browser, targets DOM elements or free-form regions, and discusses each annotation with a coding agent. The reviewed application remains unchanged.

The tool targets one local reviewer and supports multiple coordinated Claude Code or Codex sessions. Its data model and transport leave room for multiple human reviewers later.

## Evaluated approaches

### Application component

Add a React component or script to every reviewed application.

Advantages:

- Direct access to the application DOM and framework metadata.
- Straightforward hot-module replacement behavior.
- No response rewriting.

Disadvantages:

- Changes every application under review.
- Framework-specific setup is unavoidable for richer integrations.
- Static HTML and unfamiliar stacks require separate adapters.
- Review code can accidentally ship with the application.

### Browser extension

Inject the review layer from Chromium.

Advantages:

- Works on almost any page without changing its source.
- Browser and reviewed application remain cleanly separated.
- Can inspect pages that are not controlled by the reviewer.

Disadvantages:

- Browser extensions are blocked in the target environment.
- Enterprise distribution and permissions add operational work.
- A local browser still needs a bridge to Claude Code on the remote host.

### Reverse proxy

Run a local development proxy in front of the application and inject one isolated browser bundle into HTML responses.

Advantages:

- Framework-independent and requires no project changes.
- Runs on the same remote machine as Claude Code and the annotation store.
- Works in the VS Code integrated browser without a browser extension.
- Can forward HTTP, assets, API calls, and development WebSockets.

Disadvantages:

- HTML responses must be rewritten.
- Content Security Policy can prevent injection in unusually strict development apps.
- WebSocket and streaming behavior require deliberate proxy handling.

Recommendation: use the reverse proxy. It is the only approach that satisfies the current installation constraints while remaining framework-independent.

## Agent integration options

### Skill with a feedback file

The skill reads a Markdown or JSON file when `/review-feedback` is invoked.

- Simple and robust.
- Cannot answer annotation threads without additional write conventions.
- Tool input and lifecycle are weakly structured.

### MCP server with a skill

The MCP server exposes typed annotation, reply, and status tools. The skill defines how Claude processes them.

- Supports structured two-way communication.
- Keeps the integration generic for Claude Code, Codex, and other MCP clients.
- Allows the overlay to show agent replies immediately.
- Requires one local MCP process.

### Claude Code channel

A channel pushes every new annotation into an active Claude Code session.

- Gives the closest experience to an always-on chat.
- Custom channels currently require research-preview configuration.
- Enterprise environments can disable the capability.

Recommendation: ship MCP plus `/review-feedback` first and keep the event interface channel-compatible. An optional watch command can be added without changing the browser protocol. Channels should remain an experimental adapter until the capability is stable.

## Package structure

```text
apps/
  html-fixture/       Static HTML/CSS/TypeScript reference page
  react-fixture/      React and Vite reference application
packages/
  ui-review/          Public CLI, proxy, overlay, storage, API, and MCP server
.claude/
  skills/
    start-ui-review/   Safe local launch workflow
    review-feedback/  Agent workflow
    stop-ui-review/    Managed process cleanup
    update-ui-review/  Safe installation update workflow
```

A single publishable `ui-review` package keeps installation and versioning simple. Source folders inside the package separate browser, server, MCP, and shared protocol code without creating unnecessary workspace packages.

## Runtime architecture

```text
Reviewed app or static files
          ↑ HTTP and WebSocket
UI Review proxy and API
          ↓ injected module
VS Code integrated browser
          ↕ annotation REST API and SSE
Append-only local event store
          ↕ typed MCP tools
Claude Code lifecycle and feedback skills
```

The proxy listens on `127.0.0.1` by default. VS Code Remote SSH exposes it through the existing authenticated connection. No public listener or cloud service is required.

## Data model

An annotation contains:

- Stable identifier, application identity, page URL, page title, timestamps, and status.
- An element target with selector, DOM path, text, accessibility data, bounding box, and selected computed styles.
- Or a region target with document-relative coordinates and viewport metadata.
- A chronological thread of human and agent messages.

Statuses are `open`, `in_progress`, `review`, and `resolved`.

State is stored as append-only JSON Lines events under `.ui-review/events.jsonl`. Creation, message, status, and deletion events are folded into the current view. Cross-process file locking serializes reads and appends. Short-lived claim files provide atomic per-annotation leases without changing the durable event format.

Compared with one mutable JSON document, an event log avoids lost updates when the proxy and MCP server append concurrently. Compared with SQLite, it avoids a native dependency and remains easy to inspect, copy, and version during the MVP. A database adapter can replace it later without changing the API.

## Proxy behavior

- Accept an HTTP target such as `http://127.0.0.1:5173` or a local file/directory.
- Derive a stable application identity from the target or accept an explicit `--app` name so equal routes in different apps never share feedback.
- Ignore ordinary document fragments by default and accept `--include-hash` for hash-routed applications.
- Reserve `/__ui_review/*` for the browser bundle, API, health endpoint, and event stream.
- Forward request methods, bodies, response codes, headers, redirects, and non-HTML response streams.
- Request identity-encoded upstream documents and inject a same-origin module before `</body>`.
- Add a per-response nonce to strict HTTP Content Security Policy headers and the injected module.
- Forward WebSocket upgrades unchanged so Vite and similar HMR systems continue working.
- Serve directory indexes and SPA fallbacks in static mode.
- Bind to loopback unless the user explicitly chooses another host.

## Overlay behavior

- Render inside a Shadow DOM so application styles cannot leak in either direction.
- Keep the idle state to one small launcher.
- Offer element selection, free-region drawing, and a comments panel.
- Freeze only application clicks while selecting; regular browsing remains available outside selection mode.
- Recalculate element pins on scrolling and resizing.
- Use DOM text nodes for all user and agent content instead of HTML injection.
- Stream external changes over server-sent events and refetch the current page annotations.
- Observe History API, popstate, and hashchange navigation immediately so stale feedback never crosses routes.
- Archive resolved items from pins and the active overview while keeping them recoverable through Show resolved.
- Use a compact, polished visual system inspired by Linear and Raycast, with strong contrast, restrained motion, and responsive placement.

## MCP surface

The server exposes:

- `ui_review_list_annotations`
- `ui_review_get_annotation`
- `ui_review_claim_annotation`
- `ui_review_release_annotation`
- `ui_review_set_status`
- `ui_review_reply`
- `ui_review_delete_annotation`

`/review-feedback` instructs Claude to inspect open feedback, atomically claim selected items, make scoped code changes, reply when clarification is required, verify the application, move completed items to `review`, and release their leases. Claude must not mark an item `resolved`; that decision belongs to the reviewer.

`/start-ui-review` detects static HTML or a framework development server, allocates an operating-system-selected port, and records owned processes under a unique review session ID. `/stop-ui-review` terminates only the explicitly selected session and preserves every other session plus the event log. A personal installer synchronizes the start, feedback, stop, and update skills, installs a packed CLI, and configures a user-scoped Claude MCP server that resolves each active project through `CLAUDE_PROJECT_DIR`. `/update-ui-review` uses the recorded source checkout to fast-forward and reinstall every component without discarding local changes.

## Verification strategy

- Strict TypeScript checking across fixtures and product code.
- Unit tests for event folding, concurrent event writes, atomic annotation claims, selector generation helpers, HTML injection, API validation, and personal skill installation.
- Production builds for both fixtures and the publishable package.
- Browser walkthrough against both HTTP targets.
- Element annotation, region annotation, reply, status, persistence, reload, and deletion flows.
- React interaction and Vite HMR through the proxy.
- Visual inspection at desktop and constrained viewport sizes.
- Console and network inspection with no unexpected errors.

## Delivery phases

### Reference applications

Create and verify the static and React fixtures independently of the product.

### Local review runtime

Implement the protocol, event store, static server, HTTP proxy, WebSocket forwarding, API, and SSE stream.

### Review experience

Implement the isolated overlay, selection modes, pins, composer, thread panel, and status presentation.

### Agent bridge

Implement MCP tools, project and user-scoped configuration, Claude Code lifecycle and feedback skills, and their installer.

### Product review

Exercise the complete workflow against both fixtures, inspect screenshots and runtime behavior, simplify the implementation, and iterate on any usability or reliability issues.

## Deferred scope

- Authentication and shared external deployments.
- Multiple simultaneous human reviewers.
- Screenshot attachments stored with every annotation.
- Framework-specific source-file mapping.
- Production-site injection and strict CSP rewriting.
- General-availability Claude Code channels.
