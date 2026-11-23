import { describe, expect, it } from "vitest";
import {
  backlogRootFrom,
  backlogUrl,
  buildOutline,
  matches,
  NO_FILTER,
  visibleRows,
  type RowFilter,
} from "./backlog";
import type { TreeResponse, ViewNode } from "./types";

function node(id: number, parent: number | null, over: Partial<ViewNode> = {}): ViewNode {
  return {
    id,
    parent,
    kind: "task",
    ordered: false,
    title: `N${id}`,
    status: "open",
    priority: null,
    effective_priority: null,
    focus: null,
    due: null,
    defer_until: null,
    deferred: false,
    claimed_by: null,
    claim_expires: null,
    stalled: false,
    waiting_on: null,
    answered: false,
    repeat: null,
    has_notes: false,
    unplanned: false,
    is_step: false,
    is_next: false,
    progress: null,
    created_at: "2026-11-15T00:00:00Z",
    updated_at: "2026-11-15T00:00:00Z",
    touched_at: "2026-11-15T00:00:00Z",
    child_count: 0,
    descendant_count: 0,
    closed_child_count: 0,
    children_loaded: true,
    ...over,
  };
}

const text = (t: string): RowFilter => ({ ...NO_FILTER, text: t });

function slice(root: number, nodes: ViewNode[]): TreeResponse {
  return {
    rev: 1,
    version: "0.2.0",
    time_zone: "UTC",
    today: "2026-11-19",
    root,
    depth: 10,
    include_closed: false,
    node_limit: 2000,
    path: [],
    truncated: false,
    nodes,
  };
}

describe("backlog urls", () => {
  it("round-trips the root id", () => {
    const url = backlogUrl("home lab", 42);
    expect(url).toBe("/?server=home+lab&backlog=42");
    expect(backlogRootFrom(url.slice(1))).toBe(42);
  });

  it("accepts SPOKE-N and rejects junk", () => {
    expect(backlogRootFrom("?backlog=SPOKE-7")).toBe(7);
    expect(backlogRootFrom("?backlog=abc")).toBeNull();
    expect(backlogRootFrom("?backlog=0")).toBeNull();
    expect(backlogRootFrom("?kanban=3")).toBeNull();
  });
});

describe("buildOutline", () => {
  const tree = slice(10, [
    node(5, 1),
    node(10, 5, { title: "Root" }),
    node(11, 10, { title: "Alpha" }),
    node(12, 11, { title: "Alpha child" }),
    node(13, 10, { title: "Beta", effective_priority: 1 }),
    node(14, 13, { title: "Beta child" }),
  ]);

  it("lists descendants depth-first, not the root or its ancestors", () => {
    const rows = buildOutline(tree);
    expect(rows.map((r) => [r.node.id, r.depth])).toEqual([
      [13, 0],
      [14, 1],
      [11, 0],
      [12, 1],
    ]);
    expect(rows.find((r) => r.node.id === 14)?.ancestors).toEqual([13]);
    expect(rows.find((r) => r.node.id === 13)?.hasRows).toBe(true);
    expect(rows.find((r) => r.node.id === 14)?.hasRows).toBe(false);
  });

  it("keeps step order under an ordered parent", () => {
    const rows = buildOutline(
      slice(1, [
        node(1, null, { ordered: true }),
        node(3, 1),
        node(2, 1, { effective_priority: 1 }),
      ]),
    );
    expect(rows.map((r) => r.node.id)).toEqual([3, 2]);
  });
});

describe("visibleRows", () => {
  const rows = buildOutline(
    slice(1, [
      node(1, null),
      node(2, 1, { title: "Server" }),
      node(3, 2, { title: "Backup disks" }),
      node(4, 1, { title: "Garden" }),
    ]),
  );

  it("hides rows inside a collapsed branch", () => {
    expect(visibleRows(rows, new Set([2]), NO_FILTER).map((r) => r.node.id)).toEqual([2, 4]);
  });

  it("keeps matches and their ancestors, even when collapsed", () => {
    expect(visibleRows(rows, new Set([2]), text("backup")).map((r) => r.node.id)).toEqual([2, 3]);
    expect(visibleRows(rows, new Set(), text("SPOKE-4")).map((r) => r.node.id)).toEqual([4]);
  });

  it("matches ids exactly and titles by substring", () => {
    const n = node(2, 1, { title: "Server" });
    expect(matches(n, text("2"))).toBe(true);
    expect(matches(n, text("spoke-2"))).toBe(true);
    expect(matches(n, text("serv"))).toBe(true);
    expect(matches(n, text("22"))).toBe(false);
  });

  describe("type and stage filters", () => {
    const typed = buildOutline(
      slice(1, [
        node(1, null),
        node(2, 1, { title: "Epic", type: "epic", stage: "in_progress" }),
        node(3, 2, { title: "Feat", type: "feature", stage: "planned" }),
        node(4, 2, { title: "Plain" }),
        node(5, 1, { title: "Bug", type: "bug" }),
      ]),
    );
    const ids = (f: RowFilter) => visibleRows(typed, new Set(), f).map((r) => r.node.id);

    it("filters by type only, keeping ancestors", () => {
      expect(ids({ ...NO_FILTER, type: "feature" })).toEqual([2, 3]);
    });

    it("filters by stage only", () => {
      expect(ids({ ...NO_FILTER, stage: "planned" })).toEqual([2, 3]);
      expect(ids({ ...NO_FILTER, stage: "in_progress" })).toEqual([2]);
    });

    it("none matches nodes without a value, judged on their own", () => {
      expect(ids({ ...NO_FILTER, type: "none" })).toEqual([2, 4]);
      expect(ids({ ...NO_FILTER, stage: "none" })).toEqual([2, 4, 5]);
    });

    it("combines text with type", () => {
      expect(ids({ text: "feat", type: "feature", stage: "any" })).toEqual([2, 3]);
      expect(ids({ text: "bug", type: "feature", stage: "any" })).toEqual([]);
    });
  });
});
