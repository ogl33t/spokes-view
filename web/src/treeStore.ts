import type { Meta, TreeResponse, ViewNode } from "./types";

/**
 * Everything known about one server's tree, rebuilt from the loaded slices (the first
 * load, then each branch fetched on expand) in the order they were loaded.
 */
export interface Store {
  nodes: Map<number, ViewNode>;
  /** Known children of a node, in stored order. */
  children: Map<number, number[]>;
  /** Nodes whose visible children are all known (some slice had `children_loaded`). */
  complete: Set<number>;
  meta: Meta | null;
  /** Some slice was cut by the node cap. */
  truncated: boolean;
}

export const ROOT_ID = 1;

export function emptyStore(): Store {
  return {
    nodes: new Map(),
    children: new Map(),
    complete: new Set(),
    meta: null,
    truncated: false,
  };
}

/** Merges slices in order; a later slice's copy of a node wins. */
export function buildStore(slices: readonly TreeResponse[]): Store {
  const store = emptyStore();
  for (const slice of slices) {
    if (!store.meta) {
      store.meta = {
        rev: slice.rev,
        version: slice.version,
        time_zone: slice.time_zone,
        today: slice.today,
      };
    }
    store.truncated ||= slice.truncated;
    const byParent = new Map<number, number[]>();
    for (const n of slice.nodes) {
      store.nodes.set(n.id, n);
      if (n.parent !== null) {
        let list = byParent.get(n.parent);
        if (!list) byParent.set(n.parent, (list = []));
        list.push(n.id);
      }
    }
    for (const n of slice.nodes) {
      const present = byParent.get(n.id);
      if (n.children_loaded) {
        store.children.set(n.id, present ?? []);
        store.complete.add(n.id);
      } else if (present && present.length > 0 && !store.complete.has(n.id)) {
        // Only the slice root can arrive with part of its children (over the cap).
        store.children.set(n.id, present);
      }
    }
  }
  return store;
}

/** Children of `id` that are known. */
export function knownChildren(store: Store, id: number): readonly number[] {
  return store.children.get(id) ?? [];
}

/** True when expanding `id` needs a fetch first. */
export function needsFetch(store: Store, id: number): boolean {
  const n = store.nodes.get(id);
  if (!n || n.child_count === 0) return false;
  return !store.complete.has(id) && knownChildren(store, id).length === 0;
}

/** Visible children of `id` that could not be loaded (over the 2000-node cap). */
export function missingChildren(store: Store, id: number): number {
  const n = store.nodes.get(id);
  if (!n || store.complete.has(id)) return 0;
  const known = knownChildren(store, id).length;
  return known === 0 ? 0 : Math.max(0, n.child_count - known);
}

/** Ancestors of `id` known in the store, root first (not including `id`). */
export function ancestors(store: Store, id: number): number[] {
  const out: number[] = [];
  let cur = store.nodes.get(id)?.parent ?? null;
  const seen = new Set<number>();
  while (cur !== null && !seen.has(cur)) {
    seen.add(cur);
    out.push(cur);
    cur = store.nodes.get(cur)?.parent ?? null;
  }
  return out.reverse();
}

/**
 * The expansion after "Close others" on `id`: the root, the path down to `id`, and the
 * branches already open at or below `id`. Every other branch closes; nothing is fetched.
 */
export function closeOthers(store: Store, expanded: ReadonlySet<number>, id: number): Set<number> {
  const keep = new Set<number>([ROOT_ID, ...ancestors(store, id)]);
  const stack = [id];
  while (stack.length > 0) {
    const cur = stack.pop() as number;
    if (expanded.has(cur)) keep.add(cur);
    stack.push(...knownChildren(store, cur));
  }
  return keep;
}

/** Nodes to open at first load: fewer on a phone, where the graph is smaller. */
export function initialBudget(viewportWidth: number): number {
  return viewportWidth < 600 ? 60 : 150;
}

/**
 * The expansion to start with on a server's first load: open levels from the root down
 * while the number of drawn nodes stays at or under `budget`.
 */

export function initialExpansion(store: Store, budget = 150): Set<number> {
  const expanded = new Set<number>();
  if (!store.nodes.has(ROOT_ID)) return expanded;
  let visible = 1;
  let level = [ROOT_ID];
  while (level.length > 0) {
    const next: number[] = [];
    let added = 0;
    for (const id of level) {
      const kids = knownChildren(store, id);
      added += kids.length;
      next.push(...kids);
    }
    if (added === 0 || (visible + added > budget && expanded.size > 0)) break;
    for (const id of level) if (knownChildren(store, id).length > 0) expanded.add(id);
    visible += added;
    level = next;
  }
  return expanded;
}

/** What "Expand all" can open with what is loaded so far. */
export interface FullExpansion {
  /** Every node to open, walking down from the root while the drawn total fits `budget`. */
  expanded: Set<number>;
  /** Nodes that would be drawn but whose children still need a fetch. */
  pending: number[];
  /** Some branch was left closed because opening it would pass `budget`. */
  limited: boolean;
}

/**
 * Opens the whole known tree breadth-first, shallow levels first, stopping at `budget`
 * drawn nodes so a very large tree cannot freeze the page.
 */
export function fullExpansion(store: Store, budget: number): FullExpansion {
  const expanded = new Set<number>();
  const pending: number[] = [];
  let limited = false;
  if (!store.nodes.has(ROOT_ID)) return { expanded, pending, limited };
  let visible = 1;
  const queue = [ROOT_ID];
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i];
    if (id === undefined) continue;
    const kids = knownChildren(store, id);
    if (kids.length === 0) {
      if (needsFetch(store, id)) {
        if (visible >= budget) limited = true;
        else pending.push(id);
      }
      continue;
    }
    if (visible + kids.length > budget) {
      limited = true;
      continue;
    }
    expanded.add(id);
    visible += kids.length;
    queue.push(...kids);
  }
  return { expanded, pending, limited };
}
