---
status: Planned
spoke: SPOKE-209
started:
finished:
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

## Batches

1. Batch 1: Steps 1 and 2 in parallel (disjoint files).
2. Batch 2: Step 3.
3. Batch 3: Step 4.

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
