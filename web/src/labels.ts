/**
 * Label placement on the radial tree: which centred inner labels fit without colliding, and
 * how much room the fit needs for the outward labels on the outermost ring.
 */

import type { Layout } from "./layout";

/** Average glyph width as a share of the font size, for estimating a label's width. */
export const CHAR_WIDTH = 0.56;

/** Estimated width of `chars` characters at font size `font` (same units as `font`). */
export function labelWidth(chars: number, font: number): number {
  return chars * font * CHAR_WIDTH;
}

/** A box competing for room: a label, or a node glyph that always keeps its place. */
export interface LabelBox {
  id: number;
  /** Left edge. */
  x: number;
  /** Top edge. */
  y: number;
  width: number;
  height: number;
  /** Lower is placed first; -1 marks a node glyph, which is always kept and blocks labels. */
  rank: number;
  /** A label that always shows, like a glyph: kept whatever it overlaps, and blocks others. */
  fixed?: boolean;
}

/**
 * Rank of an inner label: shallower nodes first, then the one with more beneath it.
 * Ties fall back to the id in `placeInnerLabels`.
 */
export function innerLabelRank(depth: number, descendants: number): number {
  return depth * 1e9 + (1e9 - 1 - Math.min(Math.max(0, descendants), 1e9 - 1));
}

function overlaps(a: LabelBox, b: LabelBox): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/**
 * Places labels in rank order (then by id), keeping each one only when its box overlaps no
 * box kept before it, no glyph (`rank: -1`) and no fixed label. Fixed labels are always
 * kept. Returns the ids of the labels kept (fixed ones included); glyphs are not in the
 * result. Boxes are bucketed in a grid so a few thousand stay cheap.
 */
export function placeInnerLabels(items: readonly LabelBox[]): Set<number> {
  const glyphs = items.filter((b) => b.rank < 0);
  const fixed = items.filter((b) => b.rank >= 0 && b.fixed);
  const labels = items
    .filter((b) => b.rank >= 0 && !b.fixed)
    .sort((a, b) => a.rank - b.rank || a.id - b.id);
  let cell = 1;
  for (const b of [...labels, ...fixed]) cell = Math.max(cell, b.width, b.height);
  const grid = new Map<string, LabelBox[]>();
  const cellsOf = (b: LabelBox): string[] => {
    const keys: string[] = [];
    const x0 = Math.floor(b.x / cell);
    const x1 = Math.floor((b.x + b.width) / cell);
    const y0 = Math.floor(b.y / cell);
    const y1 = Math.floor((b.y + b.height) / cell);
    for (let gx = x0; gx <= x1; gx++) for (let gy = y0; gy <= y1; gy++) keys.push(`${gx},${gy}`);
    return keys;
  };
  const add = (b: LabelBox) => {
    for (const key of cellsOf(b)) {
      const list = grid.get(key);
      if (list) list.push(b);
      else grid.set(key, [b]);
    }
  };
  const blocked = (b: LabelBox) =>
    cellsOf(b).some((key) => grid.get(key)?.some((o) => overlaps(b, o)) ?? false);

  glyphs.forEach(add);
  fixed.forEach(add);
  const kept = new Set<number>(fixed.map((b) => b.id));
  for (const b of labels) {
    if (blocked(b)) continue;
    add(b);
    kept.add(b.id);
  }
  return kept;
}

/** Room the fit leaves beyond the node bounds, screen px, for the outermost labels. */
export interface FitPadding {
  padX: number;
  padY: number;
}

/** Room added beyond the furthest label, px. */
const FIT_MARGIN = 12;
/** Share of each side the padding may take at most. */
const FIT_CAP = 0.4;

/**
 * Padding for fitting `layout` into a `w` × `h` viewport, north-up: how far the outward
 * labels of the leaves on the outermost ring reach past their nodes in x and y (label
 * length on screen, `labelPx(id)`, times the sine or cosine of its angle), plus 12px,
 * capped at 40% of each side.
 */
export function fitPadding(
  layout: Pick<Layout, "nodes">,
  labelPx: (id: number) => number,
  w: number,
  h: number,
): FitPadding {
  let outer = 0;
  for (const n of layout.nodes) outer = Math.max(outer, n.depth);
  let reachX = 0;
  let reachY = 0;
  for (const n of layout.nodes) {
    if (n.depth !== outer || n.depth === 0 || n.childCount > 0) continue;
    const len = labelPx(n.id);
    // Layout angle 0 points up: x runs with the sine, y with the cosine.
    reachX = Math.max(reachX, len * Math.abs(Math.sin(n.angle)));
    reachY = Math.max(reachY, len * Math.abs(Math.cos(n.angle)));
  }
  return {
    padX: Math.min(FIT_CAP * w, reachX + FIT_MARGIN),
    padY: Math.min(FIT_CAP * h, reachY + FIT_MARGIN),
  };
}

/**
 * Bounding box, layout units, of the node centres and the outward labels that show at zoom
 * `k`: each label runs `labelPx(id)` screen px (0 when hidden) out along its node's angle.
 */
export function labelledBounds(
  layout: Pick<Layout, "nodes">,
  k: number,
  labelPx: (id: number) => number,
): InkBounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const grow = (x: number, y: number) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  for (const n of layout.nodes) {
    grow(n.x, n.y);
    const len = labelPx(n.id) / k;
    // Layout angle 0 points up, growing clockwise.
    if (len > 0) grow(n.x + len * Math.sin(n.angle), n.y - len * Math.cos(n.angle));
  }
  if (minX === Infinity) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return { minX, minY, maxX, maxY };
}

/** Bounds, layout units, as `labelledBounds` returns them. */
export interface InkBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Whether `ink`, drawn at zoom `k`, fits a `w` × `h` viewport with 12px to spare each side. */
export function inkFits(ink: InkBounds, k: number, w: number, h: number): boolean {
  return (
    (ink.maxX - ink.minX) * k <= w - 2 * FIT_MARGIN &&
    (ink.maxY - ink.minY) * k <= h - 2 * FIT_MARGIN
  );
}

/**
 * Zoom for a fit whose outermost labels cannot all show inside the view, searched in
 * [`lo`, `hi`] where labels show at `hi` but not at `lo`: the largest zoom whose labelled
 * ink still `fits`, else the smallest zoom at which a label shows (the least overflow).
 */
export function overflowZoom(
  lo: number,
  hi: number,
  labelled: (k: number) => boolean,
  fits: (k: number) => boolean,
): number {
  let bottom = lo;
  let first = hi;
  for (let i = 0; i < 30 && first / bottom > 1.001; i++) {
    const mid = Math.sqrt(bottom * first);
    if (labelled(mid)) first = mid;
    else bottom = mid;
  }
  if (!fits(first)) return first;
  let best = first;
  let top = hi;
  if (fits(top)) return top;
  for (let i = 0; i < 30 && top / best > 1.001; i++) {
    const mid = Math.sqrt(best * top);
    if (fits(mid)) best = mid;
    else top = mid;
  }
  return best;
}
