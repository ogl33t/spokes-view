import { compareNodes } from "./kanban";
import type { TreeResponse, ViewNode } from "./types";

/** URL parameter that turns the page into a backlog list of one node's descendants. */
export const BACKLOG_PARAM = "backlog";

/** The page that lists `id`'s descendants on `server` as a backlog. */
export function backlogUrl(server: string, id: number): string {
  const q = new URLSearchParams({ server, [BACKLOG_PARAM]: String(id) });
  return `/?${q.toString()}`;
}

/** The backlog's root id from a query string, or null when the page is not a backlog. */
export function backlogRootFrom(search: string): number | null {
  const raw = new URLSearchParams(search).get(BACKLOG_PARAM);
  if (raw === null) return null;
  const id = Number(raw.replace(/^SPOKE-/i, ""));
  return Number.isInteger(id) && id > 0 ? id : null;
}

export interface Row {
  node: ViewNode;
  /** 0 for the root's children. */
  depth: number;
  /** Ancestor ids below the root, nearest last. */
  ancestors: number[];
  /** Whether any of the node's children are in the slice. */
  hasRows: boolean;
}

/**
 * Every node beneath the slice's root in tree order. Siblings under an ordered parent keep
 * Spokes' step order; other siblings go most pressing first, as on the kanban board.
 */
export function buildOutline(slice: TreeResponse): Row[] {
  const kids = new Map<number, ViewNode[]>();
  const byId = new Map(slice.nodes.map((n) => [n.id, n]));
  for (const n of slice.nodes) {
    if (n.parent === null || n.id === slice.root) continue;
    const list = kids.get(n.parent);
    if (list) list.push(n);
    else kids.set(n.parent, [n]);
  }
  const out: Row[] = [];
  const seen = new Set<number>();
  const walk = (parent: number, depth: number, ancestors: number[]) => {
    const list = [...(kids.get(parent) ?? [])];
    if (!byId.get(parent)?.ordered) list.sort(compareNodes);
    for (const n of list) {
      if (seen.has(n.id)) continue;
      seen.add(n.id);
      out.push({ node: n, depth, ancestors, hasRows: (kids.get(n.id)?.length ?? 0) > 0 });
      walk(n.id, depth + 1, [...ancestors, n.id]);
    }
  };
  walk(slice.root, 0, []);
  return out;
}

/** True when `n` matches a filter: a title substring, or its id as `SPOKE-N` or `N`. */
export function matches(n: ViewNode, filter: string): boolean {
  const f = filter.trim().toLowerCase();
  if (f === "") return true;
  const id = /^(?:spoke-)?(\d+)$/.exec(f);
  if (id && Number(id[1]) === n.id) return true;
  return n.title.toLowerCase().includes(f);
}

/**
 * The rows to draw. Rows inside a collapsed branch are hidden. With a filter, only matches
 * and their ancestors show, and collapsed branches open so no match is hidden.
 */
export function visibleRows(rows: Row[], collapsed: ReadonlySet<number>, filter: string): Row[] {
  if (filter.trim() === "") {
    return rows.filter((r) => !r.ancestors.some((a) => collapsed.has(a)));
  }
  const keep = new Set<number>();
  for (const r of rows) {
    if (!matches(r.node, filter)) continue;
    keep.add(r.node.id);
    for (const a of r.ancestors) keep.add(a);
  }
  return rows.filter((r) => keep.has(r.node.id));
}
