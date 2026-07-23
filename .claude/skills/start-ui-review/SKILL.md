---
name: start-ui-review
description: Start the current plain HTML, built frontend, or framework development app behind the local UI Review proxy. Use when the user asks to launch, host, preview, annotate, or visually review a web interface with UI Review.
---

# Start UI Review

Launch the current project for visual annotation without adding review code to the application.

## Discover the target

- Resolve the project root from Git, falling back to the current directory.
- Inspect package manifests, lockfiles, existing processes, build output, and HTML entry points before choosing commands.
- Reuse a healthy development server that already belongs to this project.
- For a plain HTML file or static output directory, pass that path directly to `ui-review`; do not start a separate web server.
- For React or another framework, use the project's existing development command and its actual loopback URL. Respect the detected package manager.
- Derive a stable, short app identity from the package name or repository directory.
- Add `--include-hash` only when the application uses the URL hash as its router.

## Launch safely

- Prefer `ui-review` from `PATH`. In the UI Review source repository, fall back to `node packages/ui-review/dist/cli.js` after building the package.
- If neither command is available, stop and give the exact installation command; do not substitute an unrelated package.
- Bind application and review servers to `127.0.0.1`. Never expose them publicly unless the user explicitly requests that change.
- Generate a cryptographically random review session UUID and start the proxy with `--port 0` so the operating system allocates a collision-free port.
- Keep long-running commands in separate background tasks or process groups. Write output to `.ui-review/sessions/<session-id>.app.log` and `.ui-review/sessions/<session-id>.review.log`.
- Record `.ui-review/sessions/<session-id>.json` atomically after startup with the session ID, project root, app identity, target URL or path, review URL, commands, process IDs, process groups, start time, and whether the app server was started by this invocation. Never overwrite another session record or `.ui-review/events.jsonl`.
- Start a distinct session for this invocation. Attach to an existing session only when the user explicitly requests reuse, and never claim ownership of processes started by another session.
- Wait until the target and review URL respond successfully before reporting completion. If startup fails, inspect the logs, stop only processes started during this invocation, and report the concrete error.

## Hand off

Return the session ID, target URL, review URL, app identity, log paths, and whether the app server was reused or started. Keep the session ID available in the conversation. Tell the user to annotate in the review URL, invoke `/review-feedback` for implementation, and invoke `/stop-ui-review` when finished.

Do not modify application source, inject a permanent script, install a browser extension, delete annotations, or start unrequested extra sessions.
