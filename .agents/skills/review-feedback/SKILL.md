---
name: review-feedback
description: Process visual UI Review annotations, discuss unclear feedback in its threads, implement scoped HTML or React changes, and return completed items for human review. Use when the user asks Codex to address, inspect, continue, or reply to UI Review feedback or visual annotations.
---

# Review Feedback

Use the `ui-review` MCP tools to process annotations captured in the browser.

## Workflow

1. Call `ui_review_list_annotations` for `open` and `in_progress` items. The list is intentionally compact. If the user names an annotation, load it with `ui_review_get_annotation` first.
2. Load every annotation selected for work with `ui_review_get_annotation` and read the complete thread and target metadata before editing. Use its app identity, route, selector, DOM path, nearby text, accessibility context, computed styles, and bounds to locate the implementation.
3. Set an accepted item to `in_progress` before changing code.
4. If the outcome is materially ambiguous or conflicts with another requirement, reply with one concise question and keep the item `open`.
5. Make the smallest cohesive change that satisfies the feedback and preserves unrelated behavior.
6. Run the project's normal checks. When the local review URL is available, inspect the affected route in a real browser.
7. Reply with a concise change and verification summary, then set the item to `review`.

Never mark an item `resolved`; only the reviewer accepts the result. Never delete an annotation unless the user explicitly requests deletion.

When several items overlap, implement them together but reply to and update every affected thread. If an annotation references an unavailable app or route, explain that in the thread and leave it `open`.
