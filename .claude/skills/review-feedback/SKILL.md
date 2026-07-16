---
name: review-feedback
description: Process visual UI Review annotations, discuss unclear feedback, implement scoped changes, and return completed items to the reviewer.
---

# Review feedback

Use the UI Review MCP tools to process visual annotations from the reviewer.

## Workflow

1. List annotations with status `open` or `in_progress`. If the user names an annotation, load that one first.
2. Read the complete thread and target metadata before changing code. Use the selector, DOM path, nearby text, accessibility context, computed styles, route, and application identity to locate the relevant implementation.
3. Set an accepted annotation to `in_progress` before editing.
4. If the requested outcome is ambiguous or conflicts with another requirement, reply in the annotation thread with one concise question and leave it `open`. Do not guess at a materially different design.
5. Make the smallest cohesive code change that satisfies the feedback. Preserve unrelated behavior and existing project conventions.
6. Verify the change with the project's normal checks and, when available, inspect it through the review URL.
7. Reply in the thread with a concise summary of what changed and how it was verified. Set the annotation to `review`.

Never mark an annotation `resolved`; only the reviewer decides that the result is accepted. Never delete feedback unless the user explicitly requests deletion.

When several annotations overlap, handle them as one implementation change but reply to and update every affected thread individually. If an annotation refers to an application or route that is not currently available, explain that in its thread and keep it `open`.
