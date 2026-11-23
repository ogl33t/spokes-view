---
status: Done
spoke: SPOKE-209
started: 2026-11-23
finished: 2026-11-23
summary: Give each Spokes type an inline SVG icon and each stage its own colour across spokes-view's chips, Kanban stage columns and Legend.
---

# Type icons and stage colours in the spokes-view UI

## Context

SPOKE-203 (v0.5.0) put type and stage chips in spokes-view. A type chip is coloured text
(`--t-*` variables), and a stage chip is a plain grey outlined pill (`.stage-chip`), so
every stage looks the same. Brandon wants an icon per type and a colour per stage, so work
is easy to follow at a glance.

Scope (approved at gate 1):
- Type chips get an inline SVG icon before the word. No new dependency (the front end depends only on React). Type colours stay the same.
- Stage chips get one colour per stage, in workflow order, shown as a tinted pill with a coloured border and coloured text. Defined as `--stage-*` CSS variables for dark and light themes. Contrast is at least 4.5:1 against the page background and against the chip's own tint.
- The same colours and icons go everywhere: Backlog rows, Kanban cards, node details (side panel and modal), stage-grouped Kanban column headers (a coloured dot), and the Legend (new "Type" and "Stage" sections).
- Not included: the radial graph's nodes, changes to type or status colours, editing type or stage (SPOKE-207), release tag or deploy.

Repo facts each step needs:
- Repo root: `/Users/brandon/dev/spokes-view`. The front end is in `web/`, and the commands below run from `web/` unless noted.
- Front-end checks: `npm run lint && npm run format:check && npm run typecheck && npm test && npm run build`. Fix formatting with `npx prettier --write <files>`.
- Vocabulary already exists in `web/src/format.ts`: `NODE_TYPES`, `STAGES` (8, workflow order), `TYPE_LABEL`, `STAGE_LABEL`, `typeOf(n)`, `stageOf(n)`. Types `NodeType` and `Stage` live in `web/src/types.ts`.
- `web/src/TypeStageChips.tsx` renders both chips (`chip type-chip t-<type>`, `chip stage-chip`) and is used by `BacklogApp.tsx` and `KanbanApp.tsx`. `DetailPanel.tsx` (around line 138) renders its **own** copies of the two chips inside `Row label="Type"` / `Row label="Stage"`.
- Theme variables: dark `:root` at the top of `web/src/styles.css` (`--bg: #12141c`), light under `@media (prefers-color-scheme: light)` (`--bg: #f6f7fb`). Type chip rules are `.type-chip.t-*`. `.stage-chip` is near the end of the file. `.status-dot` is a 0.7rem `currentColor` circle. `.legend-body li` and `.legend-glyph` style the Legend.
- Vitest runs in the `node` environment and only includes `src/**/*.test.ts` (no DOM, no component tests). Tests can read files with `node:fs`.
- `KanbanApp.tsx` column header: `{group === "status" && <span className={`status-dot s-${col.key}`} aria-hidden="true" />}`. Stage columns have keys from `STAGES` plus `"none"`.

## Steps

### Step 1: Type icon component (independent)

Files: new `web/src/TypeIcon.tsx` only. Do not edit `styles.css` (Step 2 owns it).

- `export function TypeIcon({ type }: { type: NodeType }): ReactElement` returns an inline `<svg>` with `className={`type-icon ti-${type}`}`, `width="1em"`, `height="1em"`, `viewBox="0 0 16 16"`, `aria-hidden="true"`, `focusable="false"`, `fill="none"`, `stroke="currentColor"`, `strokeWidth={1.5}`, `strokeLinecap="round"`, `strokeLinejoin="round"`. The icon is drawn with simple paths:
  - `bug`: a beetle (oval body, head, three short legs per side, two antennae).
  - `feature`: a four-point sparkle/star.
  - `chore`: a wrench.
  - `idea`: a light bulb (bulb, base lines).
  - `epic`: a mountain with a flag on the peak.
- Use a `Record<NodeType, ReactElement>` (or similar) of path groups so a missing type is a compile error. Keep each icon recognisable at 12–14px: few strokes and no detail below 1.5px.

Acceptance: `TypeIcon` is exported, compiles, and draws a distinct icon for each of the 5 types. Nothing uses it yet.
Verify: `cd web && npm run lint && npm run format:check && npm run typecheck`.

### Step 2: Stage colour palette and contrast test (independent)

Files: `web/src/styles.css`, new `web/src/palette.test.ts`. Do not edit any `.tsx` file.

- Add `--stage-<stage>` variables (use `--stage-in-progress` / `--stage-in-review` with hyphens) next to the `--t-*` ones, in both themes:

  | stage | dark | light |
  |---|---|---|
  | idea | `#8f97b3` | `#545b76` |
  | backlog | `#a9b1d6` | `#474f6b` |
  | brainstormed | `#7dcfff` | `#0b5f91` |
  | understood | `#73daca` | `#086456` |
  | planned | `#bb9af7` | `#6a3fc0` |
  | in_progress | `#e0af68` | `#824d06` |
  | in_review | `#ff9e64` | `#9a440c` |
  | done | `#9ece6a` | `#26681b` |

- Add one class per stage, `.st-idea`, `.st-backlog`, `.st-brainstormed`, `.st-understood`, `.st-planned`, `.st-in_progress`, `.st-in_review`, `.st-done` (underscores, to match the `Stage` values), each setting `--st: var(--stage-…)`. Replace the `.stage-chip` rule with: `color: var(--st, var(--muted)); border: 1px solid var(--st, var(--line)); background: color-mix(in srgb, var(--st, transparent) 16%, transparent); border-radius: 999px;`. A chip with no `st-*` class looks as it does today.
- Add `.stage-dot` (the `.status-dot` shape, `background: var(--st, var(--muted))`) for Kanban headers and the Legend.
- Add `.type-icon { flex: none; vertical-align: -0.125em; }`, and make `.type-chip` an `inline-flex` with `align-items: center; gap: 0.25rem;` so the icon sits before the word.
- `palette.test.ts`: read `styles.css` with `node:fs` (path from `new URL("./styles.css", import.meta.url)`). Parse the dark and light `--bg` and all 8 `--stage-*` values from the two blocks. For each theme and stage, assert a WCAG contrast ratio ≥ 4.5 against `--bg`, and against the 16% tint (the stage colour mixed 16% over `--bg` in sRGB). Also assert all 8 stages are present in both blocks and the 8 dark values are distinct. Put the luminance and contrast helpers in the test file.

Acceptance: all 8 stages × 2 themes pass the contrast test. Existing chips look unchanged until Step 3 adds the classes.
Verify: `cd web && npm run lint && npm run format:check && npm test`.

### Step 3: Use the icons and colours everywhere (depends on Steps 1 and 2)

Files: `web/src/TypeStageChips.tsx`, `web/src/DetailPanel.tsx`, `web/src/KanbanApp.tsx`, `web/src/Legend.tsx`.

- `TypeStageChips.tsx`: export two components, `TypeChip({ type })` (renders `<span className="chip type-chip t-<type>" title="Type: <label>"><TypeIcon type={type} />{label}</span>`) and `StageChip({ stage })` (renders `<span className="chip stage-chip st-<stage>" title="Stage: <label>">{label}</span>`). `TypeStageChips` keeps its signature and behaviour, and uses them.
- `DetailPanel.tsx`: replace the hand-written chips in the Type and Stage rows with `<TypeChip type={type} />` and `<StageChip stage={stage} />`.
- `KanbanApp.tsx` column header: when `group === "stage"` and `col.key !== "none"`, render `<span className={`stage-dot st-${col.key}`} aria-hidden="true" />` where the status dot goes for status grouping.
- `Legend.tsx`: after the Status section, add `<h4>Type</h4>` with one `li` per `NODE_TYPES` entry (`<TypeIcon type={t} />` in a `legend-glyph` span with the type colour class, then `TYPE_LABEL[t]`). Add `<h4>Stage</h4>` with one `li` per `STAGES` entry (`<span className="stage-dot st-<s>" />` then `STAGE_LABEL[s]`). The type colour on the icon comes from wrapping it in `<span className={`legend-glyph type-chip t-${t}`}>` or an equivalent class that sets `color: var(--t-<type>)`. If that needs a CSS rule, add the minimum to `styles.css`.

Acceptance: a node with `type: "bug", stage: "in_review"` shows a beetle icon plus "bug" in red, and an orange-tinted "in review" pill, on its Backlog row, Kanban card and details. Kanban `&group=stage` headers show a coloured dot for each of the 8 stages and none for "No stage". The Legend lists 5 type icons and 8 stage colours.
Verify: `cd web && npm run lint && npm run format:check && npm run typecheck && npm test && npm run build`.

### Step 4: Docs, version and full check (depends on Step 3)

Files: `README.md`, `Cargo.toml`, `Cargo.lock` (repo root).

- README: where type and stage badges are described, say that types show an icon and stages have their own colours, and that the Legend lists both. Add `TypeIcon.tsx` and `palette.test.ts` to the Layout table if it lists source files.
- Bump the `spokes-view` version from `0.5.0` to `0.6.0` by hand, in `Cargo.toml` and in its `[[package]]` entry in `Cargo.lock` (the git hooks don't work on macOS).

Acceptance: the README describes the shipped behaviour, the version is 0.6.0 in both files, and every check passes.
Verify (from repo root): `cd web && npm ci && npm run lint && npm run format:check && npm run typecheck && npm test && npm run build && cd .. && cargo fmt --all --check && cargo clippy --locked --all-targets -- -D warnings && cargo test --locked`.

### Step 5: "Close others" in the tree's right-click menu (added 2026-11-23, at Brandon's request during review)

Files: `web/src/treeStore.ts`, `web/src/treeStore.test.ts`, `web/src/App.tsx`, `README.md`.

- `treeStore.ts`: add `export function closeOthers(store: Store, expanded: ReadonlySet<number>, id: number): Set<number>`. It returns a new set: `ROOT_ID`, every id in `ancestors(store, id)`, and every id in `expanded` that is `id` or a descendant of `id` (walk `knownChildren` from `id`). Everything else is dropped. Nothing is fetched.
- `treeStore.test.ts`: cover sibling branches collapsing, the ancestor path staying open, the node's own expanded descendants staying open, a collapsed node staying collapsed, and the root always in the set.
- `App.tsx`: in the `ContextMenu` items, after the Expand/Collapse branch item, add `{ label: "Close others", onPick: ... }` for every node except `ROOT_ID`. It calls `setExpanded(closeOthers(store, expanded, menuNode.id))`, `setExpandNote(null)` and `setFitKey((k) => k + 1)` (the same refit "Collapse all" does).
- README: in the feature list where the right-click menu or Collapse all is described, add that **Close others** collapses every branch except the path to that node and the node's own branch.

Acceptance: right-clicking a node and picking "Close others" leaves only the root-to-node path, the node and its open sub-branches, plus the siblings of path nodes as closed dots. The root's menu doesn't offer it.
Verify: `cd web && npm run lint && npm run format:check && npm run typecheck && npm test && npm run build`.

### Step 6: Balanced glyph and label size when zoomed in (added 2026-11-23, review feedback, independent of Step 7)

Files: new `web/src/zoomScale.ts`, new `web/src/zoomScale.test.ts`, `web/src/Graph.tsx`.

Problem: in `Graph.tsx` `Nodes`, labels stay a fixed 13.5px on screen (`font = FONT / k`), but past 1× glyphs scale fully with zoom (`z` is 1), so at 4× a circle is 4× bigger next to the same small text.

- `zoomScale.ts` exports `ZOOM_GROW = 0.4` and two pure functions:
  - `onScreenGrowth(k: number): number`, which returns `k >= 1 ? k ** ZOOM_GROW : 1`.
  - `glyphScale(k: number, room: number, r: number): number`, the scale applied to a node's glyph group in layout units. For `k < 1` it keeps today's formula, `Math.max(1, Math.min(1 / k, 2.5, (0.4 * room) / r))`. For `k >= 1` it returns `onScreenGrowth(k) / k`, so the glyph's on-screen size is `r * k^0.4`.
- `Graph.tsx`: `const font = (FONT * onScreenGrowth(k)) / k;` and `const z = glyphScale(k, p.room, r);`. Keep the `z === 1` check, and compare with a tolerance, since `z` is now fractional. Keep `showLabel`'s threshold in on-screen pixels: `p.room * k >= FONT * onScreenGrowth(k) + 2`. Change nothing else.
- Tests: `onScreenGrowth(1) === 1` and `onScreenGrowth(4) ≈ 1.741`. For `k >= 1`, on-screen glyph size (`glyphScale * k`) and on-screen font grow by the same factor. For `k < 1`, the result matches the old formula.

Acceptance: from 1× to 4×, glyphs and labels grow together, about 1.74× at 4×. Zoomed out, nothing changes.
Verify: `cd web && npm run lint && npm run format:check && npm run typecheck && npm test && npm run build`.

### Step 7: Cap how far apart siblings spread (added 2026-11-23, review feedback, independent of Step 6)

Files: `web/src/layout.ts`, `web/src/layout.test.ts`.

Problem: step 3 of `layoutRadial` hands a parent's whole wedge to its children in proportion to need, so a few leaves under a wide wedge end up very far apart along their ring.

- `LayoutOptions` gains an optional `maxSpread?: number`, the most arc length (layout units, on the children's ring) a child's share may take beyond its need. `DEFAULT_LAYOUT` becomes `{ spacing: 22, ringGap: 190, maxSpread: 66 }`. When `maxSpread` is undefined, behaviour is unchanged, which keeps the existing tests valid.
- In step 3, for a parent at depth ≥ 1 (the root's children still fill the circle), give each child `share = Math.min(proportional, Math.max(need(k), maxSpread / radii[d + 1]))`. Centre the run of children in the parent's wedge by starting at `s + (w - sumOfShares) / 2`. Children stay inside the parent's wedge, and each share is still at least its need, so the no-overlap guarantee holds.
- Update the header comment's point 3 to describe the cap.
- Tests, using `maxSpread`:
  - Under a depth ≥ 1 parent, neighbouring siblings are at most about `maxSpread` apart along their ring.
  - Children stay inside the parent's wedge.
  - The root's children still spread around the full circle.
  - The minimum ring gap still holds (`minRingGap`).

Acceptance: a parent with a few leaves keeps them grouped under it, not fanned across its whole wedge. All existing layout tests pass.
Verify: `cd web && npm run lint && npm run format:check && npm run typecheck && npm test && npm run build`.

### Step 8: Area squares sit square to their spoke (added 2026-11-23, review feedback)

Files: `web/src/Graph.tsx` only.

Problem: in `Nodes`, an area's glyph is `<rect className="shape" x={-r} y={-r} width={r * 2} height={r * 2} rx={3} />`, axis-aligned in layout space. The tree is often rotated (click-to-focus turns the view), so a square sits at an arbitrary angle to its spoke. Every edge (`edgePath`) reaches a node along its radial line, so a square should be rotated by the node's own angle.

- Give the area `rect` `transform={`rotate(${((p.angle * 180) / Math.PI).toFixed(2)})`}` (`p.angle` is radians, 0 = up, clockwise, matching SVG's clockwise `rotate`). The root is a circle and needs nothing. Apply the same rotation to any other square-shaped decoration drawn for areas (check the `collapsed-halo`, `busy` and `prio` rings: circles need no change). Change nothing else.
- If a CSS rule in `styles.css` assumes the rect is unrotated (for example a `transform` on `.node.k-area .shape`), report it rather than editing CSS.

Acceptance: whatever the view's rotation, before or after a refresh, and after click-to-focus turns the tree, each area square has two sides perpendicular to the spoke line through it.
Verify: `cd web && npm run lint && npm run format:check && npm run typecheck && npm test && npm run build`.

## Batches

1. Batch 1: Steps 1 and 2 in parallel (disjoint files).
2. Batch 2: Step 3.
3. Batch 3: Step 4.
4. Batch 4: Step 5 (added in review).
5. Batch 5: Steps 6 and 7 in parallel (added in review, disjoint files).
6. Batch 6: Step 8 (added in review).

Then in the main session: build, run
`SPOKES_VIEW_SERVERS="Home=http://kdev3:10050" SPOKES_VIEW_BIND=127.0.0.1:8799 ./target/debug/spokes-view`,
and screenshot it with headless Chromium (playwright-core, see the repo-quirks memory) in
**both dark and light** colour schemes (`colorScheme` emulation). Use the spokes-view subtree
(SPOKE-109): the Backlog, Kanban `&group=stage` with Show closed, a node's details, and the open
Legend. SPOKE-203 (`feature`/`done`) and SPOKE-209 (`feature`/stage set by this work) carry
values. Show Brandon the screenshots for the taste check before merging.

## Delivery path

No deployment. Branch `feat/type-icons-stage-colours` → PR on `ogl33t/spokes-view` (body: `Part of SPOKE-209`) → local checks (the fork has no PR CI) → Brandon's look at the screenshots → fast-forward merge to `main` → delete the branch. Pushing `main` runs `release.yml`, which publishes `ghcr.io/ogl33t/spokes-view:latest` and `sha-<7>`. Nothing pins it in `ogl33t/stacks`.

Spokes bookkeeping at the end: step nodes `set_status done`, SPOKE-209 `Stage: Done`, stage `done`, `set_status done`. Plan frontmatter `status: Done` with started/finished dates and a "What shipped" section.

## Stops

- A verify command fails in a way that isn't plainly a typo or formatting fix.
- A subagent reports a blocked or caveated step.
- A stage colour can't meet 4.5:1 in a theme without becoming indistinguishable from a neighbour. Show Brandon the options instead of picking.
- Brandon doesn't like an icon or colour in the screenshots. Adjust per his notes before merging.
- `git merge --ff-only` is refused because main moved: stop and show why.

## What "go ahead" authorizes

- Create branch `feat/type-icons-stage-colours`, commit to it, and push it to `origin` (`ogl33t/spokes-view`).
- Open a PR on `ogl33t/spokes-view` and fast-forward merge it into `main` after Brandon's screenshot check, then push `main`. This triggers `release.yml` (GHCR `latest` and `sha-<7>` images).
- Delete the merged branch locally and on `origin`.
- Commit this plan (docs-only) to `main` and push.
- Spokes writes on SPOKE-209 and its step nodes: notes, stage, `set_status`.

Not authorized (stop and ask): release tags, any `ogl33t/stacks` commit, deployment, new npm dependencies, Rust backend changes.

## Rollback

- Code: `git revert` the merged commits on `main` and push. The next `latest` image rebuilds without them, and nothing deployed pins it.
- GHCR images: leave them (unpinned, harmless) or delete the `sha-<7>` version in package settings.
- Spokes: `set_status open` on SPOKE-209 and its steps.

## Risks

- Hand-drawn icons may read poorly at 12px. The screenshot check catches it, and the icons are cheap to redraw.
- Light-mode idea and backlog greys are close on purpose (a quiet early-stage family). If Brandon wants them clearly apart, backlog shifts bluer.
- `color-mix()` needs a modern browser (Safari 16.2+, Chrome 111+). That's fine for Brandon's Apple-only devices. Without it the background falls back to none, and border and text keep the colour.
- Little live data has type or stage set, so the visual check covers only a few real nodes.

## What shipped

All four steps landed on `feat/type-icons-stage-colours` (v0.6.0).

- **Step 1:** `web/src/TypeIcon.tsx` draws the five icons from a `Record<NodeType, ReactElement>`. The wrench is the only one that uses an SVG `transform`. Before wiring them in, the icons were checked at 14px and 64px.
- **Step 2:** `styles.css` gains `--stage-*` variables for both themes, the `.st-*` classes, the tinted `.stage-chip`, `.stage-dot`, `.type-icon`, and `.type-chip` as inline-flex. `palette.test.ts` adds 17 tests: contrast against `--bg` and against the 16% tint, all stages present, and the dark values distinct.
- **Step 3:** `TypeStageChips.tsx` exports `TypeChip` and `StageChip`, which `DetailPanel` now uses. Kanban stage headers show a `stage-dot`. The Legend has new Type and Stage sections.
- **Step 5 (added in review):** `closeOthers()` in `treeStore.ts` has 5 tests. "Close others" is in the tree's right-click menu for every node except the root, and the README mentions it. Tested live: on SPOKE-109 it took the tree from 90 drawn nodes to 17 (the root-to-node path plus closed siblings), and the root's menu doesn't offer it.
- **Step 6 (added in review):** new `zoomScale.ts` exports `onScreenGrowth(k) = k^0.4` past 1× and `glyphScale`, with tests. Past 1×, glyphs and labels grow together. On l33t-bbq, glyph and label measured 19/16px at 1×, 25/21px at 2× and 32/26px at 4×; the old build gave 77/15px at 4×. Zoomed out, nothing changed.
- **Step 7 (added in review):** `layoutRadial` takes `maxSpread` (default 66). Below the root, a child's share is capped at its comfortable width: `maxSpread` of arc per leaf, summed up the branch. The first version capped each share at `max(need, maxSpread / r)`. That compounded down the tree, so leaves were packed at the minimum spacing and the overview lost its labels. It was replaced with the bottom-up rule before commit. The full-tree overview looks the same as before. In a sparse view (after "Close others" on l33t-bbq, at 2×), the screen shows 11 nodes against 7 before, grouped under their parent.
- **Step 8 (added in review):** area squares, and their alert dot, are rotated by the node's angle. The spoke always meets a square side-on, at any view rotation, after click-to-focus and after reload.
- **Step 4:** the README has the badges line and two Layout rows. The version is 0.6.0 in `Cargo.toml` and `Cargo.lock`.

**Tested how:**
- In this session, all of these passed: `npm run lint`, `format:check`, `typecheck`, `npm test` (76 tests), `npm run build`, `cargo fmt --check`, `cargo clippy --locked --all-targets -D warnings` and `cargo test --locked`.
- End to end, the debug binary ran against the LAN Spokes (`kdev3:10050`) and was screenshotted with headless Chromium in dark and light. The shots cover the SPOKE-109 Backlog (Show closed), Kanban `&group=stage` with Show closed (all 8 columns: coloured dots on the stage columns, none on No stage), the SPOKE-209 details modal, and the open Legend.

**Review and merge:** Brandon approved PR #5 after the screenshot checks. "Close others" leaves the picked node as it was: collapsed if it was collapsed. That question was left open and the behaviour kept.

**Untested:** no live node has type `bug`, `chore` or `idea`, so those chips were seen only as Legend entries and in the icon preview, not on real rows. (`in_review` was seen live once SPOKE-209 moved to it.)

**Deviations:**
- The Legend type icon is coloured with an inline `style={{ color: var(--t-<type>) }}` on the `legend-glyph` span, not the `type-chip` class. `.type-chip`'s inline-flex would have broken `.legend-glyph`'s fixed box.
- `palette.test.ts` starts with `/// <reference types="node" />`, because `tsconfig.app.json` limits `types` to `vite/client`.
- After the screenshot check, Brandon found the overall font small, so the root `font-size` in `styles.css` went from 15px to 16px. Everything is sized in `rem`, so the whole UI scaled up together. The radial graph's SVG labels are sized separately in `Graph.tsx` and did not change.
- The plan file was copied into `docs/plans/` at the start of `/build`, because the earlier session ended before the `/gsd` copy step.
