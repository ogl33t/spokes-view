/** How fast glyphs and labels grow on screen once zoomed in past 1x (exponent of k). */
export const ZOOM_GROW = 0.4;

/** On-screen growth factor of glyphs and labels at zoom k: 1 when zoomed out, k^0.4 past 1x. */
export function onScreenGrowth(k: number): number {
  return k >= 1 ? k ** ZOOM_GROW : 1;
}

/**
 * Scale applied to a node's glyph group, in layout units. Zoomed out, glyphs grow back toward
 * their on-screen size but never wider than the node's wedge. Zoomed in, they grow on screen by
 * onScreenGrowth(k) only, in step with the labels.
 */
export function glyphScale(k: number, room: number, r: number): number {
  if (k >= 1) return onScreenGrowth(k) / k;
  return Math.max(1, Math.min(1 / k, 2.5, (0.4 * room) / r));
}
