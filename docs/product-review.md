# UI Review product review

Review date: 2026-07-16

## Scope

Three independent read-only reviewers inspected the static HTML fixture and the routed React fixture. Their specialties were visual design, UX and interaction, and technical accessibility and reliability. Reviews used real Chromium sessions at desktop, laptop, and constrained mobile sizes. The coordinator reproduced and merged the findings below before accepting changes.

The routed React fixture covers `/`, `/insights`, `/audience`, `/campaigns`, and `/settings`. The reviewed workflows included launcher and toolbar use, element and region targeting, composer behavior, comments list and detail, pins, keyboard navigation, route changes, reload persistence, HMR, MCP replies, console output, and network behavior.

## Prioritized findings

| Priority | Finding | Evidence | Decision |
| --- | --- | --- | --- |
| High | The feedback composer looks modal but has no dialog semantics, focus containment, or focus restoration. | Reproduced by UX and technical reviewers on HTML and React. | Accept: add dialog semantics, inert background, focus loop, and restoration. |
| High | The React fixture is desktop-only at 390 px, preventing meaningful mobile review. | Reproduced independently by visual and UX reviewers. | Accept: add responsive navigation and stacked page layouts. |
| High | Strict HTTP CSP can block the injected browser module, overlay styles, and review API connections. | Reproduced with restrictive script, style, and default source directives. | Accept: augment response CSP with a generated nonce for scripts and styles and allow same-origin API connections. Document meta-only CSP as a limitation. |
| Medium | Ordinary HTML anchors change the annotation identity, making same-page comments appear lost. | Reproduced independently by UX and technical reviewers with `/#work`. | Accept: ignore hashes by default and add explicit hash-routing configuration. |
| Medium | React route changes can show feedback from the previous route for roughly 400 ms. | Reproduced during `/` to `/insights` navigation. | Accept: observe History API, popstate, and hashchange immediately; clear stale state before refetch. |
| Medium | Mobile comment content can overflow horizontally. | Reproduced by visual reviewer at 390×844. | Accept: constrain flex children and panel overflow. |
| Medium | Mobile toolbar icons lose labels and discoverability. | Reproduced by visual reviewer at 390×844. | Accept: retain compact labels down to 360 px and expose stable accessible names. |
| Medium | Thread navigation loses focus; Back and Close are skipped after opening detail. | Reproduced by UX reviewer with keyboard navigation. | Accept: focus panel/detail entry points and restore focus on Back and Close. |
| Medium | Status, toggle state, focus rings, and toast feedback are not fully exposed to assistive technology. | Reproduced by technical reviewer. | Accept: add names, pressed/expanded state, focus-visible styles, and live-region semantics. |
| Medium | Hidden or zero-area element targets can create a misleading pin at the top-left corner. | Reproduced by hiding an annotated element. | Accept: hide unresolved element pins while keeping their threads accessible from Comments. |
| Medium | The selection hint can cover target-page navigation. | Reproduced on the HTML fixture. | Accept: dock the hint above the review toolbar. |
| Medium | Pins can visually collide with annotated controls. | Reproduced on the React Create report action. | Accept: offset pins outside element bounds. |
| Low | Thread status and destructive actions are too small and low contrast on touch screens. | Reproduced independently by visual and UX reviewers. | Accept: increase type, contrast, padding, and minimum touch size. |
| Product request | Resolving one annotation requires opening detail and changing a dropdown; clearing several items is repetitive. | Added by the reviewer during implementation. | Accept: add one-click Resolve/Reopen actions plus Select active and Resolve selected in the overview. Keep permanent deletion confirmed. |

## Strengths to preserve

- Shadow DOM isolation and the maximum host stacking context prevent target styles from leaking into the review interface.
- The idle launcher is unobtrusive, and the expanded desktop toolbar has a coherent charcoal-and-lavender visual language.
- Element highlights and region drafts clearly communicate the selected target.
- The desktop composer has strong visual hierarchy and concise guidance.
- Comments, replies, statuses, persistence, route isolation, HMR, and MCP live updates work without target-app changes.
- User and agent text is rendered through text nodes, API input is size-limited and validated, and the event stream cleans up server resources on disconnect.
- Reduced-motion styles already cover the primary animated overlay elements.

## Deferred after review

- Meta-tag-only CSP rewriting remains deferred. HTTP response CSP is the supported strict-CSP path.
- Region targets remain coordinate-based rather than image-anchored; large responsive layout changes can move their visual meaning.
- Multiple simultaneous human reviewers and cloud synchronization remain outside the local-first MVP.

## Regression outcome

The three specialist reviewers repeated their focused checks after implementation. Visual, responsive, keyboard, route, hash-anchor, lifecycle, and stale-target checks passed without new findings. A final strict-CSP run used `default-src 'none'`, restrictive script and style directives, and Chromium: the styled toolbar and empty comment state loaded with no console errors, proving that the module, Shadow DOM stylesheet, and same-origin review API connection all remained available.

Workspace checks passed across TypeScript, 13 unit tests in 5 files, all production builds, the package dry run, and the production dependency audit.
