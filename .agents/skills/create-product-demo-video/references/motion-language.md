# Motion language

Use motion to communicate attention and causality. Small imperfections should suggest intent,
not carelessness.

## Pointer movement

Model each move as approach, settle, action, and release:

- Start after a 80–220 ms reaction pause.
- Follow a cubic curve whose control points sit slightly off the direct line.
- Let long moves arc more than short moves, but cap the lateral offset.
- Accelerate through the middle and decelerate near the target.
- Overshoot by roughly 2–7 px on medium or long moves, then correct.
- Target a believable interior point rather than the exact geometric center every time.
- Use roughly 450–1,600 ms, influenced by distance and target size.
- Hold 90–220 ms before pointer-down and 140–350 ms after click.

Do not add random jitter to every frame. Real mouse paths are smooth, with low-frequency
variation and occasional correction.

## Click feedback

Combine three cues:

- shrink or tilt the pointer by a small amount for 70–110 ms;
- emit a 320–500 ms ripple from the pointer hotspot;
- let the UI's real pressed/focus state remain visible.

The ripple should begin at pointer-down, not after the resulting UI transition.

## Typing

Generate per-character delays rather than using a fixed interval:

- letters and digits: usually 45–115 ms;
- spaces: usually 70–150 ms;
- punctuation: usually 130–280 ms;
- line breaks or command submission: 220–500 ms;
- occasional thought pause: 180–450 ms, at natural word boundaries.

Use a deterministic seed so a good take can be reproduced. Keep the focused insertion caret
visible with a 500–700 ms blink cycle. Pause with the caret blinking for 300–900 ms before
submission so the viewer registers the completed text.

## Camera and scene rhythm

- Prefer a 3–8% zoom for UI emphasis; reserve larger moves for scene changes.
- Put the app inside one stable camera wrapper and animate only that wrapper.
- Keep `transform-origin` fixed. Compute translation and scale together instead of changing the
  origin to follow the focus point.
- Start from the wrapper's currently rendered transform, including after an interrupted move.
- Use a minimum-jerk curve or a soft `cubic-bezier(.22,.72,.22,1)` over 600–1,200 ms.
- Hold 500–1,200 ms at the focus point. Run zoom-out as a new eased move instead of reversing
  an unfinished transition.
- Avoid scale discontinuities between adjacent keyframes. At 30 fps, no single-frame scale
  change should read as a snap.
- Dissolve or mask pointer continuity when switching windows.
- Let a full-workflow action breathe; use faster cuts only when comprehension is already secure.

Use `planCameraMotion` from `scripts/human-motion.mjs` to obtain sampled minimum-jerk
keyframes. Apply them with linear interpolation; the samples already contain the easing curve.

## Social cuts

Make the opening readable in the first second. Favor three to five beats, large text, strong
contrast, and one proof moment. Preserve human pointer timing even when the surrounding edit is
fast; remove actions instead of making every action unnaturally quick.
