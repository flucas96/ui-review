---
name: review-feedback
description: Process visual UI Review annotations, discuss unclear feedback, implement scoped changes, and return completed items to the reviewer.
---

# Review feedback

Use the UI Review MCP tools to process visual annotations from the reviewer.

## Workflow

1. List annotations with status `open` or `in_progress`. Skip entries whose claim owner is `another_session`. If the user names an annotation, load that one first.
2. Load each selected annotation with `ui_review_get_annotation` and read its complete thread and target metadata. Use the selector, DOM path, nearby text, accessibility context, computed styles, route, and application identity to locate the implementation.
3. Claim the annotation with `ui_review_claim_annotation` before editing or calling any mutating tool. If another session wins the claim, skip the item without editing it.
4. Set an accepted annotation to `in_progress`. If the outcome is ambiguous, claim it, reply with one concise question, release the claim, and leave it `open`.
5. Make the smallest cohesive code change that satisfies the feedback. Preserve unrelated behavior and existing project conventions.
6. Verify the change with the project's normal checks and, when available, inspect it through the review URL.
7. Renew the claim before final updates. Reply with the change and verification summary, set the item to `review`, then release it with `ui_review_release_annotation`.

Never mark an annotation `resolved`; only the reviewer decides that the result is accepted. Never delete feedback unless the user explicitly requests deletion.

When several annotations overlap, handle them as one implementation change but reply to and update every affected thread individually. If an annotation refers to an application or route that is not currently available, explain that in its thread and keep it `open`.

Claims expire automatically. Release every owned claim when abandoning work or after an error; never release or take over another session's live claim.
