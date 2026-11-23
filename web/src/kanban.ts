import { STAGE_LABEL, STAGES, stageOf, STATUS_LABEL } from "./format";
import type { Crumb, Status, TreeResponse, ViewNode } from "./types";

/** URL parameter that turns the page into a kanban board of one node's descendants. */
export const KANBAN_PARAM = "kanban";

/** URL parameter that picks what the board's columns are. */
export const GROUP_PARAM = "group";

/** What the board's columns stand for. */
export type Grouping = "status" | "stage";

/** The grouping from a query string: stage only for `group=stage`, status otherwise. */
export function groupingFrom(search: string): Grouping {
  return new URLSearchParams(search).get(GROUP_PARAM) === "stage" ? "stage" : "status";
}

/** The page that shows `id`'s descendants on `server` as a kanban board. */
export function kanbanUrl(server: string, id: number, group?: Grouping): string {
  const q = new URLSearchParams({ server, [KANBAN_PARAM]: String(id) });
  if (group === "stage") q.set(GROUP_PARAM, "stage");
  return `/?${q.toString()}`;
}

/** The board's root id from a query string, or null when the page is the graph. */
export function kanbanRootFrom(search: string): number | null {
  const raw = new URLSearchParams(search).get(KANBAN_PARAM);
  if (raw === null) return null;
  const id = Number(raw.replace(/^SPOKE-/i, ""));
  return Number.isInteger(id) && id > 0 ? id : null;
}

export interface Card {
  node: ViewNode;
  /** Titles from the board's root (exclusive) down to the card's parent (inclusive). */
  path: Crumb[];
}

export interface Column {
  /** A status, a stage, or "none" for nodes without a stage. */
  key: string;
  label: string;
  cards: Card[];
}

const OPEN_COLUMNS: readonly Status[] = ["open", "in_progress", "waiting"];
const CLOSED_COLUMNS: readonly Status[] = ["done", "dropped"];

/** Columns shown, left to right. */
export function columnsFor(includeClosed: boolean): readonly Status[] {
  return includeClosed ? [...OPEN_COLUMNS, ...CLOSED_COLUMNS] : OPEN_COLUMNS;
}

/** No value sorts after every value. */
function nullsLast(a: number | string | null, b: number | string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -1 : 1;
}

/** Most pressing first: priority, focus rank, due date, then oldest id. */
export function compareCards(a: Card, b: Card): number {
  return compareNodes(a.node, b.node);
}

/** Most pressing first: priority, focus rank, due date, then oldest id. */
export function compareNodes(x: ViewNode, y: ViewNode): number {
  return (
    nullsLast(x.effective_priority, y.effective_priority) ||
    nullsLast(x.focus, y.focus) ||
    nullsLast(x.due, y.due) ||
    x.id - y.id
  );
}

/**
 * Every node beneath the slice's root, in one column per status, each with its path
 * below the root so a flattened card still says where it lives.
 */
export function buildBoard(
  slice: TreeResponse,
  includeClosed: boolean,
  group: Grouping = "status",
): Column[] {
  const byId = new Map(slice.nodes.map((n) => [n.id, n]));
  /** The path below the root, or null when `n` is not beneath the root. */
  const pathOf = (n: ViewNode): Crumb[] | null => {
    const out: Crumb[] = [];
    const seen = new Set<number>();
    let cur = n.parent;
    while (cur !== slice.root) {
      if (cur === null || seen.has(cur)) return null;
      seen.add(cur);
      const p = byId.get(cur);
      if (!p) return null;
      out.push({ id: p.id, title: p.title });
      cur = p.parent;
    }
    return out.reverse();
  };
  const columns: Column[] =
    group === "stage"
      ? [
          ...STAGES.map((s) => ({ key: s, label: STAGE_LABEL[s], cards: [] as Card[] })),
          { key: "none", label: "No stage", cards: [] as Card[] },
        ]
      : columnsFor(includeClosed).map((s) => ({
          key: s,
          label: STATUS_LABEL[s],
          cards: [] as Card[],
        }));
  const byKey = new Map(columns.map((c) => [c.key, c]));
  const keyOf = (n: ViewNode): string => (group === "stage" ? (stageOf(n) ?? "none") : n.status);
  for (const n of slice.nodes) {
    if (n.id === slice.root) continue;
    const path = pathOf(n);
    if (path) byKey.get(keyOf(n))?.cards.push({ node: n, path });
  }
  for (const c of columns) c.cards.sort(compareCards);
  return columns;
}
