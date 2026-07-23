---
name: stop-ui-review
description: Stop the UI Review proxy and any application server that the start-ui-review skill launched for the current project. Use when the user is finished reviewing, wants to close the visual review session, or asks to clean up its local processes.
---

# Stop UI Review

Stop only the processes owned by the current project's managed review session.

## Stop the session

- Resolve the project root and the session ID returned by `start-ui-review` in this conversation. Read only `.ui-review/sessions/<session-id>.json`.
- If the current conversation has no session ID, list valid records in `.ui-review/sessions/`. Use the sole active record when exactly one exists; when several exist, ask which session to stop and do nothing until it is selected.
- If no per-session record exists, report that no managed session was found. Never guess with broad `pkill`, `killall`, or port-based termination.
- Validate that the recorded project root matches the current project and that each numeric process ID still matches its recorded command before signaling it.
- Stop the review proxy first with `SIGTERM` and wait for it to exit.
- Stop the application server only when the session explicitly says it was started by `start-ui-review`. Leave reused or user-started development servers running.
- Signal the recorded process group when one was created so child processes do not remain. Use `SIGKILL` only after a bounded wait when a managed process ignores `SIGTERM`.
- Verify that managed processes exited, then remove only the selected session's JSON record and stale PID metadata. Preserve every other session record and log.

Preserve `.ui-review/events.jsonl`, annotation history, and log files. Report what stopped, what was intentionally left running, and that exported or deployed application files never contained the review overlay.
