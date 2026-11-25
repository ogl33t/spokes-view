import { ROOT_ID, type Store } from "./treeStore";

export const AREA_SLOTS = 6;

/** Slot (1..6, cycling) for a position among the root's area children. */
export function slotAt(index: number): number {
  return (index % AREA_SLOTS) + 1;
}

/** Colour slot of each of the root's area children, in child order. */
export function areaSlots(store: Store): Map<number, number> {
  const slots = new Map<number, number>();
  let index = 0;
  for (const id of store.children.get(ROOT_ID) ?? []) {
    if (store.nodes.get(id)?.kind !== "area") continue;
    slots.set(id, slotAt(index++));
  }
  return slots;
}

/** The depth-1 ancestor of `id` (or `id` itself at depth 1); null for the root or unknown. */
export function areaOf(store: Store, id: number): number | null {
  let cur = store.nodes.get(id);
  const seen = new Set<number>();
  while (cur && cur.parent !== null && !seen.has(cur.id)) {
    if (cur.parent === ROOT_ID) return cur.id;
    seen.add(cur.id);
    cur = store.nodes.get(cur.parent);
  }
  return null;
}
