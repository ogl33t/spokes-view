import type { ViewNode } from "./types";

/** The next actions, every ancestor of each that is present, and the root. */
export function nextOnlyKeep(nodes: Iterable<ViewNode>, rootId: number): Set<number> {
  const byId = new Map<number, ViewNode>();
  for (const n of nodes) byId.set(n.id, n);
  const keep = new Set<number>([rootId]);
  for (const n of byId.values()) {
    if (!n.is_next) continue;
    let cur: ViewNode | undefined = n;
    while (cur && !keep.has(cur.id)) {
      keep.add(cur.id);
      cur = cur.parent === null ? undefined : byId.get(cur.parent);
    }
  }
  return keep;
}
