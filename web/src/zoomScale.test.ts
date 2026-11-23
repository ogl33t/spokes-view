import { describe, expect, it } from "vitest";
import { glyphScale, onScreenGrowth } from "./zoomScale";

describe("onScreenGrowth", () => {
  it("is 1 at 1x and below", () => {
    expect(onScreenGrowth(1)).toBe(1);
    expect(onScreenGrowth(0.3)).toBe(1);
  });

  it("is about 1.741 at 4x", () => {
    expect(onScreenGrowth(4)).toBeCloseTo(1.741, 3);
  });
});

describe("glyphScale", () => {
  it("grows glyphs and labels on screen by the same factor past 1x", () => {
    for (const k of [1, 1.5, 2, 3, 4]) {
      expect(glyphScale(k, 30, 8) * k).toBeCloseTo(onScreenGrowth(k), 10);
    }
  });

  it("matches the old formula when zoomed out", () => {
    for (const k of [0.05, 0.2, 0.5, 0.99]) {
      const cases: [number, number][] = [
        [30, 8],
        [5, 8],
        [100, 3],
      ];
      for (const [room, r] of cases) {
        const old = Math.max(1, Math.min(1 / Math.min(k, 1), 2.5, (0.4 * room) / r));
        expect(glyphScale(k, room, r)).toBe(old);
      }
    }
  });
});
