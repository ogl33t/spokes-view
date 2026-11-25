import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent, ReactElement } from "react";
import type { Layout, NodePos } from "./layout";
import { clip, isAlert, markers, spokeId, STATUS_LABEL } from "./format";
import { easeInOut, focusTarget, interpolateView, labelFlip, screenOf } from "./focus";
import type { View } from "./focus";
import type { Store } from "./treeStore";
import { knownChildren, missingChildren, needsFetch } from "./treeStore";
import type { ViewNode } from "./types";
import { glyphScale, onScreenGrowth } from "./zoomScale";
import { fitPadding, innerLabelRank, labelledBounds, labelWidth, placeInnerLabels } from "./labels";
import type { LabelBox } from "./labels";

const MIN_K = 0.01;
const MAX_K = 4;
/** Label font size on screen, px. */
const FONT = 13.5;
/** Zoom bucket from which a compact (phone) tree shows its leaves' labels. */
const COMPACT_LABEL_K = 1.5;
/** Width of an area pill beyond its label, in label font sizes. */
const PILL_PAD = 1.8;
/** Area pill labels are bold, so they run a little wider than the estimate. */
const PILL_BOLD = 1.08;
/** Number of area colours (`--area-1` … `--area-6`). */
const AREA_COLOURS = 6;
/** Radius of a parent's progress ring, layout units at glyph scale. */
const PARENT_R = 8;
/** Circumference of a parent's progress ring. */
const PARENT_C = 2 * Math.PI * PARENT_R;
/** How long a click-to-focus animation runs, ms. */
const FOCUS_MS = 450;
/** Zoom levels are bucketed so labels re-render only when the zoom moves a step. */
const LOD_STEP = 1.2;

function bucket(k: number): number {
  return Math.pow(LOD_STEP, Math.round(Math.log(k) / Math.log(LOD_STEP)));
}

export interface GraphProps {
  layout: Layout;
  store: Store;
  expanded: ReadonlySet<number>;
  loading: ReadonlySet<number>;
  selected: number | null;
  /** Changes when the view should be fitted to the tree (a new server). */
  fitKey: number;
  onSelect: (id: number) => void;
  onToggle: (id: number) => void;
  /** Right-click (or the menu key) on a node, at a point in viewport pixels. */
  onMenu: (id: number, x: number, y: number) => void;
  /** Colour slot (1…6) of an area; null falls back to the area's place among the root's areas. */
  areaSlotOf?: (id: number) => number | null;
  /** A new `seq` glides the view to `id`, as a click on it does. */
  focusRequest?: { id: number; seq: number } | null;
  /** Fades everything outside this node's subtree. */
  dimOutside?: number | null;
  /** Phone: leaves' labels stay hidden until zoomed in. */
  compact?: boolean;
}

const noAreaSlot = (): number | null => null;

export function Graph(props: GraphProps): ReactElement {
  const { layout, store, expanded, loading, selected, fitKey, onSelect, onToggle, onMenu } = props;
  const areaSlotOf = props.areaSlotOf ?? noAreaSlot;
  const focusRequest = props.focusRequest ?? null;
  const dimOutside = props.dimOutside ?? null;
  const compact = props.compact ?? false;
  const svgRef = useRef<SVGSVGElement>(null);
  const viewportRef = useRef<SVGGElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const view = useRef<View>({ x: 0, y: 0, k: 1, r: 0 });
  const [lod, setLod] = useState(1);
  /** The committed rotation: labels are laid out for it. */
  const [rot, setRot] = useState(0);
  /** Animation frame of a running click-to-focus, 0 when none. */
  const focusFrame = useRef(0);
  const frame = useRef(0);
  const dragged = useRef(false);

  /** The view last written into the SVG; while a gesture runs, `view` moves ahead of it. */
  const committed = useRef<View>({ x: 0, y: 0, k: 1, r: 0 });
  const idle = useRef(0);

  // Writes the view into the SVG and re-buckets the zoom (labels may change).
  const commit = useCallback(() => {
    window.clearTimeout(idle.current);
    idle.current = 0;
    const v = view.current;
    committed.current = v;
    const svg = svgRef.current;
    viewportRef.current?.setAttribute(
      "transform",
      `translate(${v.x} ${v.y}) rotate(${v.r}) scale(${v.k})`,
    );
    if (svg) svg.style.transform = "";
    const b = bucket(v.k);
    setLod((old) => (old === b ? old : b));
    setRot((old) => (old === v.r ? old : v.r));
  }, []);

  // Moves the composited SVG layer to show `view` relative to the committed view.
  const paint = useCallback(() => {
    const v = view.current;
    const c = committed.current;
    const s = v.k / c.k;
    const svg = svgRef.current;
    if (svg) {
      svg.style.transform = `translate(${v.x}px, ${v.y}px) rotate(${v.r - c.r}deg) scale(${s}) translate(${-c.x}px, ${-c.y}px)`;
    }
  }, []);

  // During a pan or zoom only the composited SVG layer moves (a CSS transform relative
  // to the committed view), so a frame costs the same with ten nodes or ten thousand.
  // The real transform is written once the gesture has been idle for a moment.
  const apply = useCallback(
    (now = false) => {
      if (now) {
        cancelAnimationFrame(frame.current);
        frame.current = 0;
        commit();
        return;
      }
      if (!frame.current) {
        frame.current = requestAnimationFrame(() => {
          frame.current = 0;
          paint();
        });
      }
      window.clearTimeout(idle.current);
      idle.current = window.setTimeout(commit, 160);
    },
    [commit, paint],
  );

  // Stops a click-to-focus where it is (the user took over the view).
  const stopFocus = useCallback(() => {
    if (!focusFrame.current) return;
    cancelAnimationFrame(focusFrame.current);
    focusFrame.current = 0;
    apply();
  }, [apply]);

  useEffect(
    () => () => {
      cancelAnimationFrame(frame.current);
      cancelAnimationFrame(focusFrame.current);
      window.clearTimeout(idle.current);
    },
    [],
  );

  const zoomAt = useCallback(
    (factor: number, cx: number, cy: number) => {
      stopFocus();
      const v = view.current;
      const k = Math.min(MAX_K, Math.max(MIN_K, v.k * factor));
      const f = k / v.k;
      view.current = { k, r: v.r, x: cx - (cx - v.x) * f, y: cy - (cy - v.y) * f };
      apply();
    },
    [apply, stopFocus],
  );

  const fit = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return;
    stopFocus();
    const w = svg.clientWidth || 800;
    const h = svg.clientHeight || 600;
    const b = layout.bounds;
    const bw = Math.max(1, b.maxX - b.minX);
    const bh = Math.max(1, b.maxY - b.minY);
    // Leave room, in screen pixels, for the outermost labels that show at the zoom (their
    // size is fixed on screen). More labels show the further in we zoom, so the room needed
    // grows with the zoom: search for the largest zoom whose labels still fit.
    const today = store.meta?.today ?? "";
    // On-screen length of each outward label that shows at zoom k (0 when it does not).
    const labelPxAt = (k: number) => {
      const lod = bucket(k);
      // Labels are drawn for the zoom bucket, so on screen they are k / lod of their size.
      const grow = (onScreenGrowth(lod) * k) / lod;
      return (id: number) => {
        const p = layout.byId.get(id);
        const n = store.nodes.get(id);
        if (!p) return 0;
        const m = labelMode(p, lod);
        if (!m.show || !m.outward || leafLabelHidden(n, lod, compact)) return 0;
        return outwardLabelPx(n, today, grow, outwardMaxChars(lod));
      };
    };
    const fitsAt = (k: number) => {
      const { padX, padY } = fitPadding(layout, labelPxAt(k), w, h);
      return k <= Math.min((w - 2 * padX) / bw, (h - 2 * padY) / bh);
    };
    let lo = MIN_K;
    let hi = Math.min(MAX_K, 1.4);
    if (fitsAt(hi)) lo = hi;
    for (let i = 0; i < 30 && hi / lo > 1.001; i++) {
      const mid = Math.sqrt(lo * hi);
      if (fitsAt(mid)) lo = mid;
      else hi = mid;
    }
    // If no label on the outermost ring can show inside the viewport at any zoom, fit the
    // rings with modest room instead and let the outermost labels run past the edge; zoom in
    // further, if need be, until the first of them shows.
    const outer = layout.radii.length - 1;
    const labelledAt = (k: number) => {
      const z = bucket(k);
      return layout.nodes.some((p) => {
        const m = labelMode(p, z);
        return (
          p.depth === outer &&
          m.show &&
          m.outward &&
          !leafLabelHidden(store.nodes.get(p.id), z, compact)
        );
      });
    };
    let k = lo;
    let cx = (b.minX + b.maxX) / 2;
    let cy = (b.minY + b.maxY) / 2;
    if (!labelledAt(lo)) {
      const modest = Math.min(
        MAX_K,
        Math.max(
          MIN_K,
          Math.min(
            (w - 2 * Math.min(260, w * 0.2)) / bw,
            (h - 2 * Math.min(230, h * 0.25)) / bh,
            1.4,
          ),
        ),
      );
      k = modest;
      let top = Math.min(MAX_K, 1.4);
      if (!labelledAt(modest) && modest < top && labelledAt(top)) {
        let bottom = modest;
        for (let i = 0; i < 30 && top / bottom > 1.001; i++) {
          const mid = Math.sqrt(bottom * top);
          if (labelledAt(mid)) top = mid;
          else bottom = mid;
        }
        k = top;
      }
      // Labels may run past the edge here: centre on the nodes and their labels together,
      // so any overflow is split between the two sides.
      const ink = labelledBounds(layout, k, labelPxAt(k));
      cx = (ink.minX + ink.maxX) / 2;
      cy = (ink.minY + ink.maxY) / 2;
    }
    // Fitting also turns the tree back north-up.
    view.current = { k, r: 0, x: w / 2 - cx * k, y: h / 2 - cy * k };
    apply(true);
  }, [layout, store, compact, apply, stopFocus]);

  // Click-to-focus: turn the tree so the node's label reads horizontally, glide the node
  // to the centre and zoom in. Frames use the composited fast path; the end commits.
  const focusOn = useCallback(
    (id: number) => {
      const p = layout.byId.get(id);
      const svg = svgRef.current;
      if (!p || !svg) return;
      cancelAnimationFrame(focusFrame.current);
      const from = view.current;
      // The target is worked out each frame from the graph's current size: selecting the
      // node opens the detail panel, which narrows the graph after this click.
      const target = () =>
        focusTarget(from, p, { x: (svg.clientWidth || 800) / 2, y: (svg.clientHeight || 600) / 2 });
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const t0 = performance.now();
      const step = (now: number) => {
        const t = reduce ? 1 : Math.min(1, (now - t0) / FOCUS_MS);
        const to = target();
        view.current = t < 1 ? interpolateView(from, to, p, easeInOut(t)) : to;
        if (t < 1) {
          paint();
          focusFrame.current = requestAnimationFrame(step);
        } else {
          focusFrame.current = 0;
          apply(true);
        }
      };
      focusFrame.current = requestAnimationFrame(step);
    },
    [layout, apply, paint],
  );

  // Fit on a new server's first layout; later layouts (refresh, expand) keep the view.
  const fitted = useRef(-1);
  useLayoutEffect(() => {
    if (fitted.current !== fitKey && layout.nodes.length > 0) {
      fitted.current = fitKey;
      fit();
    }
  }, [fitKey, layout, fit]);

  // A focus request glides to its node once the node is in the layout (a jump may still be
  // loading the branches that lead to it). Each `seq` is followed once.
  const focusedSeq = useRef<number | null>(null);
  useEffect(() => {
    if (!focusRequest || focusedSeq.current === focusRequest.seq) return;
    if (!layout.byId.has(focusRequest.id)) return;
    focusedSeq.current = focusRequest.seq;
    focusOn(focusRequest.id);
  }, [focusRequest, layout, focusOn]);

  // Area colours, keyed by content so a new `areaSlotOf` each render does not redraw the nodes.
  const slotKey = areaSlotKey(layout, store, areaSlotOf);
  const areaSlots = useMemo(() => parseAreaSlotKey(slotKey), [slotKey]);
  const dim = useMemo(() => subtreeOf(layout, dimOutside), [layout, dimOutside]);

  // Wheel and pinch zoom, drag to pan. Listeners are native so wheel can preventDefault.
  useEffect(() => {
    // Listen on the container: the SVG itself moves during a gesture.
    const svg = boxRef.current;
    if (!svg) return;
    const pointers = new Map<number, { x: number; y: number }>();
    let start: { x: number; y: number } | null = null;
    let pinch: { d: number } | null = null;
    const local = (e: { clientX: number; clientY: number }) => {
      const r = svg.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = local(e);
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      zoomAt(Math.exp(-delta * 0.0015), p.x, p.y);
    };
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      pointers.set(e.pointerId, local(e));
      start = local(e);
      dragged.current = false;
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        if (a && b) pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) };
      }
    };
    const onMove = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      const p = local(e);
      pointers.set(e.pointerId, p);
      if (start && Math.hypot(p.x - start.x, p.y - start.y) > 4 && !dragged.current) {
        dragged.current = true;
        stopFocus();
        try {
          svg.setPointerCapture(e.pointerId);
        } catch {
          // The pointer is already gone; the drag still works without capture.
        }
        svg.classList.add("dragging");
      }
      if (pointers.size === 2 && pinch) {
        const [a, b] = [...pointers.values()];
        if (!a || !b) return;
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch.d > 0) zoomAt(d / pinch.d, (a.x + b.x) / 2, (a.y + b.y) / 2);
        pinch.d = d;
        dragged.current = true;
        return;
      }
      if (dragged.current) {
        view.current = {
          ...view.current,
          x: view.current.x + p.x - prev.x,
          y: view.current.y + p.y - prev.y,
        };
        apply();
      }
    };
    const onUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (pointers.size === 0) {
        start = null;
        svg.classList.remove("dragging");
        if (dragged.current) apply(true);
      }
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    svg.addEventListener("pointerdown", onDown);
    svg.addEventListener("pointermove", onMove);
    svg.addEventListener("pointerup", onUp);
    svg.addEventListener("pointercancel", onUp);
    return () => {
      svg.removeEventListener("wheel", onWheel);
      svg.removeEventListener("pointerdown", onDown);
      svg.removeEventListener("pointermove", onMove);
      svg.removeEventListener("pointerup", onUp);
      svg.removeEventListener("pointercancel", onUp);
    };
  }, [zoomAt, apply, stopFocus]);

  const idFrom = (target: EventTarget | null): number | null => {
    const el = (target as Element | null)?.closest("[data-id]");
    const id = el ? Number(el.getAttribute("data-id")) : NaN;
    return Number.isFinite(id) ? id : null;
  };

  const onClick = (e: MouseEvent) => {
    if (dragged.current) return;
    const toggle = (e.target as Element).closest("[data-toggle]");
    const id = idFrom(e.target);
    if (id === null) return;
    if (toggle) {
      onToggle(id);
    } else {
      onSelect(id);
      focusOn(id);
    }
  };
  const onDoubleClick = (e: MouseEvent) => {
    const id = idFrom(e.target);
    if (id !== null) onToggle(id);
  };
  const onContextMenu = (e: MouseEvent) => {
    const id = idFrom(e.target);
    if (id === null) return;
    e.preventDefault();
    onMenu(id, e.clientX, e.clientY);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    const id = idFrom(e.target);
    if (id === null) return;
    if (e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey)) {
      e.preventDefault();
      const r = (e.target as Element).getBoundingClientRect();
      onMenu(id, r.left + r.width / 2, r.top + r.height / 2);
    } else if (e.key === "Enter") {
      e.preventDefault();
      onSelect(id);
    } else if (e.key === " " || e.key === "+" || e.key === "-") {
      e.preventDefault();
      onToggle(id);
    }
  };

  const centre = () => {
    const svg = svgRef.current;
    return { x: (svg?.clientWidth ?? 800) / 2, y: (svg?.clientHeight ?? 600) / 2 };
  };

  const sel = selected !== null ? layout.byId.get(selected) : undefined;
  const selPath = useMemo(() => {
    if (!sel) return "";
    let d = "";
    let cur: NodePos = sel;
    while (cur.parent !== null) {
      const p = layout.byId.get(cur.parent);
      if (!p) break;
      d += edgePath(p, cur);
      cur = p;
    }
    return d;
  }, [sel, layout]);

  return (
    <div className="graph" ref={boxRef}>
      <svg
        ref={svgRef}
        className="graph-svg"
        role="tree"
        aria-label="To-do tree. Drag to pan, scroll or pinch to zoom. Enter opens a node, Space expands or collapses it, right-click or the menu key shows more."
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        onContextMenu={onContextMenu}
        onKeyDown={onKeyDown}
      >
        <g ref={viewportRef}>
          <Edges layout={layout} dim={dim} />
          {selPath && <path className="edge-selected" d={selPath} />}
          <Nodes
            layout={layout}
            store={store}
            expanded={expanded}
            loading={loading}
            k={lod}
            turn={rot}
            areaSlots={areaSlots}
            dim={dim}
            compact={compact}
          />
          {sel && <SelectedRing p={sel} store={store} expanded={expanded} k={lod} turn={rot} />}
        </g>
      </svg>
      <div className="zoom-buttons" role="group" aria-label="Zoom">
        <button
          type="button"
          onClick={() => {
            const c = centre();
            zoomAt(1.4, c.x, c.y);
          }}
          aria-label="Zoom in"
          title="Zoom in"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => {
            const c = centre();
            zoomAt(1 / 1.4, c.x, c.y);
          }}
          aria-label="Zoom out"
          title="Zoom out"
        >
          −
        </button>
        <button type="button" onClick={fit} aria-label="Fit to view" title="Fit to view">
          ⤢
        </button>
      </div>
    </div>
  );
}

/**
 * An edge: a straight spoke from the root; deeper, out along the parent's angle to
 * halfway between the rings, around that circle to the child's angle, then out to the
 * child. Edges then stay between their two rings and never cut across the centre.
 */
export function edgePath(p: NodePos, c: NodePos): string {
  const f = (v: number) => v.toFixed(1);
  if (p.depth === 0) return `M${f(p.x)} ${f(p.y)}L${f(c.x)} ${f(c.y)}`;
  const rp = Math.hypot(p.x, p.y);
  const rc = Math.hypot(c.x, c.y);
  const rm = (rp + rc) / 2;
  const ax = rm * Math.sin(p.angle);
  const ay = -rm * Math.cos(p.angle);
  const bx = rm * Math.sin(c.angle);
  const by = -rm * Math.cos(c.angle);
  const delta = c.angle - p.angle;
  if (Math.abs(delta) < 1e-6) return `M${f(p.x)} ${f(p.y)}L${f(c.x)} ${f(c.y)}`;
  const large = Math.abs(delta) > Math.PI ? 1 : 0;
  const sweep = delta > 0 ? 1 : 0;
  return `M${f(p.x)} ${f(p.y)}L${f(ax)} ${f(ay)}A${f(rm)} ${f(rm)} 0 ${large} ${sweep} ${f(bx)} ${f(by)}L${f(c.x)} ${f(c.y)}`;
}

/**
 * On-screen length, px, of a leaf's outward label at the outermost ring with its gap from
 * the node, as drawn at fit (a collapsed node shows its hidden count too). An area has no
 * outward label: its pill, centred on the node, reaches half its width.
 */
function outwardLabelPx(
  n: ViewNode | undefined,
  today: string,
  grow: number,
  maxChars: number,
): number {
  if (!n) return 0;
  const hasKids = n.child_count > 0;
  if (n.kind === "area") {
    const chars = areaPillText(n, hasKids ? n.descendant_count : 0).length;
    return pillWidth(chars, FONT * grow) / 2;
  }
  let chars = clip(n.title, maxChars).length;
  for (const m of markers(n, today)) chars += 1 + m.glyph.length;
  if (hasKids) chars += ` +${n.descendant_count}`.length;
  const r = hasKids ? PARENT_R : LEAF_R;
  return (hasKids ? r + 20 : r + 6) + labelWidth(chars, FONT * grow);
}

/**
 * Longest outward label at zoom bucket `k`, characters. Zoomed out (where a fit lands) the
 * labels are short so the fit can show them inside the view; from 1x they run longer.
 */
function outwardMaxChars(k: number): number {
  return k < 1 ? 18 : 36;
}

/** Radius of the root's dot, layout units at glyph scale. */
const ROOT_R = 6;
/** Radius of a leaf's dot, layout units at glyph scale. */
const LEAF_R = 4.5;

/** Whether a node is drawn as a parent (progress ring): it has drawn or known children. */
function isParent(n: ViewNode, p: NodePos, store: Store): boolean {
  return n.child_count > 0 || p.childCount > 0 || knownChildren(store, n.id).length > 0;
}

/** An area drawn as a pill: a depth-1 node of kind area. */
function isAreaPill(n: ViewNode | undefined, p: NodePos): boolean {
  return p.depth === 1 && n?.kind === "area";
}

function nodeRadius(p: NodePos, parent: boolean): number {
  if (p.depth === 0) return ROOT_R;
  return parent ? PARENT_R : LEAF_R;
}

/**
 * Share of a parent's children that are done: its own `progress` when the server gives one,
 * else the done children in the store over all its children, open and closed; 0 when unknown.
 */
function progressOf(n: ViewNode, store: Store): number {
  if (n.progress) return n.progress.total > 0 ? n.progress.done / n.progress.total : 0;
  const total = n.child_count + n.closed_child_count;
  if (total === 0) return 0;
  let done = 0;
  for (const id of knownChildren(store, n.id)) {
    if (store.nodes.get(id)?.status === "done") done++;
  }
  return Math.min(1, done / total);
}

/** Text inside an area's pill: its title, and the count hidden beneath when collapsed. */
function areaPillText(n: ViewNode, hidden: number): string {
  return clip(n.title, 22) + (hidden > 0 ? ` +${hidden}` : "");
}

/** Width of a pill holding `chars` characters at font size `font` (same units). */
function pillWidth(chars: number, font: number): number {
  return labelWidth(chars, font * PILL_BOLD) + font * PILL_PAD;
}

/** Half width and half height of an area's pill, layout units, at label font size `font`. */
function pillHalf(text: string, font: number): { hw: number; hh: number } {
  return { hw: pillWidth(text.length, font) / 2, hh: font };
}

/** Area nodes whose collapse hides children, with the count shown in the pill. */
function hiddenBeneath(n: ViewNode, p: NodePos, expanded: ReadonlySet<number>): number {
  const isOpen = expanded.has(n.id) && p.childCount > 0;
  return n.child_count > 0 && !isOpen ? n.descendant_count : 0;
}

/**
 * Colour slots of the drawn areas as a string key ("id:slot,…"): `areaSlotOf` where it
 * knows the area, else the area's place among the root's areas, cycling through the colours.
 */
function areaSlotKey(
  layout: Layout,
  store: Store,
  areaSlotOf: (id: number) => number | null,
): string {
  const parts: string[] = [];
  let index = 0;
  for (const p of layout.nodes) {
    if (!isAreaPill(store.nodes.get(p.id), p)) continue;
    const slot = areaSlotOf(p.id) ?? (index % AREA_COLOURS) + 1;
    index++;
    parts.push(`${p.id}:${slot}`);
  }
  return parts.join(",");
}

function parseAreaSlotKey(key: string): ReadonlyMap<number, number> {
  const slots = new Map<number, number>();
  if (!key) return slots;
  for (const part of key.split(",")) {
    const [id, slot] = part.split(":").map(Number);
    if (id !== undefined && slot !== undefined) slots.set(id, slot);
  }
  return slots;
}

/** Ids of `rootId` and everything drawn beneath it; null when there is nothing to dim. */
function subtreeOf(layout: Layout, rootId: number | null): ReadonlySet<number> | null {
  if (rootId === null || !layout.byId.has(rootId)) return null;
  const kids = new Map<number, number[]>();
  for (const p of layout.nodes) {
    if (p.parent === null) continue;
    const list = kids.get(p.parent);
    if (list) list.push(p.id);
    else kids.set(p.parent, [p.id]);
  }
  const inside = new Set<number>();
  const stack = [rootId];
  for (let id = stack.pop(); id !== undefined; id = stack.pop()) {
    inside.add(id);
    stack.push(...(kids.get(id) ?? []));
  }
  return inside;
}

/** Whether a leaf's outward label waits for a closer zoom (compact trees, phones). */
function leafLabelHidden(n: ViewNode | undefined, k: number, compact: boolean): boolean {
  return compact && k < COMPACT_LABEL_K && n !== undefined && n.child_count === 0;
}

interface SelectedRingProps {
  p: NodePos;
  store: Store;
  expanded: ReadonlySet<number>;
  k: number;
  turn: number;
}

/** The ring around the selected node: a rounded box around an area's pill. */
function SelectedRing({ p, store, expanded, k, turn }: SelectedRingProps): ReactElement | null {
  const n = store.nodes.get(p.id);
  if (!n) return null;
  if (isAreaPill(n, p)) {
    const font = (FONT * onScreenGrowth(k)) / k;
    const { hw, hh } = pillHalf(areaPillText(n, hiddenBeneath(n, p, expanded)), font);
    const pad = font * 0.4;
    return (
      <rect
        className="selected-ring"
        transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${(-turn).toFixed(2)})`}
        x={-hw - pad}
        y={-hh - pad}
        width={2 * (hw + pad)}
        height={2 * (hh + pad)}
        rx={hh + pad}
      />
    );
  }
  return (
    <circle
      className="selected-ring"
      cx={p.x}
      cy={p.y}
      r={nodeRadius(p, isParent(n, p, store)) + 7}
    />
  );
}

interface EdgesProps {
  layout: Layout;
  /** The subtree that stays bright; edges into anything else fade. */
  dim: ReadonlySet<number> | null;
}

const Edges = memo(function Edges({ layout, dim }: EdgesProps) {
  // Two paths for every edge (bright and faded): a few thousand segments cost two DOM nodes.
  const { bright, faded } = useMemo(() => {
    const on: string[] = [];
    const off: string[] = [];
    for (const n of layout.nodes) {
      if (n.parent === null) continue;
      const p = layout.byId.get(n.parent);
      if (!p) continue;
      (dim && !dim.has(n.id) ? off : on).push(edgePath(p, n));
    }
    return { bright: on.join(""), faded: off.join("") };
  }, [layout, dim]);
  return (
    <>
      <path className="edges" d={bright} aria-hidden="true" />
      {faded && <path className="edges dim" d={faded} aria-hidden="true" />}
    </>
  );
});

interface NodesProps {
  layout: Layout;
  store: Store;
  expanded: ReadonlySet<number>;
  loading: ReadonlySet<number>;
  /** Zoom bucket: decides which labels show and how long they may be. */
  k: number;
  /** The tree's rotation, degrees: labels are turned to stay readable under it. */
  turn: number;
  /** Colour slot of each drawn area. */
  areaSlots: ReadonlyMap<number, number>;
  /** The subtree that stays bright; every other node fades. */
  dim: ReadonlySet<number> | null;
  /** Phone: leaves' labels wait for a closer zoom. */
  compact: boolean;
}

/** Characters in a label with its marker glyphs, for estimating its width. */
function labelChars(label: string, ms: readonly { glyph: string }[]): number {
  let chars = label.length;
  for (const m of ms) chars += 1 + m.glyph.length;
  return chars;
}

/** Whether a node shows a label at zoom bucket `k`, and whether it runs outward. */
function labelMode(p: NodePos, k: number): { show: boolean; outward: boolean } {
  // A label shows when its wedge is tall enough on screen for one line of text.
  // The hub's and the areas' (depth 1) labels always show.
  const show = p.depth <= 1 || p.room * k >= FONT * onScreenGrowth(k) + 2;
  // An open inner node gets a short level label under it; a leaf or a collapsed node
  // a long one running outward (nothing else is drawn in its wedge beyond it).
  const outward = p.depth > 0 && p.childCount === 0;
  return { show, outward };
}

/** Offset of an inner label's baseline below its node, layout units. */
function innerLabelY(p: NodePos, r: number, z: number, font: number): number {
  return r * z + font * (p.depth === 0 ? 1.4 : 1.25);
}

/**
 * Which inner labels show at zoom bucket `k` and turn `turn` without colliding with each
 * other or with a node glyph. Boxes are in layout units, in the turned frame where inner
 * labels read horizontally. An area's pill is a glyph: it holds the area's label.
 */
function placeInner(
  layout: Layout,
  store: Store,
  expanded: ReadonlySet<number>,
  k: number,
  turn: number,
): Set<number> {
  const today = store.meta?.today ?? "";
  const font = (FONT * onScreenGrowth(k)) / k;
  const items: LabelBox[] = [];
  for (const p of layout.nodes) {
    const n = store.nodes.get(p.id);
    if (!n) continue;
    const at = screenOf({ x: 0, y: 0, k: 1, r: turn }, p);
    if (isAreaPill(n, p)) {
      const { hw, hh } = pillHalf(areaPillText(n, hiddenBeneath(n, p, expanded)), font);
      items.push({ id: p.id, x: at.x - hw, y: at.y - hh, width: 2 * hw, height: 2 * hh, rank: -1 });
      continue;
    }
    const r = nodeRadius(p, isParent(n, p, store));
    const z = glyphScale(k, p.room, r);
    const half = r * z;
    items.push({
      id: p.id,
      x: at.x - half,
      y: at.y - half,
      width: 2 * half,
      height: 2 * half,
      rank: -1,
    });
    const { show, outward } = labelMode(p, k);
    if (!show || outward) continue;
    const label = clip(n.title, p.depth === 0 ? 40 : 22);
    const width = labelWidth(labelChars(label, markers(n, today)), font) + font * 0.3;
    const baseline = at.y + innerLabelY(p, r, z, font);
    items.push({
      id: p.id,
      x: at.x - width / 2,
      y: baseline - font,
      width,
      height: font * 1.25,
      rank: innerLabelRank(p.depth, n.descendant_count),
      // The hub's and depth-1 labels always show.
      fixed: p.depth <= 1,
    });
  }
  return placeInnerLabels(items);
}

/** Point `d` layout units out along a spoke at `deg` degrees (0 = right). */
function along(deg: number, d: number): string {
  const a = (deg * Math.PI) / 180;
  return `translate(${(Math.cos(a) * d).toFixed(1)} ${(Math.sin(a) * d).toFixed(1)})`;
}

/** The +/− badge that expands or collapses a node. */
function Toggle({ at, open, scale }: { at: string; open: boolean; scale?: number }): ReactElement {
  return (
    <g
      data-toggle="1"
      className="toggle"
      aria-hidden="true"
      transform={scale === undefined ? at : `${at} scale(${scale.toFixed(3)})`}
    >
      <circle r={6} className="toggle-bg" />
      <path className="toggle-glyph" d={open ? "M-3 0H3" : "M-3 0H3M0 -3V3"} />
    </g>
  );
}

interface AreaPillProps {
  text: string;
  slot: number;
  font: number;
  turn: number;
  /** The spoke's direction, degrees (0 = right): the toggle sits beyond the pill along it. */
  deg: number;
  prio: number | null;
  ownPrio: boolean;
  collapsed: boolean;
  busy: boolean;
  alert: boolean;
  /** Whether the area has children (shows the +/− badge), and whether it is open. */
  toggle: { open: boolean } | null;
}

/**
 * An area: a pill in its area colour with the label inside, reading horizontally whatever
 * the turn. Its rings follow the pill's outline. Sizes follow the label font.
 */
function AreaPill(props: AreaPillProps): ReactElement {
  const { text, slot, font, turn, deg, prio, ownPrio, collapsed, busy, alert, toggle } = props;
  const { hw, hh } = pillHalf(text, font);
  // Glyph sizes are drawn for a FONT-sized label.
  const s = font / FONT;
  const outline = (cls: string, grow: number) => (
    <rect
      className={cls}
      x={-hw - grow}
      y={-hh - grow}
      width={2 * (hw + grow)}
      height={2 * (hh + grow)}
      rx={hh + grow}
    />
  );
  // The toggle sits where the spoke leaves the pill, plus its own radius and a gap.
  const a = ((deg + turn) * Math.PI) / 180;
  const exit = Math.min(
    Math.abs(Math.cos(a)) > 1e-6 ? hw / Math.abs(Math.cos(a)) : Infinity,
    Math.abs(Math.sin(a)) > 1e-6 ? hh / Math.abs(Math.sin(a)) : Infinity,
  );
  return (
    <>
      <g transform={turn ? `rotate(${(-turn).toFixed(2)})` : undefined}>
        {prio !== null && outline(`prio p${prio} ${ownPrio ? "own" : "inherited"}`, 3.5 * s)}
        {collapsed && outline("collapsed-halo", (prio ? 7 : 4) * s)}
        {busy && outline("busy pill-busy", 9 * s)}
        <rect
          className="shape area-pill"
          x={-hw}
          y={-hh}
          width={2 * hw}
          height={2 * hh}
          rx={hh}
          style={{ fill: `var(--area-${slot})` }}
        />
        <text className="area-label" dy="0.35em" fontSize={font}>
          {text}
        </text>
        {alert && <circle className="alert-dot" cx={hw - hh * 0.4} cy={-hh * 0.8} r={3.2 * s} />}
      </g>
      {toggle && <Toggle at={along(deg, exit + 8 * s)} open={toggle.open} scale={s} />}
    </>
  );
}

const Nodes = memo(function Nodes(props: NodesProps) {
  const { layout, store, expanded, loading, k, turn, areaSlots, dim, compact } = props;
  const today = store.meta?.today ?? "";
  // Labels keep the same size on screen when zoomed out and grow gently with glyphs past 1x.
  const grow = onScreenGrowth(k);
  const font = (FONT * grow) / k;
  // Runs only when the layout, store, zoom bucket or turn changes, never per frame.
  const placed = useMemo(
    () => placeInner(layout, store, expanded, k, turn),
    [layout, store, expanded, k, turn],
  );
  return (
    <g className="nodes">
      {layout.nodes.map((p) => {
        const n = store.nodes.get(p.id);
        if (!n) return null;
        const parent = isParent(n, p, store);
        const r = nodeRadius(p, parent);
        const hasKids = n.child_count > 0;
        const isOpen = expanded.has(n.id) && p.childCount > 0;
        const collapsed = hasKids && !isOpen;
        const busy = loading.has(n.id);
        const ms = markers(n, today);
        const area = isAreaPill(n, p);
        const { show, outward } = labelMode(p, k);
        // Inner labels also give way to a higher-ranked label or a glyph they would cover.
        // An area's label is in its pill; a compact tree keeps leaves unlabelled until close.
        const showLabel =
          !area && show && !leafLabelHidden(n, k, compact) && (outward || placed.has(n.id));
        const maxChars = p.depth === 0 ? 40 : outward ? outwardMaxChars(k) : 22;
        const missing = missingChildren(store, n.id);
        const hidden = collapsed ? n.descendant_count : 0;
        const label = clip(n.title, maxChars);
        const describe = [
          n.kind,
          STATUS_LABEL[n.status],
          n.effective_priority ? `priority ${n.effective_priority}` : "",
          ...ms.map((m) => m.title),
          hidden ? `${hidden} hidden beneath` : "",
        ]
          .filter(Boolean)
          .join(", ");
        const prio = n.effective_priority;
        const ownPrio = n.priority !== null;
        const deg = (p.angle * 180) / Math.PI - 90;
        const flip = labelFlip(p.angle, turn);
        const rot = flip ? deg + 180 : deg;
        // Zoomed out, glyphs grow back toward their on-screen size, but never wider than
        // the node's wedge, so a dense ring does not turn into a smear. Zoomed in they grow
        // in step with the labels.
        const z = glyphScale(k, p.room, r);
        const offset = (hasKids ? r + 20 : r + 6) * z;
        const progress = parent && !area && p.depth > 0 ? progressOf(n, store) : 0;
        const cls = [
          "node",
          `s-${n.status}`,
          `k-${n.kind}`,
          p.depth === 0 ? "root" : "",
          parent ? "parent" : "leaf",
          n.deferred ? "deferred" : "",
          collapsed ? "collapsed" : "",
          n.is_next ? "is-next" : "",
          dim && !dim.has(n.id) ? "dim" : "",
        ]
          .filter(Boolean)
          .join(" ");
        return (
          <g
            key={n.id}
            className={cls}
            transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`}
            data-id={n.id}
            tabIndex={0}
            role="treeitem"
            aria-label={`${spokeId(n.id)} ${n.title}: ${describe}`}
            aria-expanded={hasKids ? isOpen : undefined}
          >
            <title>{`${spokeId(n.id)}  ${n.title}\n${describe}`}</title>
            {area ? (
              <AreaPill
                text={areaPillText(n, hidden)}
                slot={areaSlots.get(n.id) ?? 1}
                font={font}
                turn={turn}
                deg={deg}
                prio={prio}
                ownPrio={ownPrio}
                collapsed={collapsed}
                busy={busy}
                alert={isAlert(n, today)}
                toggle={hasKids ? { open: isOpen } : null}
              />
            ) : (
              <g transform={Math.abs(z - 1) < 1e-3 ? undefined : `scale(${z.toFixed(3)})`}>
                {prio !== null && p.depth > 0 && (
                  <circle
                    className={`prio p${prio} ${ownPrio ? "own" : "inherited"}`}
                    r={r + 3.5}
                  />
                )}
                {collapsed && <circle className="collapsed-halo" r={r + (prio ? 7 : 4)} />}
                {busy && <circle className="busy" r={r + 9} />}
                {p.depth > 0 && parent ? (
                  <>
                    <circle className="shape track" r={r} />
                    {progress > 0 && (
                      <circle
                        className="progress-arc"
                        r={r}
                        transform={`rotate(${(-90 - turn).toFixed(2)})`}
                        strokeDasharray={`${(progress * PARENT_C).toFixed(2)} ${PARENT_C.toFixed(2)}`}
                      />
                    )}
                  </>
                ) : (
                  <circle className="shape" r={r} />
                )}
                {isAlert(n, today) && (
                  <circle className="alert-dot" cx={r * 0.8} cy={-r * 0.8} r={3.2} />
                )}
                {hasKids && p.depth > 0 && <Toggle at={along(deg, r + 10)} open={isOpen} />}
              </g>
            )}
            {showLabel &&
              (!outward ? (
                <text
                  className="label inner-label"
                  transform={turn ? `rotate(${(-turn).toFixed(2)})` : undefined}
                  y={innerLabelY(p, r, z, font)}
                  fontSize={font}
                >
                  {label}
                  {ms.map((m) => (
                    <tspan key={m.key} className={`marker ${m.cls}`}>
                      {" " + m.glyph}
                    </tspan>
                  ))}
                </text>
              ) : (
                <text
                  className="label"
                  transform={`rotate(${rot.toFixed(2)})`}
                  x={flip ? -offset : offset}
                  dy="0.35em"
                  textAnchor={flip ? "end" : "start"}
                  fontSize={font}
                >
                  {label}
                  {ms.map((m) => (
                    <tspan key={m.key} className={`marker ${m.cls}`}>
                      {" " + m.glyph}
                    </tspan>
                  ))}
                  {hidden > 0 && <tspan className="hidden-count">{` +${hidden}`}</tspan>}
                  {missing > 0 && (
                    <tspan className="hidden-count">{` (+${missing} not loaded)`}</tspan>
                  )}
                  {busy && <tspan className="hidden-count"> loading…</tspan>}
                </text>
              ))}
            {needsFetch(store, n.id) && !busy && collapsed && <desc>children load on expand</desc>}
          </g>
        );
      })}
    </g>
  );
});
