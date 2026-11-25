// Find and jump: match loaded nodes by id or title, ranked for a short result list.
import type { ViewNode } from "./types";

const ID_PATTERN = /^\s*(?:spoke[\s-]*)?(\d+)\s*$/i;

/** The node id a query names: `SPOKE-12`, `spoke 12` or `12`; otherwise null. */
export function parseSpokeId(q: string): number | null {
  const m = ID_PATTERN.exec(q);
  if (!m?.[1]) return null;
  const id = Number(m[1]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** Match quality, best first. */
const Rank = { ExactId: 0, TitlePrefix: 1, WordStart: 2, Substring: 3 } as const;
type Rank = (typeof Rank)[keyof typeof Rank];

function startsAWord(title: string, q: string): boolean {
  for (let at = title.indexOf(q, 1); at > 0; at = title.indexOf(q, at + 1)) {
    if (!/[\p{L}\p{N}]/u.test(title.charAt(at - 1))) return true;
  }
  return false;
}

function rankOf(node: ViewNode, q: string, id: number | null): Rank | null {
  if (id !== null && node.id === id) return Rank.ExactId;
  const title = node.title.toLowerCase();
  if (title.startsWith(q)) return Rank.TitlePrefix;
  if (startsAWord(title, q)) return Rank.WordStart;
  if (title.includes(q)) return Rank.Substring;
  return null;
}

/** Lower `effective_priority` is more urgent; unset sorts after every set value. */
function byPriorityThenId(a: ViewNode, b: ViewNode): number {
  const pa = a.effective_priority ?? Number.POSITIVE_INFINITY;
  const pb = b.effective_priority ?? Number.POSITIVE_INFINITY;
  if (pa !== pb) return pa < pb ? -1 : 1;
  return a.id - b.id;
}

/**
 * Loaded nodes matching `q`, case-insensitive, best first: exact id, title prefix,
 * word start, then substring. Ties go to the more urgent node, then the lower id.
 */
export function findNodes(q: string, nodes: Iterable<ViewNode>, limit = 8): ViewNode[] {
  const query = q.trim().toLowerCase();
  if (query === "" || limit <= 0) return [];
  const id = parseSpokeId(query);
  const hits: { node: ViewNode; rank: Rank }[] = [];
  for (const node of nodes) {
    const rank = rankOf(node, query, id);
    if (rank !== null) hits.push({ node, rank });
  }
  hits.sort((a, b) => a.rank - b.rank || byPriorityThenId(a.node, b.node));
  return hits.slice(0, limit).map((h) => h.node);
}
