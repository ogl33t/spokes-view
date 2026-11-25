---
status: Done
spoke: SPOKE-258
started: 2026-11-24
finished: 2026-11-24
summary: First design pass (fonts, tokens, light theme, controls, label fit). Superseded by docs/plans/workbench.md (direction A, Workbench), which rebuilt the layout on top of it.
---

# Design and usability pass on spokes-view

## Context

Brandon asked for the frontend-design skill to be run against spokes-view so that it looks good and is easy to use. Screenshots of the live Home tree on 2026-11-24 (1440px and 390px, dark and light) found these problems:

1. Labels on the inner rings of the tree overlap ("Sp…kes", "H…nelab", "career-lifestyle-quiz" over "svg-me").
2. Fit-to-view cuts off outer labels at the top and bottom.
3. Every header button looks the same, and the Backlog header wraps to two rows at 1440px.
4. The Kanban and Backlog dropdowns are unstyled browser controls.
5. On a phone the header takes about 150px and the tree is drawn about 200px wide.
6. In light mode the priority rings are heavy and crowd the tree.
7. The details panel's action buttons wrap onto two rows.
8. Kanban columns look unfinished: empty columns are bare boxes and the cards are dense.

Decision at gate 1: **keep Tokyo Night as the dark palette exactly as it is.** Everything else gets a new identity: typefaces and type scale, spacing, controls, Kanban and Backlog layout, a signature for the tree, and a new light theme.

Stack: a Rust axum binary that embeds a React 19 + Vite front end (`web/`). There is no CSS framework; all styling is plain CSS in `web/src/styles.css` (1135 lines). `src/assets.rs` already serves `woff2`. `web/src/palette.test.ts` reads `styles.css` and checks the contrast of the stage colours in both themes. It finds the light block by the string `@media (prefers-color-scheme: light)`, so the tokens must stay in `styles.css`.

## Design brief

**Subject:** one person's to-do tree, drawn as a wheel. The root is the hub, each level is a rim, and branches are spokes. It is read on a Mac at a desk and on an iPhone. **The page's one job:** show where everything stands and make the next thing easy to find.

**Signature: hub and rims.** The root is drawn as a wheel hub: a disc with one short nub for each visible child, pointing along that child's spoke. The faint ring guides become rims, each with a small depth number (`1`, `2`, `3`…) in the data face at the top of its ring. The number stays the same size on screen and turns with the tree. The header logo becomes the same hub mark. The signature shows true structure (depth and fan-out), not decoration, and nothing else on the page is bold.

**Type** (self-hosted through Fontsource and embedded in the binary):
- **Atkinson Hyperlegible Next** (variable, OFL) for all UI text and tree labels. It was designed to stay legible at small sizes, which matters most for dense, rotated labels.
- **Martian Mono** (variable, OFL) for data: `SPOKE-N`, counts, times, dates in the details panel, and the depth numbers on the rims. The wordmark "Spokes view" uses it too, at width 112.5 and weight 600. Nothing else gets display treatment.
- Scale as tokens: `--fs-xs 12px`, `--fs-sm 13.5px`, `--fs-md 16px` (the base), `--fs-lg 18px`, `--fs-xl 22px`. Weights 400, 600 and 700 only.

**Colour.** The dark block stays unchanged: every existing hex value in `:root` is kept. Two tokens are added from the Tokyo Night family: `--bg-hover #292e42` (TN bg_highlight) and `--rim #3b4261` (TN fg_gutter). The new light theme is "Overcast" (cool and slightly blue; not cream, not a plain inversion):

| Token | Name | Hex |
|---|---|---|
| `--bg` | Overcast | `#eceef4` |
| `--bg-2` | Paper | `#fafbfd` |
| `--bg-3` | Mist | `#e0e4ee` |
| `--bg-hover` | Haze | `#d6dbe8` |
| `--line` / `--rim` | Rule | `#c6ccdb` / `#b9c0d3` |
| `--text` | Ink (TN storm) | `#1f2335` |
| `--muted` | Slate | `#535a7a` |
| `--accent` | Signal blue | `#3451b2` |

Light status, priority, type and stage colours keep their current hex values unless they fail ≥ 4.5:1 on Overcast. If one fails, darken it by the smallest step that passes. In light mode the priority rings get thinner: own 1.6px, inherited 0.9px at 0.4 opacity.

**Shape and depth.** 4px spacing base (`--sp-1`…`--sp-6` = 4, 8, 12, 16, 24, 32). Radius 6px for controls, 10px for surfaces and 14px for sheets. One shadow token, `--lift`, for floating surfaces (menu, legend, modal, phone sheet). Motion only on hover, focus and the existing focus glide, and none under reduced motion.

**Controls.** Three button variants: `.btn` (quiet, the default), `.btn.primary` (accent fill, at most one per header) and `.icon-btn` (square, with a visible tooltip and an aria-label). Selects use `appearance: none` with a CSS chevron and match the inputs. "Show closed" becomes a switch: a styled checkbox with `role="switch"` that stays a real `<input>`.

**Header (all three pages share one `AppBar`):** `[hub + wordmark] [server picker or breadcrumb] ··· [view switch: Tree · Backlog · Kanban] [page actions] [refresh icon + "updated hh:mm" caption]`. The view switch is a segmented control made of plain `<a>` links, so Cmd-click still opens a new tab. It is one row at ≥ 1024px. On a phone it is at most 96px tall: row 1 has the hub, the view switch and refresh; row 2 has the picker or filters and scrolls sideways.

**Copy.** Sentence case, and verbs that say what happens: "Expand all", "Collapse all", "Show closed". Empty Kanban column: "Nothing here". The Backlog empty filter keeps its current text if it has one; otherwise "No matches. Clear the filter to see everything."

**Critique against the skill's generic looks:** not cream with serif and terracotta (the light theme is cool, and there is no serif), not near-black with acid green (the dark is Tokyo Night's blue-violet with its full status palette), and not broadsheet hairlines (radii and surfaces stay). The one risk taken is the hub-and-rim signature together with a monospace wordmark.

## Steps

All paths are relative to the repo root `~/dev/spokes-view`. Every step's verify command includes the gate `cd web && npm run lint && npm run format:check && npm run typecheck && npm test && npm run build`. A step is not done until that passes.

### Step 1: Split `styles.css` by area, with no visual change
**Depends on:** nothing.
Move the rules out of `web/src/styles.css` into area files, keeping the selectors and declarations exactly as they are:
- `web/src/graph.css`: the `/* ---- graph ---- */` section, from the `.graph` rule to just before `/* ---- legend ---- */`.
- `web/src/panel.css`: the legend, detail panel, `.actions`, `a.btn`, context menu and modal rules.
- `web/src/kanban.css`: from `.kanban-app` to `.type-icon`, but keep the chip rules (`.chip`, `.tag`, `.type-chip*`, `.stage-chip`, `.st-*`, `.stage-dot`, `.prio-chip*`, `.type-icon`) in `styles.css`.
- `web/src/backlog.css`: `.filter` and the `.backlog*` rules.

`styles.css` keeps the tokens, the light `@media` block, the base and header rules, `.btn`, `.notice`, `.message`, the shared chip rules and `.mono`. Split the phone `@media (max-width: 760px)` block so each file holds its own phone rules. Import the new files from `web/src/main.tsx` after `./styles.css`, in this order: graph, panel, kanban, backlog.
**Acceptance:** the built page looks pixel-identical. `palette.test.ts` passes unchanged. No rule is lost: the total count of declarations across the files equals the count before the split.
**Verify:** the gate, plus `cat web/src/*.css | grep -c ';'` gives the same number before and after (record both in the report).

### Step 2: Foundation (fonts, tokens, light theme, base controls, chips)
**Depends on:** Step 1.
Files: `web/package.json`, `web/package-lock.json`, `web/src/main.tsx`, `web/src/styles.css`, `web/src/palette.test.ts`, `web/src/TypeStageChips.tsx` (class names only, if needed).
1. Install the fonts: `npm i @fontsource-variable/atkinson-hyperlegible-next @fontsource-variable/martian-mono` in `web/`. First run `npm view` on each package to check it exists. If the Atkinson variable package is missing, use `@fontsource/atkinson-hyperlegible-next` (weights 400/600/700). If neither exists, **stop and report**. For Martian Mono, import the stylesheet that includes the `wdth` axis (check the package's files, for example `full.css` or `wdth.css`). If no such stylesheet exists, use the plain variable stylesheet and set the wordmark at weight 700 instead of width 112.5. Import the font CSS in `main.tsx` before `./styles.css`.
2. Add the tokens from the design brief to `:root`: the font families with system fallbacks, the `--fs-*` scale, `--sp-*`, the radii (`--r-ctl 6px`, `--r-surface 10px`, `--r-sheet 14px`) and `--lift`. Add the two new dark colour tokens (`--bg-hover #292e42`, `--rim #3b4261`). **Do not change any existing dark hex value.**
3. Replace the values in the light `@media` block with the Overcast values from the design brief. Keep the existing light status, priority, type and stage hex values unless the contrast test fails, and darken only the ones that fail. Add the light priority ring override (`.prio.own` 1.6px; `.prio.inherited` 0.9px at opacity 0.4) inside that block.
4. Base controls in `styles.css`: `.btn` (quiet), `.btn.primary`, `.icon-btn` (2.25rem square, centred SVG); `select` with `appearance: none`, a chevron drawn by a CSS gradient or a data-URI SVG with the colour from `currentColor`-compatible tokens, the `--r-ctl` radius and the same height as `.btn`; `input[type=search|text]` to match; `.switch` for a checkbox styled as a toggle (still a native input, `role="switch"`, with a visible focus ring). Every interactive control is at least 36px tall on desktop and 44px on phone (`max-width: 760px`).
5. Use Martian Mono at `--fs-xs` for `.mono`, and the body font everywhere else. Chips (`.chip`, `.type-chip`, `.stage-chip`, `.prio-chip`, `.tag`) use the `--fs-xs` body font at weight 600, with radius 999px and a tinted background (`color-mix` of the chip colour at 14% into `--bg-2`) instead of an outline only.
6. Extend `palette.test.ts` so that `--text` and `--muted` on `--bg` and on `--bg-2` are each ≥ 4.5:1 in both themes, and the `--p1`…`--p4` and status colours on `--bg` are ≥ 3:1 (they are non-text graphics).
**Acceptance:** fonts load from `/assets/*.woff2` (nothing is fetched from a third-party origin). The dark tokens that existed before are byte-identical (`git diff` shows no `-` lines for an existing dark `--` token). The extended contrast tests pass.
**Verify:** the gate, plus `grep -c woff2 <(ls web/dist/assets)` gives ≥ 2, and `git diff web/src/styles.css | grep -E '^-\s+--' ` shows only light-block lines.

### Step 3: Shared AppBar, view switch and phone header
**Depends on:** Step 2. Independent of Steps 4 and 5.
Files: new `web/src/AppBar.tsx`, new `web/src/HubMark.tsx`, new `web/src/header.css` (imported in `main.tsx`), `web/src/App.tsx`, `web/src/KanbanApp.tsx`, `web/src/BacklogApp.tsx` (the `<header>` blocks only), `web/src/treeStore.ts`, `web/src/treeStore.test.ts`, and the header rules moved out of `styles.css`.
1. `HubMark.tsx`: an inline SVG at 20px. A disc in `--accent` with a ring of 8 short nubs, and `aria-hidden`. It replaces the `.logo` span. Delete the `.logo` CSS.
2. `AppBar.tsx` takes `{ place: ReactNode; view: "tree" | "backlog" | "kanban"; links: { tree: string; backlog: string; kanban: string | null }; actions?: ReactNode; refresh: { onClick; busy; disabled; caption: string } }`. It renders, in order:
   - the hub and the wordmark "Spokes view", linking to the tree for the current server;
   - `place`;
   - a flexible gap;
   - the view switch: a segmented `<nav aria-label="View">` of plain `<a>` links, with `aria-current="page"` on the active one and the Kanban link omitted when `links.kanban` is null;
   - `actions`;
   - the refresh button (`.icon-btn` with an SVG circular-arrow, aria-label "Refresh", spinning while busy except under reduced motion) and its caption ("Updated 4:12 PM · checked 4:13 PM"), in Martian Mono `--fs-xs` with `aria-live="polite"`.
3. Use AppBar on all three pages. Tree page: `place` is the server picker; `actions` are the "Show closed" switch and Expand all / Collapse all as a pair of quiet buttons; the tree link is the current page; the Backlog link is `backlogUrl(server, ROOT_ID)` and the Kanban link is `kanbanUrl(server, ROOT_ID)`. Kanban page: `place` is the existing breadcrumb; `actions` are the Group by select and the Show closed switch. Backlog page: `place` is the breadcrumb, and the filter controls move **out of the header** into a toolbar row that the Backlog step styles (leave the controls in a `<div className="toolbar">` directly under the header, with their current markup and handlers). Keep every existing handler, disabled condition and label text except as renamed here.
4. Header layout in `header.css`: one row with no wrapping at ≥ 1024px. Between 761 and 1023px it may wrap the actions. At ≤ 760px it is two rows: row 1 has the hub, the view switch and refresh; row 2 has `place` and `actions` in a horizontally scrolling strip; the total height is ≤ 96px; the wordmark text is hidden (the hub stays, with an accessible name).
5. In `treeStore.ts`, export `initialBudget(viewportWidth: number): number`, which returns 60 below 600px and 150 otherwise. Unit-test it. In `App.tsx`, pass `initialBudget(window.innerWidth)` to `initialExpansion`.
**Acceptance:**
- At 1440×900 the header is one row on all three pages.
- At 390×844 the header is ≤ 96px tall (check `header.getBoundingClientRect().height` in a headless browser).
- The view switch links are `<a href>`s.
- Kanban on the root works (`kanbanUrl(server, ROOT_ID)`).
- Existing tests pass, and the new `initialBudget` test passes.
**Verify:** the gate.

### Step 4: Tree: label collisions, fit padding, hub-and-rim signature
**Depends on:** Step 2. Independent of Steps 3 and 5.
Files: new `web/src/labels.ts`, new `web/src/labels.test.ts`, `web/src/Graph.tsx`, `web/src/graph.css`, `web/src/focus.ts` / `web/src/focus.test.ts` (only if the fit helper lives there).
1. **Inner-label collisions.** In `labels.ts`, export a pure function `placeInnerLabels(items: { id; x; y; width; height; rank }[]): Set<id>`. It takes screen-space boxes of the centred inner labels (the `!outward` branch in `Graph.tsx`'s `Nodes`), handles them in rank order (lower depth first, then larger `descendant_count`, then id), and keeps a label only when its box does not overlap any kept box or any node glyph box passed in the same list with `rank: -1` (glyphs are always kept). Estimate width as `chars × font × 0.56`. In `Nodes`, hide inner labels that are not kept. Their title stays in `<title>` and `aria-label`. Compute in layout units (divide the on-screen sizes by `k`), memoised on layout, `k` and turn. Unit-test overlap, rank order and glyph blocking.
2. **Fit padding.** Replace the fixed `padX = min(260, w*0.2)` and `padY = min(230, h*0.25)` in `fit` with a pure helper, `fitPadding(layout, labelPx: (id) => number, w, h)`. It measures how far the outward labels on the outermost ring extend in x and y (label length estimate × the cos/sin of its angle) and pads by that plus 12px, capped at 40% of each side. Unit-test it with a synthetic layout of 4 leaves at 0°, 90°, 180° and 270°.
3. **Hub.** Draw the root as a disc in `--bg-3` with a 2px `--accent` stroke and one 6px nub per visible child, in `--rim`, pointing along that child's angle. Keep the existing selected-ring, focus and click behaviour.
4. **Rims.** Ring guides (`.rings circle`) use `--rim` at 1px (non-scaling) with no dashes. At the top of each ring (angle 0 in layout space, so it turns with the tree), draw the depth number in Martian Mono `--fs-xs` `--muted` with a `--bg` paint-order halo. It stays a constant size on screen, as the labels do (use the same `FONT/k` maths), and is `aria-hidden`.
5. Tree labels use the body font. Area labels are weight 600 and the root is 700. Keep the label stroke halo.
**Acceptance:**
- No two inner labels overlap on the Home tree at the first fit, at 1440×900 and 390×844 (checked with a headless browser by comparing the `getBBox()` of `.inner-label` in screen space, in dark mode).
- At the first fit, no outward label's bounding box goes past the SVG viewport.
- The `labels.test.ts` and fit tests pass.
- With 2,500 nodes (Expand all on Home), pan and zoom stay smooth: label placement runs only when layout, the zoom bucket or turn changes, not every frame.
**Verify:** the gate.

### Step 5: Floating surfaces (details panel, legend, context menu, modal)
**Depends on:** Step 2. Independent of Steps 3 and 4.
Files: `web/src/DetailPanel.tsx`, `web/src/ViewLinks.tsx`, `web/src/Legend.tsx`, `web/src/ContextMenu.tsx`, `web/src/NodeModal.tsx`, `web/src/panel.css`.
1. **Details panel.** The title is `--fs-xl` weight 700. The `SPOKE-N · kind · status` line puts the id in Martian Mono. Actions are one row of quiet buttons that never wraps at the panel's minimum width (320px): "Collapse branch", "Backlog" and "Kanban". `ViewLinks` keeps the plain `<a>` links but shortens the labels to "Backlog" and "Kanban", and the context menu keeps "View Backlog" and "View Kanban". The fields grid uses Martian Mono for dates and counts. Section headings ("Notes", "Recent events") become `--fs-xs`, uppercase, letter-spacing 0.06em and `--muted`. Notes get a `--bg-3` well with radius `--r-surface`.
2. **Legend.** Same surface: `--bg-2`, `--lift`, `--r-surface`. Add a "Hub and rims" entry: "rim number = depth". The toggle button becomes `.btn` with a chevron.
3. **Context menu and modal.** `--lift`, `--r-surface` and `--bg-hover` on the hovered or focused item. The modal backdrop is `rgb(0 0 0 / 45%)` with a 2px blur that is skipped under `prefers-reduced-transparency`.
4. **Phone sheet** (≤ 760px): the panel keeps its bottom-sheet behaviour and gets a 36×4px grab bar at the top, `--r-sheet` corners and `--lift`.
**Acceptance:**
- At 1440×900 with the root selected, the panel's three action buttons sit on one row.
- The Legend lists the rim entry.
- Every text colour in these surfaces comes from tokens (there are no new hex literals in `panel.css`).
**Verify:** the gate, plus `grep -nE '#[0-9a-fA-F]{3,6}\b' web/src/panel.css` prints nothing.

### Step 6: Kanban board
**Depends on:** Step 3, because it edits `KanbanApp.tsx` after the header change. Independent of Step 7.
Files: `web/src/KanbanApp.tsx` (the board body only), `web/src/kanban.css`.
- Each column has a 3px top bar in its status or stage colour, a header that stays at the top of the board when scrolled, and its count in Martian Mono.
- An empty column shows a dashed `--rim` slot reading "Nothing here", about 64px tall.
- Cards are ordered: path (if any, muted, `--fs-xs`) → title (weight 600, at most 3 lines with ellipsis) → meta row (`SPOKE-N` in Martian Mono `--muted`, then the chips, then the notes glyph). The left status border becomes a 3px inset bar inside the radius. Hover uses `--bg-hover`, and a keyboard focus ring is visible.
- Columns are `minmax(17rem, 1fr)` and the board scrolls sideways when there are more columns than fit. On a phone the columns stack (as now).
**Acceptance:**
- The board for SPOKE-109, grouped by status and by stage, renders with the empty-slot text in empty columns.
- Cards keep opening the details modal, with click and with Enter.
- `kanban.test.ts` passes unchanged.
**Verify:** the gate.

### Step 7: Backlog list
**Depends on:** Step 3, because it edits `BacklogApp.tsx` after the header change and styles the `.toolbar` that step creates. Independent of Step 6.
Files: `web/src/BacklogApp.tsx` (the toolbar and the list only), `web/src/backlog.css`.
- The toolbar row under the header stays at the top when scrolled and holds: the filter input (search style, flexible width, at most 28rem), the Type and Stage selects, then Expand all / Collapse all as quiet buttons. On a phone the filter is full width and the rest scroll sideways.
- Rows are 36px tall (44px on a phone) and hover uses `--bg-hover`. Indentation shows a 1px `--rim` guide line per level. The title uses the body font. The meta (`SPOKE-N` in Martian Mono, chips, child counts) is right-aligned, and as now the mono id and counts are hidden on a phone.
- The empty filter result uses the copy from the design brief, with a "Clear filter" button that resets the text, Type and Stage.
**Acceptance:**
- On SPOKE-109 at 1440×900 the header plus the toolbar take two rows with no wrapping inside either.
- Filtering by "type" leaves the matches with their parents, as now.
- `backlog.test.ts` passes unchanged.
**Verify:** the gate.

### Step 8: Critique pass, docs and version
**Depends on:** Steps 3–7. Run in the main session, not by a subagent.
1. Screenshot every view against the Home tree with the headless-Chromium script in the scratchpad: tree, tree with details, Kanban on SPOKE-109, Backlog on SPOKE-109, Legend open, the context menu. Take each at 1440×900 and 390×844, in dark and light. Compare against the "before" set taken on 2026-11-24. Fix what reads as off. Small fixes are made in the main session; anything larger is a new step.
2. Remove one accessory: cut any decoration that does not carry information.
3. README: in "Everything at a glance", mention the hub and rims (rim number = depth), and add the fonts (Atkinson Hyperlegible Next and Martian Mono, OFL, self-hosted) to "How it works".
4. Bump `version` 0.6.0 → 0.7.0 in `Cargo.toml` and `Cargo.lock` by hand (the `.githooks` do not work on macOS).
**Acceptance:**
- Before and after screenshots for each view.
- Problems 1–8 are visibly fixed.
- `cargo test` and `cargo clippy --all-targets -- -D warnings` pass, along with the gate.
**Verify:** the gate, then `cargo test && cargo clippy --all-targets -- -D warnings`.

## Batches

| Batch | Steps | Model | Notes |
|---|---|---|---|
| 1 | Step 1 | sonnet | Mechanical split |
| 2 | Step 2 | opus | Sets the identity; contrast judgement |
| 3 | Steps 3, 4, 5 in parallel | 3: sonnet, 4: opus (layout maths), 5: sonnet | No files shared between them. Step 3 owns `App.tsx`, `KanbanApp.tsx`, `BacklogApp.tsx` and `treeStore.ts` in this batch. |
| 4 | Steps 6, 7 in parallel | sonnet | Disjoint files |
| 5 | Step 8 | main session | Critique, docs, version |

Between batches, the main session runs the app against `http://kdev3:10050` and takes screenshots before starting the next batch.

## Delivery path

1. Branch `design-pass` from `main`. Commits use `feat:`. PR to `ogl33t/spokes-view` with the body "Part of SPOKE-258". Since there is no PR CI on the fork, the gate plus `cargo test` and clippy are run locally and pasted into the PR.
2. Brandon's check: the screenshots in the PR, plus a local run (`SPOKES_VIEW_SERVERS="Home=http://kdev3:10050" SPOKES_VIEW_BIND=127.0.0.1:8799 ./target/debug/spokes-view`).
3. After Brandon approves, fast-forward into `main`, push, and delete the branch.
4. The `release` run on main publishes `ghcr.io/ogl33t/spokes-view:sha-<7>`. Confirm the tag from the run log.
5. Re-read stacks `AGENTS.md` "Deploying a new image". Set `sha-<7>` on the `image:` line of `kdev3/spokes/compose.yaml`, commit `spokes: deploy sha-<7>` straight to stacks `main`, and push.
6. Git Sync redeploys within about 5 minutes. Production check: grep the served `/assets/*.js` at `http://kdev3:10060` for `Nothing here`, and load the page to see the new header.
7. Brandon checks on his iPhone.
8. Docs: README (Step 8) and the plan file updated with what shipped.

## Stops

- Font packages are missing from npm (Step 2), or a font cannot be served from the embedded `dist`.
- An existing dark hex value would have to change to pass a test. Ask first; do not change it.
- Inner-label placement makes pan or zoom stutter at 2,500 nodes and no fix keeps it out of the frame loop.
- Brandon's check finds a direction he does not like: stop and re-brief before more steps.
- The release run fails for a reason that is not plainly fixable, or Git Sync has not redeployed after 15 minutes.

## What "go ahead" authorizes

- Create and push branch `design-pass` to `ogl33t/spokes-view`, and open a PR there.
- `npm i` of `@fontsource-variable/atkinson-hyperlegible-next` (or `@fontsource/atkinson-hyperlegible-next`) and `@fontsource-variable/martian-mono` in `web/`.
- After Brandon approves the PR: fast-forward merge to `main`, push, and delete the branch locally and on the remote.
- Let the `release` workflow publish `ghcr.io/ogl33t/spokes-view:sha-<7>`.
- Commit `spokes: deploy sha-<7>` to `ogl33t/stacks` `main` (the `kdev3/spokes/compose.yaml` image line only) and push.
- Spokes node updates on SPOKE-258 and its step nodes.

Not authorized: tags, changes to other stacks, any change to Spokes itself, and anything on `raiders-prod` or other services.

## Rollback

- PR or branch: close the PR and delete the branch.
- Merge to `main`: `git revert` the merged commits on a branch, then a PR and merge as usual.
- Image: nothing to delete. The old `sha-<7>` stays in GHCR.
- Stacks pin: commit the previous `sha-<7>` back as `spokes: deploy sha-<old>` and push. Git Sync redeploys.

## Risks

- **Fonts and CJK or emoji titles:** Atkinson's Latin subset falls back to system fonts for other scripts. The fallback stack keeps titles readable.
- **Label estimates:** char-count widths are approximate, so a tight pair may still touch. The 0.56 factor is generous, and the screenshot check in Step 4 catches misses.
- **Bundle size:** two variable fonts add about 150–250 KB of woff2. They are loaded once and cached, which is acceptable on a LAN.
- **Rotated depth numbers** can read upside down after a focus turn. They are kept upright with the same `labelFlip` rule as labels.
- **Parallel Batch 3** depends on no files being shared between Steps 3, 4 and 5. If a step finds it needs a file another step owns, it stops and reports rather than editing it.

## What shipped

Branch `design-pass`, 8 commits, version 0.7.0. All eight steps are done; batches ran as planned (1, 2, 3 in parallel, 4 in parallel, 8 in the main session), except that Batch 4 started while the Step 4 rework was still running (no shared files).

- **Step 1:** `styles.css` split into `graph.css`, `panel.css`, `kanban.css`, `backlog.css`. Declaration count 667 before and after. A/B screenshots of main and the branch against the same data differed only in the live clock text.
- **Step 2:** `@fontsource-variable/atkinson-hyperlegible-next` (`wght.css`) and `@fontsource-variable/martian-mono` (`wdth.css`, so the wordmark uses width 112.5). Six woff2 files, about 135 KiB, all served from `/assets`. Tokens, Overcast light theme, `.btn`/`.btn.primary`/`.icon-btn`/`.switch`, styled selects and inputs, tinted chips. Added `--ctl-h` (36px, 44px on a phone). No existing dark value changed.
- **Step 3:** `AppBar`, `HubMark`, `header.css`. One row at 1440 (53px) on all three pages; 93px on a phone. `initialBudget` (60 below 600px).
- **Step 4:** `labels.ts` (`placeInnerLabels`, `fitPadding`, `labelledBounds`), hub with nubs, rims with depth numbers. Home at 1440×900: 95 leaf labels, none past the viewport, no inner overlaps.
- **Step 5:** details panel, legend (with the Hub and rims entry), context menu, modal, phone sheet. No hex literals in `panel.css`.
- **Step 6:** Kanban column bars, sticky headers, mono counts, "Nothing here" slots, three-line titles, inset status bar, focus ring.
- **Step 7:** Backlog toolbar row, 36px rows (44px on a phone) with depth guides, "Clear filter".
- **Step 8:** critique fixes, README, 0.7.0. Before/after screenshots: https://claude.ai/artifact/T6HDiZM1DzZ8N7WJ4uMqfH

### Tested how

- Gate (`lint`, `format:check`, `typecheck`, 140 tests, `build`), `cargo test`, `cargo clippy --all-targets -- -D warnings`: all pass.
- The built binary against `http://kdev3:10050`, driven by headless Chromium: tree, details, legend, context menu, Kanban by status and stage, Backlog, at 1440×900 and 390×844 in dark and light, side by side with main's binary. Header heights measured; card click and Enter open the modal; Backlog filtering keeps parents; Clear filter resets text, Type and Stage.

### Untested

- iPhone Safari on a real device (safe areas, the switch, the bottom sheet).
- Pan and zoom smoothness at 2,500 nodes: Home with Expand all and Show closed only reaches 316 nodes. Placement runs once per layout, zoom bucket or turn (counted), and costs 0.55 ms on a synthetic 2,500-glyph set.

### Deviations

- **Light colours:** besides the Overcast tokens, these light values were darkened to reach 4.5:1 on `--bg`, per the brief: `--in-progress`, `--p3`, `--t-idea` `#a8650a` → `#9c5e09`; `--done` → `#2e7c22`; `--dropped` → `#666c80`; `--focus` → `#8e6500`; `--next` → `#0a7a6a`; `--p2` → `#b14f10`; `--p4`, `--t-chore` → `#646b86`; `--stage-in-review` → `#99430c`. The contrast test checks light status and priority colours at 4.5 and dark ones at 3.
- **Tree fit (Brandon's call on 2026-11-24):** keeping every leaf label inside the viewport gave a tree with no leaf labels. Now outward labels are capped at 18 characters below 1× zoom; the fit searches for the largest zoom where the shown labels fit, else fits the rings and zooms in until the outer ring's labels show, centred on nodes plus labels. On a phone some labels still run past the edges (5 left, 1 right on Home).
- **Area labels:** depth 0 and 1 labels always show (Brandon's call); collisions hide only deeper labels.
- **Depth numbers** sit 22px counter-clockwise of the top of each ring and step further round if a glyph is there.
- **Copy:** "Expand branch (N beneath)" is now "Expand (N beneath)" so the panel actions fit on one row. The Backlog empty text kept its existing copy and gained the Clear filter button. The legend toggle always reads "Legend" with a chevron.
- **Header:** the tree page's Backlog button and the Kanban/Backlog cross-links moved into the view switch. On Backlog, "Show closed" stays in the header actions; on Kanban and Backlog the server chip sits after the breadcrumb.
- **Removed accessory:** the phone sheet's grab bar (the sheet cannot be dragged).
- **Step 8 fixes:** the Kanban column bar became a 3px coloured `border-top` (the pseudo-element bar was invisible at the corners); card ids use Martian Mono at width 87.5% so the meta row fits in 17rem columns; the phone Backlog toolbar puts the filter on its own row with the other controls scrolling below.

### Follow-ups

- Header Tab order follows the DOM (place, actions, view switch), which differs from the desktop visual order (place, view switch, actions).
- The refresh caption is hidden on a phone, so its `aria-live` announcement is lost there.
- `fit` in `Graph.tsx` is long; its search could become a pure, tested helper.
