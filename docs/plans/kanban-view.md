---
status: Done
spoke: SPOKE-115
started: 2026-11-19
finished: 2026-11-19
summary: Right-click "View Kanban" opens a new tab with a status-column board of a spoke's descendants, cards open a details modal.
---

# Kanban view of a spoke's descendants

## Goal

From the radial graph, right-click a node and pick **View Kanban**. A new browser tab
opens a kanban board of every descendant of that node (children, grandchildren, ... up
to the API's depth limit of 10), one column per status. Clicking a card opens the
node's details in a modal.

## Design

- **Route:** no backend change. The new tab is `/?server=<name>&kanban=<id>`; `main.tsx`
  renders `KanbanApp` when `kanban` is present, otherwise the graph `App`. The Rust
  asset router already serves `index.html` at `/`.
- **Data:** one `fetchTree(server, { root: id, depth: 10, includeClosed })`. Every node
  except the root becomes a card. A truncated slice (over the Spokes node cap) shows a
  notice. Refresh button plus 30-second auto-refresh with the slice's ETag (304s cost
  nothing), as in the graph view.
- **Columns:** Open, In progress, Waiting, then Done and Dropped only with "Show closed".
  Cards are ordered by effective priority, then focus rank, then due date, then id.
- **Card:** title, `SPOKE-N`, the path from the board's root to the card's parent,
  kind badge for areas, priority, markers (`format.markers`), child progress.
- **Modal:** the detail body (breadcrumb, fields, notes, events) is extracted from
  `DetailPanel` into a shared `NodeDetails` component, used by the side panel and by a
  `<dialog>`-based modal. Escape, the close button and a backdrop click close it.
  Crumbs inside the modal open that node in the modal. The modal offers "View Kanban"
  for nodes with children.
- **Context menu:** `Graph` handles `contextmenu` on a node and shows a small menu at the
  pointer with **View Kanban** (only for nodes with children) and **Show details**.
  Escape, a click elsewhere or scrolling closes it. The side panel also gets a
  "View Kanban" button so touch and keyboard users can reach it.

## Steps

All steps touch `web/src/` and run in order (each builds on the previous one).

1. **Pure board logic** — `web/src/kanban.ts` + `kanban.test.ts`: `kanbanUrl(server, id)`,
   `buildBoard(slice, includeClosed)` returning columns with ordered cards and each
   card's relative path. Verify: `cd web && npm test`.
2. **Shared details** — extract `NodeDetails` from `DetailPanel.tsx`; `DetailPanel` keeps
   its behaviour. Add `NodeModal.tsx`. Verify: `npm run typecheck && npm run lint`.
3. **Board page** — `KanbanApp.tsx`, route in `main.tsx`, styles in `styles.css`.
4. **Graph context menu** — `Graph.tsx` `onContextMenu` prop and menu, wired in `App.tsx`;
   "View Kanban" button in the side panel.
5. **Verify** — `npm run lint && npm run format:check && npm run typecheck && npm test &&
   npm run build`, `cargo test --locked`, and a manual check against a running server.

## What shipped

All five steps, in one branch (`feat/kanban-view`), implemented in the main session rather
than through `plan-executor`: the steps were small and tightly coupled.

- Deviation: `buildBoard` keeps only nodes whose parent chain reaches the board's root
  (a unit test caught ancestors leaking onto the board).
- Added `ContextMenu.tsx` (Escape, outside press, wheel, resize or blur close it; arrow
  keys move between items; Shift+F10 / the menu key open it on a focused node).
- The graph's context menu also offers **Show details** and **Expand / Collapse branch**.
- Verified: ESLint, Prettier, `tsc`, Vitest (27 tests), Vite build, `cargo test`,
  `cargo clippy`, and a headless Chromium run against the LAN Spokes 0.3.0 server:
  right-click SPOKE-5 → View Kanban opened `/?server=Home&kanban=5` in a new tab, the
  board drew 9 cards, a card opened the modal with notes and events, Escape closed it,
  and the 390 px phone layout stacks the columns.

Merged to main as f84c7e9 (fast-forward, PR ogl33t/spokes-view#1), version 0.2.0.
