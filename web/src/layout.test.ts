import { describe, expect, it } from "vitest";
import { layoutRadial, type Layout } from "./layout";

/** A tree from a parent -> children table. */
function tree(table: Record<number, number[]>) {
  return (id: number): readonly number[] => table[id] ?? [];
}

/** Builds `fanout[0]` children under the root, each with `fanout[1]` children, ... */
function generated(fanout: number[]): Record<number, number[]> {
  const table: Record<number, number[]> = {};
  let next = 2;
  let level = [1];
  for (const f of fanout) {
    const nextLevel: number[] = [];
    for (const p of level) {
      const c: number[] = [];
      for (let i = 0; i < f; i++) c.push(next++);
      table[p] = c;
      nextLevel.push(...c);
    }
    level = nextLevel;
  }
  return table;
}

/** Smallest distance along the ring between neighbours on each ring. */
function minRingGap(l: Layout): number {
  const rings = new Map<number, number[]>();
  for (const n of l.nodes) {
    if (n.depth === 0) continue;
    let a = rings.get(n.depth);
    if (!a) rings.set(n.depth, (a = []));
    a.push(n.angle);
  }
  let min = Infinity;
  for (const [d, angles] of rings) {
    if (angles.length < 2) continue;
    angles.sort((a, b) => a - b);
    const r = l.radii[d] ?? 0;
    for (let i = 0; i < angles.length; i++) {
      const a = angles[i] ?? 0;
      const b = i + 1 < angles.length ? (angles[i + 1] ?? 0) : (angles[0] ?? 0) + Math.PI * 2;
      min = Math.min(min, (b - a) * r);
    }
  }
  return min;
}

const opts = { spacing: 20, ringGap: 100 };

describe("layoutRadial", () => {
  it("puts a lone root at the centre", () => {
    const l = layoutRadial(1, tree({}), opts);
    expect(l.nodes).toHaveLength(1);
    expect(l.nodes[0]).toMatchObject({ id: 1, depth: 0, x: 0, y: 0, childCount: 0 });
  });

  it("spreads three children evenly on the first ring, first one at the top", () => {
    const l = layoutRadial(1, tree({ 1: [2, 3, 4] }), opts);
    const [a, b, c] = [2, 3, 4].map((id) => l.byId.get(id));
    for (const n of [a, b, c]) {
      expect(n?.depth).toBe(1);
      expect(Math.hypot(n?.x ?? 0, n?.y ?? 0)).toBeCloseTo(100);
    }
    expect(b && a ? b.angle - a.angle : 0).toBeCloseTo((Math.PI * 2) / 3);
    expect(c && b ? c.angle - b.angle : 0).toBeCloseTo((Math.PI * 2) / 3);
    // Clockwise from the top: the first child's wedge starts at 12 o'clock.
    expect(a?.angle).toBeCloseTo(Math.PI / 3);
  });

  it("returns nodes in pre-order with parents and keeps sibling order", () => {
    const l = layoutRadial(1, tree({ 1: [2, 5], 2: [3, 4] }), opts);
    expect(l.nodes.map((n) => n.id)).toEqual([1, 2, 3, 4, 5]);
    expect(l.byId.get(3)?.parent).toBe(2);
    const angles = [3, 4].map((id) => l.byId.get(id)?.angle ?? 0);
    expect(angles[0]).toBeLessThan(angles[1] ?? 0);
  });

  it("keeps children inside their parent's wedge", () => {
    const table = generated([5, 4, 3]);
    const l = layoutRadial(1, tree(table), opts);
    for (const n of l.nodes) {
      if (n.parent === null || n.parent === 1) continue;
      const p = l.byId.get(n.parent);
      if (!p) throw new Error("missing parent");
      const lo = p.angle - p.span / 2 - 1e-9;
      const hi = p.angle + p.span / 2 + 1e-9;
      expect(n.angle).toBeGreaterThanOrEqual(lo);
      expect(n.angle).toBeLessThanOrEqual(hi);
    }
  });

  it("gives a big branch more angle than a lone leaf", () => {
    const table: Record<number, number[]> = { 1: [2, 3] };
    table[3] = Array.from({ length: 300 }, (_, i) => 100 + i);
    const l = layoutRadial(1, tree(table), opts);
    expect(l.byId.get(3)?.span ?? 0).toBeGreaterThan(5 * (l.byId.get(2)?.span ?? 0));
    expect(minRingGap(l)).toBeGreaterThanOrEqual(20 - 1e-6);
  });

  it("never puts two nodes on a ring closer than the spacing, even for thousands", () => {
    for (const fanout of [[10, 20, 15], [3000], [2, 2, 2, 2, 2, 2, 2, 2, 2, 2], [1, 1, 1, 4000]]) {
      const l = layoutRadial(1, tree(generated(fanout)), opts);
      expect(minRingGap(l)).toBeGreaterThanOrEqual(20 - 1e-6);
      // Rings are strictly outside each other.
      for (let d = 1; d < l.radii.length; d++) {
        expect(l.radii[d] ?? 0).toBeGreaterThanOrEqual((l.radii[d - 1] ?? 0) + 100 - 1e-6);
      }
    }
  });

  it("lays out a few thousand nodes quickly", () => {
    const table = generated([10, 30, 10]); // 3,311 nodes
    const t = performance.now();
    const l = layoutRadial(1, tree(table), opts);
    const ms = performance.now() - t;
    expect(l.nodes).toHaveLength(3311);
    expect(ms).toBeLessThan(200);
  });

  it("ignores a child listed twice instead of looping", () => {
    const l = layoutRadial(1, tree({ 1: [2, 2], 2: [1] }), opts);
    expect(l.nodes.map((n) => n.id)).toEqual([1, 2]);
  });

  it("is deterministic", () => {
    const t = tree(generated([4, 6]));
    expect(layoutRadial(1, t, opts).nodes).toEqual(layoutRadial(1, t, opts).nodes);
  });

  describe("maxSpread", () => {
    const capped = { ...opts, maxSpread: 60 };
    const table = { 1: [2, 3], 2: [4, 5, 6], 3: [7] };

    it("keeps siblings under a non-root parent close together", () => {
      const l = layoutRadial(1, tree(table), capped);
      const r = l.radii[2] ?? 0;
      const [a, b, c] = [4, 5, 6].map((id) => l.byId.get(id)?.angle ?? 0);
      const slack = 1e-9;
      expect(((b as number) - (a as number)) * r).toBeLessThanOrEqual(capped.maxSpread + slack);
      expect(((c as number) - (b as number)) * r).toBeLessThanOrEqual(capped.maxSpread + slack);
      // Without the cap they fan across the whole wedge.
      const free = layoutRadial(1, tree(table), opts);
      const fa = free.byId.get(4)?.angle ?? 0;
      const fb = free.byId.get(5)?.angle ?? 0;
      expect((fb - fa) * (free.radii[2] ?? 0)).toBeGreaterThan(capped.maxSpread);
    });

    it("keeps children inside the parent's wedge", () => {
      const l = layoutRadial(1, tree(generated([3, 3, 2])), capped);
      for (const n of l.nodes) {
        if (n.parent === null) continue;
        const p = l.byId.get(n.parent);
        if (!p || p.depth === 0) continue;
        expect(Math.abs(n.angle - p.angle) + n.span / 2).toBeLessThanOrEqual(p.span / 2 + 1e-9);
      }
    });

    it("still spreads the root's children around the full circle", () => {
      const l = layoutRadial(1, tree({ 1: [2, 3, 4] }), capped);
      const spans = [2, 3, 4].map((id) => l.byId.get(id)?.span ?? 0);
      expect(spans.reduce((x, y) => x + y, 0)).toBeCloseTo(Math.PI * 2, 9);
    });

    it("keeps the minimum ring gap", () => {
      const l = layoutRadial(1, tree(generated([4, 6, 3])), capped);
      expect(minRingGap(l)).toBeGreaterThanOrEqual(capped.spacing - 1e-6);
    });

    it("keeps a mid-level node's leaves about maxSpread apart, not packed at spacing", () => {
      const leaves = Array.from({ length: 12 }, (_, i) => 100 + i);
      const l = layoutRadial(1, tree({ 1: [2, 3, 4, 5], 2: [6], 6: leaves }), capped);
      const r = l.radii[3] ?? 0;
      const b = l.byId.get(6);
      const angles = leaves.map((id) => l.byId.get(id)?.angle ?? 0);
      for (let i = 1; i < angles.length; i++) {
        const gap = ((angles[i] as number) - (angles[i - 1] as number)) * r;
        expect(gap).toBeGreaterThan(capped.spacing + 1);
        expect(gap).toBeLessThanOrEqual(capped.maxSpread + 1e-6);
      }
      for (const id of leaves) {
        const n = l.byId.get(id);
        expect(
          Math.abs((n?.angle ?? 0) - (b?.angle ?? 0)) + (n?.span ?? 0) / 2,
        ).toBeLessThanOrEqual((b?.span ?? 0) / 2 + 1e-9);
      }
    });
  });
});
