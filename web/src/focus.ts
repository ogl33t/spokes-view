/**
 * Focusing the radial tree on one node: the maths behind "click a node and the tree turns
 * so its label reads horizontally, glides it to the centre and zooms in".
 *
 * A view maps a layout point p to the screen as `T + k · R(r) · p`, where R(r) turns by
 * `r` degrees clockwise (SVG `translate(x y) rotate(r) scale(k)`).
 */

export interface View {
  x: number;
  y: number;
  k: number;
  /** Rotation, degrees clockwise. Not normalised: it keeps the turn continuous. */
  r: number;
}

export interface Point {
  x: number;
  y: number;
}

/** A node as focusing sees it: where it is, and which way its spoke points. */
export interface FocusNode extends Point {
  /** Radians, 0 = up, growing clockwise (as `NodePos.angle`). */
  angle: number;
  depth: number;
}

/** Zoom a focus brings the view up to, at least. */
export const FOCUS_MIN_K = 1;
/** Zoom past which a focus stops zooming in further. */
export const FOCUS_MAX_K = 2;
/** How much a focus zooms in, between those two. */
export const FOCUS_ZOOM_STEP = 1.6;

const RAD = Math.PI / 180;

/** Where layout point `p` lands on screen under `v`. */
export function screenOf(v: View, p: Point): Point {
  const c = Math.cos(v.r * RAD);
  const s = Math.sin(v.r * RAD);
  return { x: v.x + v.k * (c * p.x - s * p.y), y: v.y + v.k * (s * p.x + c * p.y) };
}

/** The translation that puts layout point `p` at screen point `at`, given zoom and turn. */
function translationFor(p: Point, at: Point, k: number, r: number): Point {
  const o = screenOf({ x: 0, y: 0, k, r }, p);
  return { x: at.x - o.x, y: at.y - o.y };
}

/** Direction of the node's spoke in the layout, degrees (0 = pointing right). */
function spokeDegrees(n: FocusNode): number {
  return n.angle / RAD - 90;
}

/**
 * The view that focuses `node`: its spoke horizontal (whichever of left or right is the
 * shorter turn from `from`), the node at `centre`, and zoomed in. The root has no spoke,
 * so it keeps the current turn.
 */
export function focusTarget(from: View, node: FocusNode, centre: Point): View {
  let r = from.r;
  if (node.depth > 0) {
    const deg = spokeDegrees(node);
    r = -deg + 180 * Math.round((from.r + deg) / 180);
  }
  const k =
    from.k >= FOCUS_MAX_K
      ? from.k
      : Math.min(FOCUS_MAX_K, Math.max(FOCUS_MIN_K, from.k * FOCUS_ZOOM_STEP));
  return { k, r, ...translationFor(node, centre, k, r) };
}

/** Smooth start and stop, `t` in [0, 1]. */
export function easeInOut(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
}

/**
 * The view part-way (`e` in [0, 1], already eased) from `from` to `to` while focusing
 * layout point `p`: the point moves in a straight line on screen, the zoom changes
 * geometrically and the turn linearly. Interpolating the translation instead would swing
 * the node round in an arc.
 */
export function interpolateView(from: View, to: View, p: Point, e: number): View {
  const a = screenOf(from, p);
  const b = screenOf(to, p);
  const at = { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e };
  const k = from.k * Math.pow(to.k / from.k, e);
  const r = from.r + (to.r - from.r) * e;
  return { k, r, ...translationFor(p, at, k, r) };
}

/**
 * Whether an outward label at layout angle `angle` (radians) would read upside down on
 * screen under a turn of `r` degrees, and so is drawn flipped (anchored at its end).
 */
export function labelFlip(angle: number, r: number): boolean {
  const tau = Math.PI * 2;
  const a = (((angle + r * RAD) % tau) + tau) % tau;
  return a > Math.PI;
}
