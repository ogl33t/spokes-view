---
status: Done
spoke: SPOKE-203
started: 2026-11-23
finished: 2026-11-23
summary: Show Spokes 0.4.0 type and stage in spokes-view - badges, Backlog filters, and a group-by-stage Kanban board.
---

# Type and stage in the spokes-view UI

## Context

Spokes 0.4.0 added two fields to every node in `/api/tree` and `/api/nodes/{id}`:
`type` (`bug`, `feature`, `chore`, `idea`, `epic`) and `stage` (`idea`, `backlog`,
`brainstormed`, `understood`, `planned`, `in_progress`, `in_review`, `done`; separate
from `status`). Both are `null` when unset. spokes-view (Rust proxy + React/Vite front
end in `web/`) ignores them today. The proxy passes bodies through unchanged, so this is
front-end-only work.

Scope (approved at gate 1):
- SPOKE-204: badges in node details (side panel and modal), Backlog rows and Kanban cards. The radial graph's labels stay as they are.
- SPOKE-205: Type and Stage filters in the Backlog view.
- SPOKE-206: a "Group by: Status / Stage" switch on the Kanban page.
- SPOKE-207 (editing type/stage) is **not** built: spokes-view has no write path. It moves under Phase 2 (SPOKE-111).
- Delivery stops at merge to `main`. No release tag, no `ogl33t/stacks` pin.

Repo facts each step needs:
- Repo root: `/Users/brandon/dev/spokes-view`. Front end in `web/`, all commands below run from `web/` unless noted.
- Front-end checks: `npm run lint && npm run format:check && npm run typecheck && npm test && npm run build`. Use `npx prettier --write <files>` to fix formatting.
- Existing chip styles: `.chip` and `.prio-chip.pN` in `web/src/styles.css`. Existing `<span className="chip">area</span>` sits in Backlog rows (`BacklogApp.tsx`) and Kanban cards (`KanbanApp.tsx`).
- Older Spokes servers (before 0.4.0) send no `type`/`stage` keys at all; treat missing the same as `null`.

## Steps

### Step 1: Type and stage vocabulary and badge component (independent)

Files: `web/src/types.ts`, `web/src/format.ts`, `web/src/format.test.ts`, new `web/src/TypeStageChips.tsx`, `web/src/styles.css`.

- In `types.ts` add `export type NodeType = "bug" | "feature" | "chore" | "idea" | "epic";` and `export type Stage = "idea" | "backlog" | "brainstormed" | "understood" | "planned" | "in_progress" | "in_review" | "done";`. Add to `ViewNode`: `type?: NodeType | null;` and `stage?: Stage | null;` (optional because pre-0.4.0 servers omit them).
- In `format.ts` add `NODE_TYPES: readonly NodeType[]` (order above), `STAGES: readonly Stage[]` (the workflow order above), `TYPE_LABEL: Record<NodeType, string>`, `STAGE_LABEL: Record<Stage, string>` (`in_progress` → "in progress", `in_review` → "in review", others as is), and `typeOf(n: ViewNode): NodeType | null` and `stageOf(n: ViewNode): Stage | null`. Those two return `null` for missing, null, or unknown strings (a newer server may add values).
- New `TypeStageChips.tsx`: `export function TypeStageChips({ node }: { node: ViewNode }): ReactElement | null`. It renders `<span className="chip type-chip t-<type>" title="Type: <label>">` for the type and `<span className="chip stage-chip" title="Stage: <label>">` for the stage, each only when set. It renders `null` when neither is set.
- In `styles.css` add `.type-chip.t-bug`, `.t-feature`, `.t-chore`, `.t-idea` and `.t-epic`, each with its own colour, in light and dark like `.prio-chip.pN`. Add `.stage-chip` as a pill (fully rounded, outlined, neutral), so it reads differently from the status colours.
- Tests in `format.test.ts`: `typeOf`/`stageOf` cover a set value, `null`, a missing key and an unknown string. `STAGES` has 8 entries in order.

Acceptance: types compile, and the new helpers and component exist and are exported. No screen uses them yet.
Verify: `cd web && npm run lint && npm run format:check && npm run typecheck && npm test`.

### Step 2: Show the badges (depends on Step 1)

Files: `web/src/DetailPanel.tsx`, `web/src/BacklogApp.tsx`, `web/src/KanbanApp.tsx`.

- `DetailPanel.tsx` (its node-details body is shared by the side panel and `NodeModal`): in the fields `<dl className="fields">`, add a `Row label="Type"` and a `Row label="Stage"`, each shown only when set and each holding the matching chip. Put them before Priority. Status stays where it is in the `ids` line.
- `BacklogApp.tsx` row meta and `KanbanApp.tsx` card meta: render `<TypeStageChips node={n} />` straight after the `area` chip.

Acceptance: a node with `type: "feature", stage: "done"` shows both chips on its Backlog row and Kanban card, and Type/Stage rows in details. A node with both unset shows nothing new.
Verify: `cd web && npm run lint && npm run format:check && npm run typecheck && npm test && npm run build`.

### Step 3: Type and Stage filters in Backlog (depends on Step 2; independent of Step 4)

Files: `web/src/backlog.ts`, `web/src/backlog.test.ts`, `web/src/BacklogApp.tsx`. Do not edit `kanban.ts`, `KanbanApp.tsx` or `styles.css` (Step 4 owns them). Reuse the existing header classes.

- In `backlog.ts` introduce `export interface RowFilter { text: string; type: NodeType | "any" | "none"; stage: Stage | "any" | "none" }` and `export const NO_FILTER: RowFilter`. `matches(n, f: RowFilter)` keeps the existing text rule (title substring or `SPOKE-N`/`N`) and adds: type `"any"` matches all, `"none"` matches `typeOf(n) === null`, otherwise equality. Stage works the same way. Each node is judged on its own value, not inherited. `visibleRows(rows, collapsed, f: RowFilter)` treats "filtering" as any of the three being non-default, and keeps matches plus their ancestors as today.
- Update the existing tests to the new signature and add cases: type only, stage only, `"none"`, text plus type combined, and ancestors kept for a type match.
- In `BacklogApp.tsx` replace the `filter` string state with a `RowFilter`. Add two `<select>`s after the text filter, labelled (visually hidden labels like the text filter's `sr-only`) "Type" and "Stage". Options: "Any type"/"Any stage", each value from `NODE_TYPES`/`STAGES` with its label, then "No type"/"No stage". The "No matches" message and the `N of M` count work for any active filter.

Acceptance: with Type=feature only feature nodes and their ancestors show. Stage="No stage" hides nodes with a stage. Clearing all three restores the collapsible outline.
Verify: `cd web && npm run lint && npm run format:check && npm run typecheck && npm test && npm run build`.

### Step 4: Group the Kanban board by stage (depends on Step 2; independent of Step 3)

Files: `web/src/kanban.ts`, `web/src/kanban.test.ts`, `web/src/KanbanApp.tsx`, `web/src/styles.css`. Do not edit `backlog.ts` or `BacklogApp.tsx` (Step 3 owns them).

- In `kanban.ts`: `export type Grouping = "status" | "stage";` and `export const GROUP_PARAM = "group";`. `groupingFrom(search: string): Grouping` returns `"stage"` only for `group=stage`, otherwise `"status"`. `kanbanUrl(server, id, group?: Grouping)` adds `&group=stage` only for stage. Generalise `Column` to `{ key: string; label: string; cards: Card[] }`. `buildBoard(slice, includeClosed, group: Grouping = "status")`: status grouping stays as today (key = status, label = `STATUS_LABEL`). Stage grouping gives one column per entry of `STAGES` in order plus a last `"none"` column labelled "No stage", filled with `stageOf(n)`. Stage columns ignore `includeClosed` (closed nodes are simply absent unless "Show closed" loads them). Cards keep `compareCards` order.
- Update tests for the new `Column` shape and add: stage grouping puts each node in its stage column, unset or unknown stages go to "No stage", column order matches `STAGES`, and `groupingFrom`/`kanbanUrl` round-trip.
- In `KanbanApp.tsx`: read the initial grouping from `window.location.search` with `groupingFrom`. Add a `<select>` labelled "Group by" (Status / Stage) in the header. On change, update state and `history.replaceState` the URL so a reload keeps it. Render columns from `key`/`label`, keeping any existing `data-status` attribute only for status grouping. In `styles.css`, make stage columns (9 of them) scroll horizontally, which the board may already do. Add only what is needed.

Acceptance: `/?server=<s>&kanban=<id>&group=stage` shows 9 columns with each card in its stage column. Switching back to Status shows the current board unchanged. The choice survives a reload.
Verify: `cd web && npm run lint && npm run format:check && npm run typecheck && npm test && npm run build`.

### Step 5: Docs, version and full check (depends on Steps 3 and 4)

Files: `README.md`, `Cargo.toml`, `Cargo.lock` (repo root).

- README "The finished product": in the Kanban bullet, mention the Group by Status/Stage switch and `&group=stage`. In the Backlog bullet, mention the Type and Stage filters. In "Everything at a glance" / "Details on click", mention type and stage badges (Spokes 0.4.0+). Add `TypeStageChips.tsx` to the Layout table.
- Bump the `spokes-view` package version from `0.4.0` to `0.5.0` in `Cargo.toml` and in its `[[package]]` entry in `Cargo.lock`, by hand (the git hooks do not work on macOS).

Acceptance: README describes the shipped behaviour, the version is 0.5.0 in both files, and every check passes.
Verify (from repo root): `cd web && npm ci && npm run lint && npm run format:check && npm run typecheck && npm test && npm run build && cd .. && cargo fmt --all --check && cargo clippy --locked --all-targets -- -D warnings && cargo test --locked`.

## Batches

1. Batch 1: Step 1.
2. Batch 2: Step 2.
3. Batch 3: Steps 3 and 4 in parallel (disjoint files).
4. Batch 4: Step 5.

Then in the main session (not subagents): a manual check against live data. Build, then
run `SPOKES_VIEW_SERVERS="Home=http://kdev3:10050" SPOKES_VIEW_BIND=127.0.0.1:8799 ./target/debug/spokes-view`
and open it with headless Chromium (playwright-core, see the repo-quirks memory). Only one
live node has values today (`feature`/`done`) and SPOKE-203 itself is now
`feature`/`understood`. Check its badges in details, Backlog and Kanban, the Type=feature
filter, and `group=stage` on the spokes-view node's subtree (SPOKE-203's parent) with Show closed.

## Delivery path

No deployment. Branch `feat/type-stage` → PR on `ogl33t/spokes-view` (body: `Part of SPOKE-203`) → local checks (the fork has no PR CI) → fast-forward merge to `main` → delete the branch. A push to `main` runs `release.yml`, which publishes `ghcr.io/ogl33t/spokes-view:latest` and `sha-<7>`. That is expected, but nothing pins it in `ogl33t/stacks`, so the homelab keeps running its current pin until a later release.

Spokes bookkeeping at the end: SPOKE-204, 205 and 206 `set_status done`; move SPOKE-207 under SPOKE-111 (Phase 2) with a note; then SPOKE-203 `Stage: Done`, stage `done`, `set_status done`; plan frontmatter `status: Done` with started/finished dates and a "What shipped" section.

## Stops

- Any step's verify command fails in a way that is not plainly a typo or formatting fix.
- A subagent reports a blocked or caveated step.
- The live Spokes server no longer returns `type`/`stage`, or returns values outside the lists above.
- `git merge --ff-only` is refused (main moved): stop and show why.

## What "go ahead" authorizes

- Create branch `feat/type-stage`, commit to it, and push it to `origin` (`ogl33t/spokes-view`).
- Open a PR on `ogl33t/spokes-view` and fast-forward merge it into `main`, then push `main`. This triggers `release.yml`, which publishes `latest` and `sha-<7>` images to GHCR.
- Delete the merged branch locally and on `origin`.
- Commit this plan (docs-only) to `main` and push.
- Spokes writes: stage/notes on SPOKE-203 to 207, `set_status done` on SPOKE-203 to 206, and moving SPOKE-207 under SPOKE-111.

Not authorized (stop and ask): release tags, any `ogl33t/stacks` commit, deployment, and changes to the Rust backend.

## Rollback

- Code: `git revert` the merge range on `main` and push. The next `latest` image rebuilds without it, and nothing deployed pins it.
- GHCR images: leave them (unpinned, harmless) or delete the `sha-<7>` version in the package settings.
- Spokes: `set_status open` on the nodes, and move SPOKE-207 back under SPOKE-203.

## Risks

- Data is sparse: almost no node has type/stage set yet (bk-flow writes `Stage:` lines into notes, not the field), so the new UI will look mostly empty until bk-flow sets the fields too.
- The stage board with closed nodes hidden shows few "done" cards. That is by design (Show closed loads them).
- Nine stage columns are wide on a phone; horizontal scroll is acceptable.

## What shipped

All five steps landed on `feat/type-stage` (version 0.5.0).

- **Step 1:** `NodeType`/`Stage` types and optional `type`/`stage` on `ViewNode`. `NODE_TYPES`, `STAGES`, `TYPE_LABEL`, `STAGE_LABEL`, `typeOf`, `stageOf` in `format.ts`. New `TypeStageChips.tsx` and `--t-*` colours, `.type-chip.t-*` and `.stage-chip` in `styles.css`.
- **Step 2:** Type and Stage rows in node details (before Priority), and chips after the `area` chip on Backlog rows and Kanban cards.
- **Step 3:** `RowFilter`/`NO_FILTER` in `backlog.ts`, with Type and Stage selects in the Backlog header.
- **Step 4:** `Grouping`, `GROUP_PARAM`, `groupingFrom`, `kanbanUrl(..., group)`, `Column {key,label,cards}`, and `buildBoard(..., group)` in `kanban.ts`. A "Group by" select in the Kanban header kept in the URL with `replaceState`.
- **Step 5:** README updated, and the version bumped to 0.5.0 in `Cargo.toml` and `Cargo.lock`.

Tested:
- `npm run lint`, `format:check`, `typecheck`, `test` (59 tests) and `build` pass.
- `cargo fmt --check`, `clippy -D warnings` and `cargo test` pass.
- Live check against `http://kdev3:10050` with headless Chromium, on the spokes-view node (SPOKE-109):
  - SPOKE-203 shows `feature`/`understood` chips on its Backlog row and Kanban card, and Type/Stage rows in the details modal.
  - Type=feature leaves only SPOKE-203. Stage="No stage" works, and clearing the filters restores the outline.
  - `&group=stage` with Show closed shows 9 columns, with SPOKE-203 under Understood and 18 cards under No stage.
  - The grouping survives a reload. Switching to Status removes `group` from the URL and shows the status columns.

Untested:
- Phone width with 9 columns. The CSS already scrolls the board sideways.
- Dark-mode colours of the new chips. The tests ran in light mode only.

Deviations:
- `backlog.ts` also exports `isFiltering(f)`.
- The Backlog "No matches" text is now "Nothing here matches the current filters." because the filter may be type or stage only.
- No `styles.css` change was needed for the stage board: `.board` already scrolls sideways.
- The Kanban status board's column dot is shown only for status grouping.
- The header selects use the browser's default select styling, as the plan asked: no new CSS.
