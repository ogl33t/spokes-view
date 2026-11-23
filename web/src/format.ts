import type { NodeType, Stage, Status, ViewNode } from "./types";

export const STATUS_LABEL: Record<Status, string> = {
  open: "open",
  in_progress: "in progress",
  waiting: "waiting",
  done: "done",
  dropped: "dropped",
};

export const NODE_TYPES: readonly NodeType[] = ["bug", "feature", "chore", "idea", "epic"];

export const STAGES: readonly Stage[] = [
  "idea",
  "backlog",
  "brainstormed",
  "understood",
  "planned",
  "in_progress",
  "in_review",
  "done",
];

export const TYPE_LABEL: Record<NodeType, string> = {
  bug: "bug",
  feature: "feature",
  chore: "chore",
  idea: "idea",
  epic: "epic",
};

export const STAGE_LABEL: Record<Stage, string> = {
  idea: "idea",
  backlog: "backlog",
  brainstormed: "brainstormed",
  understood: "understood",
  planned: "planned",
  in_progress: "in progress",
  in_review: "in review",
  done: "done",
};

/** The node's type; `null` when missing (pre-0.4.0 server), unset or a value this app does not know. */
export function typeOf(n: ViewNode): NodeType | null {
  return NODE_TYPES.find((t) => t === n.type) ?? null;
}

/** The node's stage; `null` when missing, unset or unknown. */
export function stageOf(n: ViewNode): Stage | null {
  return STAGES.find((s) => s === n.stage) ?? null;
}

export function spokeId(id: number): string {
  return `SPOKE-${id}`;
}

/** Days from `today` to `date` (both YYYY-MM-DD); negative when `date` is past. */
export function daysUntil(today: string, date: string): number {
  const ms = (d: string) => {
    const [y, m, day] = d.split("-").map(Number);
    return Date.UTC(y ?? 1970, (m ?? 1) - 1, day ?? 1);
  };
  return Math.round((ms(date) - ms(today)) / 86_400_000);
}

/** `Fri, Nov 20, 2026` for a calendar date (no time zone shift). */
export function formatDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
  return dt.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** `Nov 20` for a calendar date. */
export function shortDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** An RFC 3339 instant as wall-clock time in the server's zone. */
export function formatInstant(iso: string, timeZone: string): string {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return iso;
  const opts: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" };
  try {
    return dt.toLocaleString(undefined, { ...opts, timeZone });
  } catch {
    return dt.toLocaleString(undefined, { ...opts, timeZone: "UTC" }) + " UTC";
  }
}

/** Time of day in the browser's zone, for "updated at". */
export function clock(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export type DueState = "overdue" | "today" | "soon" | "later";

export function dueState(n: ViewNode, today: string): DueState | null {
  if (!n.due || n.status === "done" || n.status === "dropped") return null;
  const d = daysUntil(today, n.due);
  if (d < 0) return "overdue";
  if (d === 0) return "today";
  if (d <= 7) return "soon";
  return "later";
}

export function dueText(n: ViewNode, today: string): string | null {
  if (!n.due) return null;
  const s = dueState(n, today);
  if (s === "overdue") return `overdue ${shortDate(n.due)}`;
  if (s === "today") return "due today";
  return `due ${shortDate(n.due)}`;
}

/** One marker drawn after a node's label (and listed in the legend). */
export interface Marker {
  key: string;
  glyph: string;
  cls: string;
  title: string;
}

// U+FE0E asks for the text (not emoji) form of symbols that have both.
const TEXT = "︎";

export const MARKER_LEGEND: readonly Marker[] = [
  { key: "next", glyph: "▶", cls: "m-next", title: "Actionable next step of an ordered parent" },
  { key: "focus", glyph: "★", cls: "m-focus", title: "On the focus list (with its rank)" },
  { key: "claimed", glyph: "⚑" + TEXT, cls: "m-claimed", title: "Claimed by an agent" },
  {
    key: "stalled",
    glyph: "⚠" + TEXT,
    cls: "m-alert",
    title: "Stalled: the claim's lease ran out",
  },
  {
    key: "waiting",
    glyph: "?",
    cls: "m-waiting",
    title: "Waiting on you: an agent asked a question",
  },
  { key: "answered", glyph: "↩", cls: "m-waiting", title: "Answered, ready for an agent" },
  { key: "overdue", glyph: "◷", cls: "m-alert", title: "Overdue" },
  { key: "due", glyph: "◷", cls: "m-due", title: "Due within 7 days (or today)" },
  { key: "later", glyph: "◷", cls: "m-muted", title: "Has a later due date" },
  {
    key: "deferred",
    glyph: "⧗",
    cls: "m-muted",
    title: "Deferred (hidden from next until a date)",
  },
  { key: "repeat", glyph: "↻", cls: "m-muted", title: "Repeats" },
  { key: "notes", glyph: "✎", cls: "m-muted", title: "Has notes" },
];

function legend(key: string): Marker {
  const m = MARKER_LEGEND.find((x) => x.key === key);
  if (!m) throw new Error(key);
  return m;
}

/** The markers that apply to a node, most urgent first. */
export function markers(n: ViewNode, today: string): Marker[] {
  const out: Marker[] = [];
  if (n.stalled)
    out.push({ ...legend("stalled"), title: `Stalled claim by ${n.claimed_by ?? "?"}` });
  if (n.waiting_on !== null || n.status === "waiting") {
    out.push({ ...legend("waiting"), title: `Waiting on you: ${n.waiting_on ?? ""}` });
  }
  if (n.answered) out.push(legend("answered"));
  const due = dueState(n, today);
  if (due === "overdue") out.push({ ...legend("overdue"), title: dueText(n, today) ?? "" });
  if (n.is_next) out.push(legend("next"));
  if (n.focus !== null)
    out.push({ ...legend("focus"), glyph: `★${n.focus}`, title: `Focus #${n.focus}` });
  if (n.claimed_by && !n.stalled)
    out.push({ ...legend("claimed"), title: `Claimed by ${n.claimed_by}` });
  if (due === "today" || due === "soon")
    out.push({ ...legend("due"), title: dueText(n, today) ?? "" });
  if (due === "later") out.push({ ...legend("later"), title: dueText(n, today) ?? "" });
  if (n.deferred)
    out.push({ ...legend("deferred"), title: `Deferred until ${n.defer_until ?? ""}` });
  if (n.repeat) out.push({ ...legend("repeat"), title: `Repeats ${n.repeat}` });
  if (n.has_notes) out.push(legend("notes"));
  return out;
}

/** Needs the user's attention: drawn as a dot even when labels are hidden. */
export function isAlert(n: ViewNode, today: string): boolean {
  return n.stalled || n.waiting_on !== null || dueState(n, today) === "overdue";
}

/** Cuts `text` to `max` characters with an ellipsis. */
export function clip(text: string, max: number): string {
  if (max <= 1) return "…";
  return text.length <= max ? text : text.slice(0, Math.max(1, max - 1)).trimEnd() + "…";
}
