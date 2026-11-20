---
status: Planned
spoke: SPOKE-138
started:
finished:
summary: Backlog page (indented, filterable list of a spoke's descendants) from the right-click menu; Kanban and Backlog become plain same-tab links.
---

# Backlog view, and Kanban/Backlog as plain links

Gates skipped: Brandon started this with the `/goal` stop hook ("do not pause to ask"),
treated as "just do it". Outward actions are limited to the list below.

## Goal

A Backlog page lists every node beneath a spoke as an indented outline, so the tree can be
scanned and navigated without the radial graph. It opens from the graph's right-click menu
(like View Kanban), from the details panel/modal, and from a **Backlog** link in the graph
header (the whole tree, root `SPOKE-1`). Kanban and Backlog are ordinary `<a href>` links:
a click navigates in the same tab, Cmd/middle-click or "Open in new tab" opens a tab.

## Design

- **Route:** `/?server=<name>&backlog=<id>`; `main.tsx` picks `BacklogApp` when `backlog`
  is present, as it does for `kanban`. No backend change.
- **Shared loading:** the slice fetch, ETag refresh (30 s, visible tab only), closed toggle
  and node-detail loading move out of `KanbanApp` into a hook `useSubtree(server, rootId)`
  in `web/src/useSubtree.ts`, used by both pages.
- **Rows:** `web/src/backlog.ts` `buildOutline(slice)` returns the descendants in tree order
  (siblings by Spokes order: ordered parents keep the slice's order, otherwise priority,
  focus, due, id as on the board), each with its depth. `visibleRows(outline, collapsed,
  filter)` hides collapsed branches and, with a filter (title substring, case-insensitive, or
  `SPOKE-N`/`N`), keeps matching rows plus their ancestors.
- **Row:** indent, expand/collapse toggle, status dot, title, `SPOKE-N`, area badge,
  priority chip, markers, progress or child count. Click opens `NodeModal`.
- **Links:** `ContextMenu` items take either `onPick` or `href` (rendered as `<a
  role="menuitem">`). Graph menu, side panel and both modals use `href` links built by
  `kanbanUrl` / `backlogUrl`; no `window.open`, no `target="_blank"`, no `↗`. Each page's
  header links to the other view of the same root.

## Steps

All in `web/src/`, done in order in one branch `feat/backlog-view` (small, tightly coupled).

1. **Pure outline logic** — `backlog.ts` + `backlog.test.ts`: `backlogUrl`,
   `backlogRootFrom`, `buildOutline`, `visibleRows`. Verify: `cd web && npm test`.
2. **Shared hook** — `useSubtree.ts`; `KanbanApp` uses it with no behaviour change.
   Verify: `npm run typecheck && npm run lint`.
3. **Backlog page** — `BacklogApp.tsx`, route in `main.tsx`, styles in `styles.css`.
4. **Links** — `ContextMenu` `href` items; `App.tsx` menu gets View Backlog + View Kanban
   links, header gets a Backlog link; `DetailPanel` and both modals use links.
5. **Docs/version** — README Backlog + Kanban wording, version 0.3.0 (`Cargo.toml`,
   `Cargo.lock`).
6. **Verify** — `npm run lint && npm run format:check && npm run typecheck && npm test &&
   npm run build`, `cargo test --locked`, and a headless Chromium run against the LAN
   Spokes server: right-click → View Backlog navigates in the same tab, Back returns,
   filter/collapse work, row opens the modal, Kanban link navigates in the same tab.

## Stops

- A check that fails and is not plainly fixable; the LAN Spokes server unreachable.

## What "go ahead" authorizes

- Commit this plan to `main` and push (docs-only).
- Push branch `feat/backlog-view` and open a PR on `ogl33t/spokes-view`.
- Not authorized: merging, tagging, publishing an image, changing `ogl33t/stacks`.

## Rollback

- Close the PR and delete the branch; revert the plan commit if dropped.

## Risks

- A whole-tree backlog is one slice of 10 levels; past the Spokes node cap it is truncated
  and says so.
