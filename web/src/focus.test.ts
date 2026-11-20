import { describe, expect, it } from "vitest";
import { easeInOut, focusTarget, interpolateView, labelFlip, screenOf } from "./focus";
import type { FocusNode, View } from "./focus";

const centre = { x: 400, y: 300 };

/** A node on a ring of radius `radius` at layout angle `deg` (0 = up, clockwise). */
function nodeAt(deg: number, radius = 200, depth = 2): FocusNode {
  const angle = (deg * Math.PI) / 180;
  return { x: radius * Math.sin(angle), y: -radius * Math.cos(angle), angle, depth };
}

/** Screen direction of the node's spoke under `v`, degrees in [0, 360). */
function screenSpoke(v: View, n: FocusNode): number {
  const d = (n.angle * 180) / Math.PI - 90 + v.r;
  return ((d % 360) + 360) % 360;
}

describe("screenOf", () => {
  it("applies translate, rotate (clockwise) and scale", () => {
    const p = screenOf({ x: 10, y: 20, k: 2, r: 90 }, { x: 1, y: 0 });
    expect(p.x).toBeCloseTo(10);
    expect(p.y).toBeCloseTo(22);
  });
});

describe("focusTarget", () => {
  const from: View = { x: 0, y: 0, k: 0.3, r: 0 };

  it.each([10, 47, 135, 200, 290, 359])("puts a node at %d° at the centre, horizontal", (deg) => {
    const n = nodeAt(deg);
    const to = focusTarget(from, n, centre);
    const s = screenOf(to, n);
    expect(s.x).toBeCloseTo(centre.x);
    expect(s.y).toBeCloseTo(centre.y);
    const dir = screenSpoke(to, n);
    expect(Math.min(dir, Math.abs(dir - 180), 360 - dir)).toBeCloseTo(0);
  });

  it("takes the shorter turn, never more than 90°", () => {
    for (let deg = 0; deg < 360; deg += 7) {
      for (const r of [-400, -30, 0, 100, 720]) {
        const to = focusTarget({ ...from, r }, nodeAt(deg), centre);
        expect(Math.abs(to.r - r)).toBeLessThanOrEqual(90 + 1e-9);
      }
    }
  });

  it("does not turn for a node already horizontal", () => {
    expect(focusTarget(from, nodeAt(90), centre).r).toBeCloseTo(0);
    expect(focusTarget(from, nodeAt(270), centre).r).toBeCloseTo(0);
  });

  it("keeps the turn for the root", () => {
    const root: FocusNode = { x: 0, y: 0, angle: 0, depth: 0 };
    expect(focusTarget({ ...from, r: 33 }, root, centre).r).toBe(33);
  });

  it("zooms in between 1× and 2×, and leaves a deeper zoom alone", () => {
    expect(focusTarget({ ...from, k: 0.1 }, nodeAt(30), centre).k).toBe(1);
    expect(focusTarget({ ...from, k: 1 }, nodeAt(30), centre).k).toBeCloseTo(1.6);
    expect(focusTarget({ ...from, k: 1.5 }, nodeAt(30), centre).k).toBe(2);
    expect(focusTarget({ ...from, k: 3 }, nodeAt(30), centre).k).toBe(3);
  });
});

describe("interpolateView", () => {
  const from: View = { x: 50, y: 80, k: 0.5, r: 0 };
  const n = nodeAt(40);
  const to = focusTarget(from, n, centre);

  it("starts at the old view and ends at the new one", () => {
    const a = interpolateView(from, to, n, 0);
    const b = interpolateView(from, to, n, 1);
    for (const key of ["x", "y", "k", "r"] as const) {
      expect(a[key]).toBeCloseTo(from[key]);
      expect(b[key]).toBeCloseTo(to[key]);
    }
  });

  it("moves the node in a straight line on screen", () => {
    const a = screenOf(from, n);
    const mid = screenOf(interpolateView(from, to, n, 0.5), n);
    expect(mid.x).toBeCloseTo((a.x + centre.x) / 2);
    expect(mid.y).toBeCloseTo((a.y + centre.y) / 2);
  });
});

describe("easeInOut", () => {
  it("runs from 0 to 1 through the middle", () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(0.5)).toBeCloseTo(0.5);
    expect(easeInOut(1)).toBe(1);
    expect(easeInOut(2)).toBe(1);
  });
});

describe("labelFlip", () => {
  it("matches the unrotated rule: flipped on the left half", () => {
    expect(labelFlip(Math.PI / 2, 0)).toBe(false);
    expect(labelFlip((3 * Math.PI) / 2, 0)).toBe(true);
  });

  it("follows the turn", () => {
    // Pointing right in the layout, turned half round: now points left, so flipped.
    expect(labelFlip(Math.PI / 2, 180)).toBe(true);
    expect(labelFlip((3 * Math.PI) / 2, -180)).toBe(false);
    expect(labelFlip(Math.PI / 2, -720)).toBe(false);
  });
});
