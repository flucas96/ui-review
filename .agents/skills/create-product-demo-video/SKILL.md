---
name: create-product-demo-video
description: Create, revise, and visually review polished product-demo and social-media videos from real web apps, screenshots, or staged UI scenes. Use when Codex must storyboard, record, animate, encode, or improve an MP4/WebM product walkthrough, especially when natural cursor movement, click feedback, human-paced typing, blinking carets, camera moves, captions, marketing pacing, or multiple aspect-ratio cuts matter.
---

# Create Product Demo Video

Produce a coherent product story that feels operated by a person. Prefer recording the real
interface and adding only the presentation layer needed for clarity.

## Choose the cut

- Use 1920×1080 at 30 or 60 fps for a repository, landing page, or detailed workflow.
- Use 1080×1350 for a 4:5 social feed cut and 1080×1920 for a vertical story/reel.
- Default to 45–90 seconds for a full workflow and 8–15 seconds for a social teaser.
- Create separate edits for materially different durations; do not merely speed up the long cut.

## Build the story

Inspect the app, available assets, existing scripts, and brand treatment before authoring.
Write a short beat sheet containing hook, problem, action, visible result, and call to action.
Keep one meaningful action per beat. Let important states rest long enough to be read.

For a full workflow, show the human intent, the agent action, the reviewed result, and the
resolution. For a teaser, lead with the outcome and use only the minimum UI needed to prove it.

## Animate human interaction

Read [motion-language.md](references/motion-language.md) before implementing pointer, typing,
or camera animation. Use [human-motion.mjs](scripts/human-motion.mjs) to generate deterministic
pointer paths and typing timelines, then adapt its output to the recording harness.

Apply these requirements:

- Keep cursor position continuous within a scene. Never teleport it between visible actions.
- Move along a gently curved path with acceleration, deceleration, and a small final correction.
- Vary duration with distance and target size. Avoid one global cursor speed.
- Pause briefly after arriving, animate pointer-down plus a click ripple, then perform the click.
- Type character by character with varied delays and slightly longer pauses at spaces and
  punctuation.
- Render a blinking insertion caret whenever a text field is focused, including pauses before,
  during, and after typing.
- Avoid synthetic typing mistakes unless they support the story.
- Fade the pointer out during hard scene changes if continuous position cannot be preserved.

## Record and compose

Use the Playwright skill when browser automation is required. Record at the final target
resolution or higher. Prefer the real app, real layout, and real state transitions over a
recreated mockup. If staging is necessary, clearly preserve the product's visual identity.

Use restrained camera movement:

- Pan or zoom to direct attention, not merely to add motion.
- Animate one stable camera wrapper; do not transition several page children independently.
- Keep a fixed transform origin and continue from the currently rendered transform to prevent jumps.
- Ease into and out of zooms, hold on the destination, and give the return move its own easing.
- Avoid moving the camera, cursor, and major UI elements in competing directions at once.
- Keep text overlays within safe margins and readable without audio.
- Animate captions and progress indicators consistently with the product's visual language.

## Encode

Prefer H.264 MP4 with `yuv420p` and `faststart` for broad playback support. Preserve the
high-resolution master and derive smaller delivery cuts from it. Keep text crisp and avoid
excessive compression around UI edges.

## Review and iterate

Inspect the complete video, not only the first frame. Extract a contact sheet plus frames at
every click, transition, zoom endpoint, typed-text completion, and final CTA. Check:

- cursor travel feels intentional but imperfect;
- every click has visible feedback and lands on the target;
- pointer speed and typing cadence vary naturally;
- the caret blinks in focused text fields;
- zooms remain continuous at their start, focus hold, reversal, and endpoint;
- labels remain readable long enough;
- no cursor, tooltip, modal, or caption is clipped;
- transitions preserve spatial continuity;
- dimensions, duration, codec, and file size match the chosen cut.

Revise any rushed action before delivery. Provide the final video, poster frame, duration,
dimensions, and local or repository path. Update repository documentation only when requested.
