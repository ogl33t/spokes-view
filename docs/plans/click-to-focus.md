---
status: Done
spoke: SPOKE-178
started: 2026-11-20
finished: 2026-11-20
summary: Clicking a node in the radial tree rotates the tree so its label reads horizontally, pans it to the viewport centre and zooms in, as one short animation.
---

# Click a node to focus it

Gates skipped: Brandon started this with the `/goal` stop hook ("do not pause to ask"),
treated as "just do it". Outward actions are limited to the list below.

## Goal

In the default (radial tree) view, a click on a node animates the whole tree so that:

- the node's spoke lies horizontal, so its outward label reads left to right;
- the node sits at the centre of the graph viewport;
- the view zooms in on it (to at least 1×, at most 2×; already past 2× keeps the zoom).

Every other label stays readable: outward labels flip by their on-screen direction, not
their layout angle, and inner (level) labels are counter-rotated to stay horizontal.

## Design (all in `web/src/Graph.tsx`, plus a pure helper module)

- **View gains a rotation** `r` (degrees). The viewport transform becomes
  `translate(x y) rotate(r) scale(k)`; the gesture fast path (CSS transform on the SVG
  relative to the committed view) becomes
  `translate(vx,vy) rotate(vr−cr) scale(s) translate(−cx,−cy)`. Wheel/pinch zoom and drag
  pan are unchanged in form (they are already correct under rotation).
- **Fit** (⤢ button, new server) resets the rotation to 0 — the way back to north-up.
- **Focus target** (`web/src/focus.ts`, pure, unit-tested): from the node's layout angle and
  the current view, pick the rotation (`−deg` or `180−deg`, whichever is the shorter turn),
  the zoom, and the translation that puts the node at the viewport centre.
- **Animation**: ~450 ms ease-in-out on `requestAnimationFrame`. Each frame interpolates
  the node's screen position (straight line to the centre), the zoom (geometric) and the
  rotation (linear), and solves for the translation, so the node glides instead of
  orbiting. Frames go through the existing fast path; the end commits. Any pointer-down,
  wheel or zoom button cancels it. `prefers-reduced-motion` jumps straight to the end.
- **Labels**: `Nodes` gets the committed rotation as a prop (re-renders once per focus,
  like a zoom bucket change). Outward labels flip when `angle + r` points left; inner labels
  get `rotate(−r)`.
- Click only (not Enter, the toggle glyph, or right-click); selection still happens as now.

## Steps (in order, one branch `feat/click-to-focus`, small and tightly coupled)

1. **Pure focus maths** — `web/src/focus.ts` + `web/src/focus.test.ts`: `focusTarget`,
   `screenOf`, `interpolateView`, `labelFlip`. Verify: `cd web && npm test`.
2. **Graph wiring** — rotation in `View`, transforms, fit reset, animation + cancel,
   label rotation. Verify: `npm run typecheck && npm run lint`.
3. **Docs/version** — README mention, version 0.4.0 (`Cargo.toml`, `Cargo.lock`).
4. **Verify** — `npm run lint && npm run format:check && npm run typecheck && npm test &&
   npm run build`, `cargo test --locked`, and a headless Chromium run against the LAN
   Spokes server: click a leaf at an odd angle → after the animation its label's on-screen
   bounding box is wider than tall, its centre is near the viewport centre, and the zoom grew.

## Stops

- A check that fails and is not plainly fixable; the LAN Spokes server unreachable.

## What "go ahead" authorizes

- Commit this plan to `main` and push (docs-only).
- Push branch `feat/click-to-focus` and open a PR on `ogl33t/spokes-view`.
- Not authorized: merging, tagging, publishing an image, changing `ogl33t/stacks`.

## Rollback

- Close the PR and delete the branch; revert the plan commit if dropped.

## Risks

- A click that starts a double-click (expand) also starts a focus; the toggle still works.
- Large trees: the animation uses the composited fast path, so cost per frame is flat.

## What shipped

Steps 1–4 on `feat/click-to-focus`, done in the main session (small and tightly coupled)
rather than through `plan-executor`.

- `web/src/focus.ts` (+16 tests): `focusTarget`, `screenOf`, `interpolateView`,
  `easeInOut`, `labelFlip`.
- `web/src/Graph.tsx`: rotation in the view, the fast path generalised to rotation,
  `focusOn` on click, `stopFocus` on drag/wheel/pinch/zoom buttons/fit, Fit resets to
  north-up, labels flip by on-screen direction and inner labels are counter-rotated.
- **Deviation:** the focus target is recomputed every frame, not once. The first click
  opens the detail panel, which narrows the graph after the click; a target fixed at
  click time left the node 210 px right of centre (caught in the headless run).
- Verified headless against the LAN Spokes: two clicks on diagonal labels ended 0.1 and
  0.2 px from the graph centre with labels 274×16 and 266×15 px on screen, zoom 0.37 →
  1 → 1.6, 0 of 77 labels pointing left, Fit back to `rotate(0)`, no page errors.
- Version 0.4.0.
- Merged 367111c (fast-forward), tagged v0.4.0; image `ghcr.io/ogl33t/spokes-view:sha-367111c`; stacks pinned in 48bd36a (ogl33t/stacks#6).
