---
status: In review
spoke: SPOKE-258
started: 2026-11-24
finished:
summary: Rebuild spokes-view around design direction A (Workbench) — sidebar, ringless wheel with new node shapes, one docked details panel, iPhone layout — and add find/jump, area filters with colours and "Only what's next".
---

# spokes-view: direction A (Workbench)

## Context

The first design pass (branch `design-pass`, PR #6, unmerged; plan `docs/plans/design-pass.md`) restyled the app but kept its layout. Brandon's check on 2026-11-24: he disliked the numbered rim circles and found the interface barely changed. Three directions were mocked on a design canvas (https://claude.ai/artifact/B9hi4g1sn4sPfFpXcXBzRP) and he picked **A · Workbench**, then approved its Backlog, Kanban and iPhone boards and four new features: a find/jump box, area filters with per-area colours, an "Only what's next" switch, and a richer details panel docked on every page.

This plan builds on `design-pass`. Kept: Fontsource fonts, tokens, Overcast light theme, controls, chips, label collision and fit logic (`labels.ts`, `fit` in `Graph.tsx`), all tests. Replaced: the `AppBar` header, ring guides, depth numbers, hub nubs, Kanban/Backlog pop-up modal. Tokyo Night stays. Version stays 0.7.0 (never released).

## The target (from the canvas)

- **Desktop shell (all pages):** a 248px left **sidebar** (hub mark + wordmark; find box; Views: Tree / Backlog / Kanban; Areas with colour swatch and count; Show: "Closed items" and "Only what's next" switches; server picker + refresh at the bottom; "Updated h:mm" caption), the **main** area, and a 360px **docked details panel** on the right when something is selected.
- **Tree:** no rings, no depth numbers, no nubs. Root = small accent dot labelled "To do". Areas = pills filled with their area colour, label inside. Nodes with children = progress ring (done of total). Leaves = status-coloured dots. Priority rings stay (thin). Selected branch edges in accent.
- **Backlog:** breadcrumb row, a filter toolbar row, 36px rows with depth guides; parents show a small progress ring; selection opens the docked panel.
- **Kanban:** breadcrumb row with a Status / Stage segmented toggle; columns with a coloured rule in the heading and "Nothing here" slots; cards with progress bars; selection opens the docked panel (no pop-up).
- **Details panel:** crumbs, title, id + chips, progress bar, "Next step" card, actions (Focus branch on the tree / Show in tree elsewhere, Backlog, Kanban), fields, children list, notes, recent events.
- **iPhone (≤ 760px):** top bar (menu button that opens the sidebar as a drawer, page title + "server · updated" caption, find button); a row of area chips; the main view; details as a bottom sheet; a Tree / Backlog / Kanban tab bar at the bottom with safe-area padding. On the tree only areas and parent nodes are labelled at the first fit; leaf labels appear when zoomed in.

## Shared contracts (every step must match these names exactly)

- `web/src/areas.ts`: `AREA_SLOTS = 6`; `areaSlots(store: Store): Map<number, number>` (root's `kind: "area"` children in child order → slot 1..6, cycling); `areaOf(store: Store, id: number): number | null` (the depth-1 ancestor id of `id`, or `id` itself at depth 1, else null).
- CSS tokens in `web/src/styles.css`: `--area-1` … `--area-6` (dark and light values) and `--on-area` (text colour drawn on an area fill).
- `web/src/useAreas.ts`: `useAreas(server: string | null): AreaEntry[]` where `AreaEntry = { id: number; title: string; slot: number; count: number }` (`count` = `descendant_count`), loaded with the existing tree fetch in `api.ts` for root `ROOT_ID` at depth 1.
- `web/src/nextOnly.ts`: `nextOnlyKeep(nodes: Iterable<ViewNode>, rootId: number): Set<number>` = every node with `is_next` plus all its ancestors (via `parent`) that are present, plus `rootId`.
- `web/src/prefs.ts`: `Prefs = { includeClosed: boolean; nextOnly: boolean }`; `loadPrefs(): Prefs`; `savePrefs(p: Prefs): void`; localStorage key `spokes-view.prefs`, every access in try/catch, defaults both false.
- `web/src/find.ts`: `parseSpokeId(q: string): number | null` (accepts `SPOKE-12`, `spoke 12`, `12`); `findNodes(q: string, nodes: Iterable<ViewNode>, limit = 8): ViewNode[]` ranked: exact id, title prefix, word start, substring; ties by `effective_priority` then id; case-insensitive.
- `web/src/FindBox.tsx`: `FindBox({ nodes: () => Iterable<ViewNode>; onJump: (id: number) => void })` — combobox + listbox (ARIA), ⌘K/Ctrl+K and `/` focus it, Enter jumps to the highlighted hit; a typed SPOKE-N that is not loaded still offers "Jump to SPOKE-N"; footnote "Searches loaded items".
- `web/src/Shell.tsx`: `Shell({ sidebar, main, panel, phoneTitle })` lays out sidebar / main / panel on desktop and the phone top bar, drawer, sheet and tab bar on ≤ 760px. `web/src/Sidebar.tsx`: `Sidebar({ view: "tree" | "backlog" | "kanban"; links: { tree: string; backlog: string; kanban: string | null }; find: ReactNode; areas: { id; title; slot; count; href?: string; onPick?: () => void; active: boolean }[]; includeClosed; onToggleClosed; nextOnly; onToggleNext; server: ReactNode; refresh: { onClick; busy; disabled; caption } })`. The phone tab bar uses the same `view` and `links`.
- `web/src/DetailPanel.tsx` (the details panel): props `{ detail: DetailState; fromTree?: ViewNode; children: ViewNode[]; areaSlot: number | null; timeZone; today; server; onClose; onSelect(id); onFocus?: (id) => void; treeHref?: string; expanded?: boolean; onToggle?: (id) => void }`. `onFocus` set → "Focus branch" button; otherwise `treeHref` → "Show in tree" link. Keeps exporting `DetailState` and `localizeTimes`.
- `web/src/Graph.tsx` new props: `areaSlotOf: (id: number) => number | null`, `focusRequest: { id: number; seq: number } | null` (a new `seq` glides to `id` with the existing `focusOn`), `dimOutside: number | null` (nodes outside this subtree at 0.3 opacity), `compact: boolean` (phone: leaf labels hidden until zoom ≥ 1.5).

## Steps

Every step's verify command starts with the gate: `cd web && npm run lint && npm run format:check && npm run typecheck && npm test && npm run build`. A step is not done until the gate passes. Steps in the same batch must not edit each other's files; if one needs another's file it stops and reports.

### Step 1: Pure helpers, area tokens and prefs
**Independent.** Files: new `web/src/areas.ts`, `web/src/areas.test.ts`, `web/src/useAreas.ts`, `web/src/nextOnly.ts`, `web/src/nextOnly.test.ts`, `web/src/prefs.ts`, `web/src/prefs.test.ts`; `web/src/styles.css` (tokens only), `web/src/palette.test.ts`, `web/src/useSubtree.ts`.
- Implement `areas.ts`, `useAreas.ts`, `nextOnly.ts`, `prefs.ts` exactly as in Shared contracts.
- Add `--area-1`…`--area-6` and `--on-area` to `:root` and the light `@media` block. Dark values from the Tokyo Night family, distinct from each other (suggested: `#7dcfff`, `#bb9af7`, `#73daca`, `#ff9e64`, `#2ac3de`, `#c3e88d`). Do not change any existing token.
- `palette.test.ts`: each area colour ≥ 3:1 on `--bg` and on `--bg-2` in both themes, and `--on-area` on each area colour ≥ 4.5:1 in both themes. Darken light values minimally until they pass.
- `useSubtree.ts`: initialise and save `includeClosed` through `loadPrefs`/`savePrefs`, and expose `nextOnly` and `toggleNextOnly` the same way (returned from the hook, saved in prefs).
**Acceptance:** unit tests cover slot cycling past 6, `areaOf` at depths 0/1/3, `nextOnlyKeep` keeping ancestors and the root, and prefs surviving a throwing localStorage. Contrast tests pass.
**Verify:** the gate.

### Step 2: Tree drawing without rings
**Independent.** Files: `web/src/Graph.tsx`, `web/src/graph.css`, `web/src/Legend.tsx`, `web/src/labels.ts`/`labels.test.ts` (only if needed).
- Delete `Rings`, `ringNumberAngle`, `RING_FONT`, `RING_NUDGE`, `NUB`, the hub nubs path and their CSS.
- Root: 6px accent dot, label "To do" below it. Areas (depth 1, `kind: "area"`): a pill (`rect`, `rx` = half height) filled `var(--area-N)` from `areaSlotOf`, label inside in `--on-area`, weight 700; the area's inner label is not drawn separately. Nodes with drawn or known children: an 8px ring (`--rim` track) with a `--done` arc for progress (`progress` if present, else done children over `child_count + closed_child_count` from the store; 0 when unknown). Leaves: 4.5px dot filled with the status colour. Keep the priority ring, collapsed halo, busy state, alert dot, the +/− toggle and all click/keyboard/context-menu behaviour.
- Add the four new props from Shared contracts. `focusRequest`: on a new `seq`, call `focusOn(id)`. `dimOutside`: opacity 0.3 on nodes, labels and edges outside that subtree. `compact`: outward labels of leaves hidden until the zoom bucket is ≥ 1.5.
- `Legend.tsx`: replace "Hub and rims" and the old shapes with: area pill, parent ring with progress, task dot, priority ring.
**Acceptance:** no `.rings`, `.ring-depth` or `.hub-nubs` in the DOM. Existing `labels.test.ts`, `focus.test.ts`, `layout.test.ts` pass. With `focusRequest` changing, the view glides; with `dimOutside` set, other branches fade.
**Verify:** the gate, plus `grep -nE "Rings|ring-depth|hub-nubs|ringNumberAngle" web/src/*.tsx web/src/*.css` prints nothing.

### Step 3: Details panel
**Independent.** Files: `web/src/DetailPanel.tsx`, `web/src/ViewLinks.tsx`, `web/src/panel.css`.
- Rework `DetailPanel` to the props in Shared contracts, in canvas order: crumbs (buttons → `onSelect`), close; title (`--fs-xl`, 700); id in Martian Mono + status/type/stage/priority chips; **progress bar** (done/in progress/rest, from `progress` or from `children` plus `closed_child_count`, label "N of M done"); **Next step card** (the child with `is_next`, else "This is the next step" when the node itself is), clickable → `onSelect`; actions row (`onFocus` → primary "Focus branch", else `treeHref` → "Show in tree"; then `ViewLinks` Backlog/Kanban; then Expand/Collapse when `onToggle`); fields; **children list** (status dot, title, status word; each a button → `onSelect`; at most 12, then "+N more"); notes well; recent events; time-zone footnote. Area nodes show their area colour as the title dot.
- Keep exporting `NodeDetails`, `DetailState`, `localizeTimes` so the current pages still build; the pages move to the new props in Batch 2.
- `panel.css`: docked surface (`--bg-2`, left border, 360px, scrolls) and, ≤ 760px, the bottom-sheet look (top radius `--r-sheet`, `--lift`, max 70vh, scrolls). No new hex literals.
**Acceptance:** the panel renders every section from a sample `DetailState` with children; no hex literals in `panel.css`.
**Verify:** the gate, plus `grep -nE '#[0-9a-fA-F]{3,6}\b' web/src/panel.css` prints nothing.

### Step 4: Shell, sidebar, phone chrome and find
**Independent.** Files: new `web/src/Shell.tsx`, `web/src/Sidebar.tsx`, `web/src/FindBox.tsx`, `web/src/find.ts`, `web/src/find.test.ts`, `web/src/shell.css`; `web/src/main.tsx` (import `shell.css` after `header.css`).
- Build `find.ts`, `FindBox`, `Sidebar` and `Shell` exactly as in Shared contracts and the target description. Reuse `HubMark.tsx` for the logo. Switches are native checkboxes with `role="switch"` and class `switch` (existing CSS). Sidebar sections use the canvas labels: "Views", "Areas", "Show".
- `Shell` desktop: CSS grid `248px 1fr auto`, full height, main scrolls on its own. Phone (≤ 760px): top bar 52px + safe-area top; menu button opens the sidebar as a left drawer (focus-trapped, Escape and backdrop close it); find button opens `FindBox` as a full-width overlay; area chips row (from the same `areas` prop); the panel as a bottom sheet above the tab bar; tab bar 50px + `env(safe-area-inset-bottom)`. Touch targets ≥ 44px. Motion only on the drawer and sheet, none under `prefers-reduced-motion`.
**Acceptance:** `find.test.ts` covers id parsing, ranking order, ties and the limit. The components build and type-check (they are wired into pages in Batch 2).
**Verify:** the gate.

### Step 5: Tree page on the new shell
**Depends on Steps 1–4.** Files: `web/src/App.tsx`, `web/src/styles.css` (only the `.app` layout rules for the tree page, if any remain).
- Replace `AppBar` with `Shell` + `Sidebar`. `links`: tree (current), `backlogUrl(server, ROOT_ID)`, `kanbanUrl(server, ROOT_ID)`. Server picker and refresh move into the sidebar unchanged in behaviour. Expand all / Collapse all go in a slim row at the top of the main area with the crumb "To do".
- Prefs: `includeClosed` and new `nextOnly` from `loadPrefs`, saved on change. "Only what's next": filter the `layoutRadial` children callback through `nextOnlyKeep(store.nodes.values(), ROOT_ID)`.
- Areas: from `areaSlots(store)` plus the loaded area nodes (`descendant_count` as count). Clicking an area sets `focusRequest` to it and `dimOutside` to it; clicking the active area again clears both.
- Find: `FindBox` over `store.nodes.values()`. `onJump(id)`: if the node is in the store, `select(id)` and set `focusRequest`. If not, `fetchNode` it, load the branches along `path` with the existing `toggle`/fetch logic until it is in the store, then select and focus; on failure show the error in the existing notice.
- Details panel: pass `children` (known children from the store), `areaSlot` (`areaSlots` of `areaOf`), `onFocus` (sets `focusRequest`). Pass `compact` = viewport < 600px to `Graph`, and `areaSlotOf`.
**Acceptance:** the tree page matches the canvas "A · Workbench" board at 1440×900 and the iPhone board at 390×844 (headless screenshots). Find by title and by an unloaded SPOKE-N both select and glide. Area click focuses and dims; "Only what's next" prunes the wheel; both switches survive a reload.
**Verify:** the gate.

### Step 6: Backlog page on the new shell
**Depends on Steps 1–4. Independent of Steps 5 and 7.** Files: `web/src/BacklogApp.tsx`, `web/src/backlog.css`.
- `Shell` + `Sidebar` (`view: "backlog"`, area entries link to `backlogUrl(server, area.id)` via `useAreas`, `active` when `rootId` is that area). Breadcrumb row, then the toolbar row (filter, Type, Stage, Expand all, Collapse all), then rows.
- `nextOnly` from `useSubtree`: rows outside `nextOnlyKeep(data.nodes, rootId)` are hidden.
- Rows with children show a 16px progress ring before the title (same rule as Step 2). Selecting a row opens the docked `DetailPanel` (no `NodeModal`): `children` from `data.nodes`, `treeHref` = `/?server=…`, `areaSlot` from the area list.
- `FindBox` over `data.nodes`; jump = scroll the row into view and select it; an id not in the slice opens the tree page at that node's server (`/?server=…`) — acceptable for this pass.
**Acceptance:** matches the canvas "A · Backlog" board at 1440×900; `backlog.test.ts` unchanged and passing; filtering keeps parents; Clear filter still resets.
**Verify:** the gate.

### Step 7: Kanban page on the new shell
**Depends on Steps 1–4. Independent of Steps 5 and 6.** Files: `web/src/KanbanApp.tsx`, `web/src/kanban.css`.
- `Shell` + `Sidebar` (`view: "kanban"`, area entries link to `kanbanUrl(server, area.id, group)`). Breadcrumb row with a Status / Stage segmented control (two `<button aria-pressed>`), replacing the select; keeps the `group` URL param behaviour.
- Columns per the canvas: heading with dot, name, mono count and a tinted rule; "Nothing here" slot. Cards: optional path, title (3-line clamp), meta row (mono id, type chip, progress bar + "d/t" when the card has children). Selected card gets an accent outline.
- `nextOnly` hides cards outside `nextOnlyKeep`. Selecting a card opens the docked `DetailPanel` (no `NodeModal`), Enter and click both.
- `FindBox` over `data.nodes`; jump = scroll the card into view and select it.
**Acceptance:** matches the canvas "A · Kanban" board at 1440×900; `kanban.test.ts` unchanged and passing; cards open the panel by click and Enter.
**Verify:** the gate.

### Step 8: Clean-up, critique, docs (main session)
**Depends on Steps 5–7.**
- Delete `AppBar.tsx`, `header.css` (and its import), `NodeModal.tsx`, and `NodeDetails` if unused; remove dead CSS.
- Screenshot every view at 1440×900 and 390×844, dark and light, against `http://kdev3:10050`, beside the canvas boards. Fix what reads off; anything larger becomes a new step.
- README: describe the sidebar, area colours, find (loaded items only; SPOKE-N always), "Only what's next", the docked panel and the phone layout; drop the hub-and-rims text.
- Update `docs/plans/design-pass.md` frontmatter summary to say it is superseded by this plan.
**Acceptance:** problems from the review are gone (no rings or numbers; the interface visibly matches the canvas); `cargo test` and `cargo clippy --all-targets -- -D warnings` pass with the gate.
**Verify:** the gate, then `cargo test && cargo clippy --all-targets -- -D warnings`.

## Batches

| Batch | Steps | Notes |
|---|---|---|
| 1 | 1, 2, 3, 4 in parallel | Disjoint files; components meet only through the Shared contracts |
| 2 | 5, 6, 7 in parallel | One page file (plus its CSS) each |
| 3 | 8 | Main session |

Between batches the main session builds the binary, runs it against `http://kdev3:10050` and takes screenshots.

## Delivery path

1. Commit per step on `design-pass` (`feat:`), push, update PR #6's body (keep "Part of SPOKE-258"; new screenshots; the gate, `cargo test` and clippy output pasted, since the fork has no PR CI). Re-run `/triage 6`.
2. Brandon's check: the screenshots plus a local run (`SPOKES_VIEW_SERVERS="Home=http://kdev3:10050" SPOKES_VIEW_BIND=127.0.0.1:8799 ./target/debug/spokes-view`).
3. After Brandon approves: fast-forward `main`, push, delete the branch locally and on the remote.
4. The `release` run publishes `ghcr.io/ogl33t/spokes-view:sha-<7>`; confirm the tag from the run log.
5. Re-read stacks `AGENTS.md` "Deploying a new image"; set `sha-<7>` on the `image:` line of `kdev3/spokes/compose.yaml`; commit `spokes: deploy sha-<7>` to stacks `main` and push.
6. Git Sync redeploys within ~5 minutes. Production check at `http://kdev3:10060`: the served JS contains `Only what's next`, and the page shows the sidebar.
7. Brandon checks on his iPhone.
8. Docs: README (Step 8) and this plan's "What shipped".

## Stops

- A step needs a file another step in its batch owns.
- An existing dark token would have to change.
- Find by an unloaded SPOKE-N cannot reach the node through `fetchNode` + branch loading.
- Pan/zoom stutters at ~2,500 nodes after the glyph change and no fix keeps work out of the frame loop.
- Brandon's check finds a direction he does not like: stop and re-brief.
- The release run fails for a reason not plainly fixable, or Git Sync has not redeployed after 15 minutes.

## What "go ahead" authorizes

- Commits on `design-pass`, pushing it to `ogl33t/spokes-view`, editing PR #6's body, and `/triage 6`.
- After Brandon approves the PR: fast-forward merge to `main`, push, delete the branch locally and on the remote.
- Let the `release` workflow publish `ghcr.io/ogl33t/spokes-view:sha-<7>`.
- Commit `spokes: deploy sha-<7>` to `ogl33t/stacks` `main` (the `kdev3/spokes/compose.yaml` image line only) and push.
- Spokes node updates on SPOKE-258 and its batch and step nodes; updates to the design canvas.

Not authorized: tags, other stacks, changes to Spokes itself, new npm dependencies, `raiders-prod` or other services.

## Rollback

- Branch/PR: reset `design-pass` to `61162cd` (the last commit of the first pass) and force-push only with Brandon's OK, or close PR #6.
- Merge to `main`: `git revert` the merged commits on a branch, PR, merge.
- Image: nothing to delete; the old `sha-<7>` stays in GHCR.
- Stacks pin: commit the previous `sha-<7>` back as `spokes: deploy sha-<old>`; Git Sync redeploys.

## Risks

- **Parallel batches:** the steps meet only through the Shared contracts; a mismatch shows as a type error in Batch 2, which is where it gets fixed.
- **Find coverage:** title search sees only loaded nodes; large trees are lazy. The footnote says so; server search arrives with SPOKE-110/SPOKE-257.
- **Area colours vs status colours:** both come from Tokyo Night, so an area pill can share a hue with a status. Shape keeps them apart (pills vs dots).
- **Phone drawer and sheet** need a real iPhone check (safe areas, scroll locking); headless Chromium only approximates it.
- **PR size:** PR #6 grows further; reviewing commit by commit is the practical path.

## What shipped (2026-11-24)

All eight steps landed on `design-pass` (PR #6), one commit per step plus three follow-up fixes:

| Step | Commit | Notes |
|---|---|---|
| 1 Helpers, area tokens, prefs | `e12e50a` | Light area colours are new (`#0b5f91`, `#6a3fc0`, `#086456`, `#99430c`, `#0a6f85`, `#4d6a14`); `--on-area` is `#12141c` dark, `#fafbfd` light. `slotAt(index)` added to `areas.ts`. |
| 2 Tree without rings | `3666366` | Pills only at depth 1 (deeper `kind: "area"` nodes are parent rings). Pills counter-rotate to stay horizontal. |
| 3 Details panel | `c58b7aa` | `branchProgress` exported and used by tree, Backlog, Kanban and panel. |
| 4 Shell, sidebar, find | `74fec0d` | Sidebar takes an extra optional `serverName` (phone caption). Shell takes `sidebar: SidebarProps` and builds the phone chrome from it. |
| 5 Tree page | `94e5b6a`, `353462f` | Unloaded `SPOKE-N` jump loads branches along `path` in a loop (not via `toggle`). |
| 6 Backlog page | `b38ead1` | |
| 7 Kanban page | `9253f36` | |
| 8 Clean-up, docs | `4e89ee3`, `0fdedf1`, `f0cb824`, `2b1dc59` | `AppBar.tsx`, `NodeModal.tsx`, `header.css`, the old `.app` grid, modal CSS and dead legend CSS removed. README rewritten for the Workbench layout. |

**Tested how:** the gate (lint, format:check, typecheck, 210 Vitest tests, build), `cargo test` (16 passed) and `cargo clippy --all-targets -- -D warnings`, all clean on `2b1dc59`. End to end against `http://kdev3:10050` with the debug binary and headless Chromium: every view at 1440×900 and 390×844, dark and light, no page errors; find by title and by an unloaded `SPOKE-258` select and glide; area click focuses and fades other branches, a second click clears; "Only what's next" on a fresh load draws 21 nodes (next steps and their parents) instead of the root alone; both switches survive a reload; Kanban card opens the panel by click and Enter; Stage toggle sets `group=stage`; Backlog filter keeps parents (183 → 10 rows for "design").

**Untested:** a real iPhone (safe areas, drawer and sheet scroll locking, touch); Safari (the find shortcuts and drawer focus trap use `checkVisibility`, Safari 17.4+); a tree near the node cap with "Only what's next" on (the capped notice is wired but never triggered on kdev3); Clear filter in the browser (code unchanged).

**Deviations:**
- **"Only what's next" loads deeper** (Brandon's decision, 2026-11-24): with the switch on, the tree loads to depth 10 under the node cap, because next steps sit below the first depth-3 load. The plan only said to filter the layout.
- **Phone fit:** fixed a mis-sized label estimate for nested areas; the wheel is centred, but on kdev3's tree the longest depth-2 labels still clip about 20–30px at the screen edges at the first fit (labels need ~445px in a 390px box).
- **Contract props left optional:** `DetailPanel`'s `children` and `areaSlot` and Graph's four new props are optional, not required as the contract says, with safe defaults.
- **Backlog and Kanban sidebars** show the server as a name chip (those pages never had a picker); the refresh caption keeps seconds.
- **Kanban cards** keep the priority chip and markers; Stage grouping (nine columns) scrolls sideways.
- **Panel:** Expand/Collapse sits on its own row under the actions; the stage chip is hidden when it repeats the status; crumbs wrap rather than truncate.
- **Expand all / Collapse all** are hidden on the phone tree, as on the phone board.
