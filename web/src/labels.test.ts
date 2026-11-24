import { describe, expect, it } from "vitest";
import { fitPadding, innerLabelRank, labelledBounds, labelWidth, placeInnerLabels } from "./labels";
import type { LabelBox } from "./labels";
import type { NodePos } from "./layout";

function box(id: number, x: number, y: number, rank: number, width = 40, height = 10): LabelBox {
  return { id, x, y, width, height, rank };
}

describe("labelWidth", () => {
  it("estimates characters times font times 0.56", () => {
    expect(labelWidth(10, 10)).toBeCloseTo(56);
  });
});

describe("innerLabelRank", () => {
  it("puts shallower nodes first, then the larger subtree", () => {
    expect(innerLabelRank(1, 0)).toBeLessThan(innerLabelRank(2, 500));
    expect(innerLabelRank(2, 500)).toBeLessThan(innerLabelRank(2, 3));
  });
});

describe("placeInnerLabels", () => {
  it("keeps labels that do not overlap", () => {
    const kept = placeInnerLabels([box(1, 0, 0, 0), box(2, 100, 0, 0), box(3, 0, 50, 0)]);
    expect([...kept].sort()).toEqual([1, 2, 3]);
  });

  it("drops the later of two overlapping labels", () => {
    const kept = placeInnerLabels([box(1, 0, 0, 0), box(2, 20, 5, 1)]);
    expect([...kept]).toEqual([1]);
  });

  it("places in rank order, not input order", () => {
    const kept = placeInnerLabels([box(1, 0, 0, 5), box(2, 20, 5, 1)]);
    expect([...kept]).toEqual([2]);
  });

  it("breaks rank ties by id", () => {
    const kept = placeInnerLabels([box(9, 0, 0, 3), box(4, 20, 5, 3)]);
    expect([...kept]).toEqual([4]);
  });

  it("does not count touching edges as overlap", () => {
    const kept = placeInnerLabels([box(1, 0, 0, 0), box(2, 40, 0, 1)]);
    expect(kept.size).toBe(2);
  });

  it("lets a glyph block a label, whatever its rank", () => {
    const kept = placeInnerLabels([box(1, 0, 0, 0), box(7, 10, 2, -1, 8, 8)]);
    expect(kept.size).toBe(0);
  });

  it("always keeps a fixed label, even over a higher-ranked label or a glyph", () => {
    const fixed = { ...box(2, 20, 5, 1), fixed: true };
    const kept = placeInnerLabels([box(1, 0, 0, 0), fixed, box(7, 25, 6, -1, 8, 8)]);
    expect([...kept]).toEqual([2]);
  });

  it("lets a fixed label block lower-ranked labels", () => {
    const fixed = { ...box(1, 0, 0, 5), fixed: true };
    const kept = placeInnerLabels([fixed, box(2, 20, 5, 6), box(3, 100, 0, 7)]);
    expect([...kept].sort()).toEqual([1, 3]);
  });

  it("keeps a chain where only alternate labels collide", () => {
    // 1 and 3 are clear of each other; 2 overlaps both and ranks last.
    const kept = placeInnerLabels([box(1, 0, 0, 0), box(2, 30, 0, 2), box(3, 60, 0, 1)]);
    expect([...kept].sort()).toEqual([1, 3]);
  });
});

/** A leaf on a ring of radius `radius` at layout angle `deg` (0 = up, clockwise). */
function leaf(id: number, deg: number, radius = 200): NodePos {
  const angle = (deg * Math.PI) / 180;
  return {
    id,
    parent: 0,
    depth: 1,
    x: radius * Math.sin(angle),
    y: -radius * Math.cos(angle),
    angle,
    span: Math.PI / 2,
    room: (Math.PI / 2) * radius,
    childCount: 0,
  };
}

const root: NodePos = {
  id: 0,
  parent: null,
  depth: 0,
  x: 0,
  y: 0,
  angle: 0,
  span: Math.PI * 2,
  room: Infinity,
  childCount: 4,
};

describe("fitPadding", () => {
  const layout = { nodes: [root, leaf(1, 0), leaf(2, 90), leaf(3, 180), leaf(4, 270)] };

  it("pads by the furthest label reach plus 12px", () => {
    // Up and down labels are 50px, left and right ones 100px and 80px.
    const px = new Map([
      [1, 50],
      [2, 100],
      [3, 30],
      [4, 80],
    ]);
    const pad = fitPadding(layout, (id) => px.get(id) ?? 0, 1440, 900);
    expect(pad.padX).toBeCloseTo(112);
    expect(pad.padY).toBeCloseTo(62);
  });

  it("caps the padding at 40% of each side", () => {
    const pad = fitPadding(layout, () => 1000, 400, 300);
    expect(pad.padX).toBeCloseTo(160);
    expect(pad.padY).toBeCloseTo(120);
  });

  it("only measures leaves on the outermost ring", () => {
    const inner = { ...leaf(5, 90, 100), depth: 1 };
    const outer = { ...leaf(6, 0, 300), depth: 2 };
    const pad = fitPadding(
      { nodes: [root, inner, outer] },
      (id) => (id === 5 ? 500 : 40),
      1440,
      900,
    );
    expect(pad.padX).toBeCloseTo(12);
    expect(pad.padY).toBeCloseTo(52);
  });
});

describe("labelledBounds", () => {
  const layout = { nodes: [root, leaf(1, 0), leaf(2, 90), leaf(3, 180), leaf(4, 270)] };

  it("adds each shown label's reach, in layout units, along its angle", () => {
    // At k = 0.5, 50px on screen is 100 layout units; leaf 4 (left) has no label.
    const px = new Map([
      [1, 50],
      [2, 25],
      [3, 0],
    ]);
    const ink = labelledBounds(layout, 0.5, (id) => px.get(id) ?? 0);
    expect(ink.minX).toBeCloseTo(-200);
    expect(ink.maxX).toBeCloseTo(250);
    expect(ink.minY).toBeCloseTo(-300);
    expect(ink.maxY).toBeCloseTo(200);
  });

  it("is the node bounds when no label shows", () => {
    const ink = labelledBounds(layout, 1, () => 0);
    expect([ink.minX, ink.minY, ink.maxX, ink.maxY].map(Math.round)).toEqual([
      -200, -200, 200, 200,
    ]);
  });
});
