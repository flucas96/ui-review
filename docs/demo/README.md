# UI Review video library

Use these videos directly from GitHub or download the MP4 files for presentations, documentation, and social posts.

| Video | Format | Length | Best for |
| --- | --- | ---: | --- |
| [Social teaser](./ui-review-social-teaser.mp4) | 1080 × 1350 · 4:5 | 12.5 sec | LinkedIn, Instagram, and X feeds |
| [Product tour](./ui-review-demo.mp4) | 1920 × 1080 · 16:9 | 1 min 3 sec | README, landing pages, and quick demos |
| [Full human–agent workflow](./ui-review-full-workflow.mp4) | 1920 × 1080 · 16:9 | 1 min 36 sec | Onboarding, presentations, and detailed walkthroughs |

## Social teaser

[![Watch the UI Review social teaser](../images/ui-review-social-teaser-poster.jpg)](./ui-review-social-teaser.mp4)

## Product tour

[![Watch the UI Review product tour](../images/ui-review-demo-poster.jpg)](./ui-review-demo.mp4)

## Full workflow

[![Watch the complete human and coding-agent workflow](../images/ui-review-full-workflow-poster.jpg)](./ui-review-full-workflow.mp4)

## Regenerate the library

Install the workspace dependencies and run:

```bash
npm run build
npm run demo:render
```

The renderer records the real UI Review flow, encodes all three H.264 MP4 files, refreshes
their poster images, and writes QA contact sheets to `output/playwright/review-frames/`.
It uses the installed Chrome channel by default. Set `CHROME_EXECUTABLE` when Chrome or
Chromium lives at a non-standard path.
