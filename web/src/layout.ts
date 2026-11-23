/**
 * Hand-written radial tree layout ("spokes"): the root in the centre, each level on a
 * ring further out.
 *
 * 1. Ring radii grow with depth, and a crowded ring is pushed out until its nodes fit
 *    side by side (`nodes on the ring * spacing <= circumference`).
 * 2. Each node needs an angle: `spacing / radius` for itself, or the sum of what its
 *    children need, whichever is larger. If the root needs more than a full turn, every
 *    radius is scaled up by the same factor (which shrinks every need by it).
 * 3. Angles are handed out top-down: a child gets a share of its parent's wedge in
 *    proportion to its need, and sits in the middle of its share. Spare angle is spread
 *    the same way, so small trees fill the circle. Below the root, a child's share is
 *    capped at its comfortable width: `maxSpread` of arc per leaf, summed up the branch
 *    (never less than its need). The run of children is centred in the parent's wedge, so a
 *    few leaves stay grouped under their parent.
 *
 * Wedges of nodes on one ring never overlap, so two nodes on the same ring are always at
 * least `spacing` apart along the ring. Cost is linear in the number of visible nodes.
 */

export interface LayoutOptions {
  /** Least distance between neighbouring nodes on a ring (layout units). */
  spacing: number;
  /** Least distance between rings. */
  ringGap: number;
  /**
   * Comfortable arc length per leaf (layout units, on its own ring). Below the root, a
   * child's share is capped at its comfortable width: `maxSpread` of arc per leaf, summed
   * up the branch. Unset means no cap.
   */
  maxSpread?: number;
}

export interface NodePos {
  id: number;
  parent: number | null;
  depth: number;
  x: number;
  y: number;
  /** Radians, 0 = pointing up, growing clockwise. */
  angle: number;
  /** Width of the node's wedge, radians. */
  span: number;
  /** Arc length of the wedge at the node's ring: room for a label sideways. */
  room: number;
  /** Visible children (0 for a leaf). */
  childCount: number;
}

export interface Layout {
  /** Nodes in pre-order (a parent before its children). */
  nodes: NodePos[];
  byId: Map<number, NodePos>;
  radii: number[];
  /** Bounding box of node centres. */
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

export const DEFAULT_LAYOUT: LayoutOptions = { spacing: 22, ringGap: 190, maxSpread: 66 };

const TAU = Math.PI * 2;

export function layoutRadial(
  rootId: number,
  childrenOf: (id: number) => readonly number[],
  options: LayoutOptions = DEFAULT_LAYOUT,
): Layout {
  const { spacing, ringGap, maxSpread } = options;

  // Pre-order walk (iterative, so a very deep chain cannot overflow the stack).
  const order: number[] = [];
  const depthOf = new Map<number, number>();
  const parentOf = new Map<number, number | null>();
  const kids = new Map<number, readonly number[]>();
  const stack: number[] = [rootId];
  depthOf.set(rootId, 0);
  parentOf.set(rootId, null);
  while (stack.length > 0) {
    const id = stack.pop() as number;
    order.push(id);
    const d = depthOf.get(id) ?? 0;
    const c: number[] = [];
    for (const k of childrenOf(id)) {
      if (depthOf.has(k)) continue; // a repeat or a cycle: draw each node once
      depthOf.set(k, d + 1);
      parentOf.set(k, id);
      c.push(k);
    }
    kids.set(id, c);
    for (let i = c.length - 1; i >= 0; i--) stack.push(c[i] as number);
  }

  // 1. Radii.
  const perDepth: number[] = [];
  for (const id of order) {
    const d = depthOf.get(id) ?? 0;
    perDepth[d] = (perDepth[d] ?? 0) + 1;
  }
  const radii: number[] = [0];
  for (let d = 1; d < perDepth.length; d++) {
    const crowded = ((perDepth[d] ?? 0) * spacing) / TAU;
    radii[d] = Math.max((radii[d - 1] ?? 0) + ringGap, crowded);
  }

  // 2. Needs, bottom-up (reverse pre-order visits children before parents).
  const need = new Map<number, number>();
  for (let i = order.length - 1; i >= 0; i--) {
    const id = order[i] as number;
    const d = depthOf.get(id) ?? 0;
    let sum = 0;
    for (const k of kids.get(id) ?? []) sum += need.get(k) ?? 0;
    const own = d === 0 ? 0 : spacing / (radii[d] ?? 1);
    need.set(id, Math.max(own, sum));
  }
  const total = need.get(rootId) ?? 0;
  if (total > TAU) {
    const scale = total / TAU;
    for (let d = 0; d < radii.length; d++) radii[d] = (radii[d] ?? 0) * scale;
    for (const [id, v] of need) need.set(id, v / scale);
  }

  // Comfortable widths, bottom-up, on the final radii.
  const comfy = new Map<number, number>();
  if (maxSpread !== undefined) {
    for (let i = order.length - 1; i >= 0; i--) {
      const id = order[i] as number;
      const d = depthOf.get(id) ?? 0;
      let sum = 0;
      for (const k of kids.get(id) ?? []) sum += comfy.get(k) ?? 0;
      const own = d === 0 ? 0 : maxSpread / (radii[d] ?? 1);
      comfy.set(id, Math.max(own, need.get(id) ?? 0, sum));
    }
  }

  // 3. Angles, top-down.
  const start = new Map<number, number>([[rootId, 0]]);
  const span = new Map<number, number>([[rootId, TAU]]);
  const nodes: NodePos[] = [];
  const byId = new Map<number, NodePos>();
  let minX = 0,
    minY = 0,
    maxX = 0,
    maxY = 0;
  for (const id of order) {
    const d = depthOf.get(id) ?? 0;
    const s = start.get(id) ?? 0;
    const w = span.get(id) ?? 0;
    const c = kids.get(id) ?? [];
    let sum = 0;
    for (const k of c) sum += need.get(k) ?? 0;
    const shares = c.map((k) => {
      const proportional = sum > 0 ? (w * (need.get(k) ?? 0)) / sum : w / c.length;
      if (d === 0 || maxSpread === undefined) return proportional;
      return Math.min(proportional, comfy.get(k) ?? proportional);
    });
    let used = 0;
    for (const share of shares) used += share;
    let at = s + (w - used) / 2;
    c.forEach((k, i) => {
      const share = shares[i] as number;
      start.set(k, at);
      span.set(k, share);
      at += share;
    });
    const angle = d === 0 ? 0 : s + w / 2;
    const r = radii[d] ?? 0;
    const x = r === 0 ? 0 : r * Math.sin(angle);
    const y = r === 0 ? 0 : -r * Math.cos(angle);
    const pos: NodePos = {
      id,
      parent: parentOf.get(id) ?? null,
      depth: d,
      x,
      y,
      angle,
      span: w,
      room: d === 0 ? Infinity : w * r,
      childCount: c.length,
    };
    nodes.push(pos);
    byId.set(id, pos);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { nodes, byId, radii, bounds: { minX, minY, maxX, maxY } };
}
