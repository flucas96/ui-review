---
name: review-feedback
description: Process visual UI Review annotations, discuss unclear feedback in its threads, implement scoped HTML or React changes, and return completed items for human review. Use when the user asks Codex to address, inspect, continue, or reply to UI Review feedback or visual annotations.
---

# Review Feedback

Use the `ui-review` MCP tools to process annotations captured in the browser.

## Workflow

1. Call `ui_review_list_annotations` for `open` and `in_progress` items. Skip entries whose claim owner is `another_session`. If the user names an annotation, load it with `ui_review_get_annotation` first.
2. Load each selected annotation and read the complete thread and target metadata before editing. Use its app identity, route, selector, DOM path, nearby text, accessibility context, computed styles, and bounds to locate the implementation.
3. Claim the annotation with `ui_review_claim_annotation` before editing or calling any mutating tool. If another session wins the claim, skip the item without editing it.
4. Set an accepted item to `in_progress`. If the outcome is ambiguous, claim it, reply with one concise question, release the claim, and keep it `open`.
5. Make the smallest cohesive change that satisfies the feedback and preserves unrelated behavior.
6. Run the project's normal checks. When the local review URL is available, inspect the affected route in a real browser.
7. Renew the claim before final updates. Reply with the change and verification summary, set the item to `review`, then release it with `ui_review_release_annotation`.

Never mark an item `resolved`; only the reviewer accepts the result. Never delete an annotation unless the user explicitly requests deletion.

When several items overlap, implement them together but reply to and update every affected thread. If an annotation references an unavailable app or route, explain that in the thread and leave it `open`.

Claims expire automatically. Release every owned claim when abandoning work or after an error; never release or take over another session's live claim.
