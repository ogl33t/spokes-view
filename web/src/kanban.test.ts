import { describe, expect, it } from "vitest";
import { STAGES } from "./format";
import { buildBoard, columnsFor, groupingFrom, kanbanRootFrom, kanbanUrl } from "./kanban";
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

function slice(root: number, nodes: ViewNode[]): TreeResponse {
  return {
    rev: 1,
    version: "0.2.0",
    time_zone: "UTC",
    today: "2026-11-19",
    root,
    depth: 10,
    include_closed: true,
    node_limit: 2000,
    path: [],
    truncated: false,
    nodes,
  };
}

describe("kanban urls", () => {
  it("round-trips the root id", () => {
    const url = kanbanUrl("home lab", 42);
    expect(url).toBe("/?server=home+lab&kanban=42");
    expect(kanbanRootFrom(url.slice(1))).toBe(42);
  });

  it("accepts SPOKE-N and rejects junk", () => {
    expect(kanbanRootFrom("?kanban=SPOKE-7")).toBe(7);
    expect(kanbanRootFrom("?kanban=abc")).toBeNull();
    expect(kanbanRootFrom("?kanban=0")).toBeNull();
    expect(kanbanRootFrom("?server=x")).toBeNull();
  });

  it("round-trips the grouping", () => {
    expect(kanbanUrl("s", 4)).toBe("/?server=s&kanban=4");
    expect(kanbanUrl("s", 4, "status")).toBe("/?server=s&kanban=4");
    const url = kanbanUrl("s", 4, "stage");
    expect(url).toBe("/?server=s&kanban=4&group=stage");
    expect(groupingFrom(url.slice(1))).toBe("stage");
    expect(kanbanRootFrom(url.slice(1))).toBe(4);
    expect(groupingFrom("?kanban=4")).toBe("status");
    expect(groupingFrom("?group=other")).toBe("status");
  });
});

describe("buildBoard", () => {
  const tree = slice(10, [
    node(5, 1),
    node(10, 5, { title: "Board" }),
    node(11, 10, { title: "Child", status: "in_progress" }),
    node(12, 11, { title: "Grandchild" }),
    node(13, 12, { title: "Great", status: "waiting" }),
    node(14, 10, { status: "done" }),
    node(15, 10, { status: "dropped" }),
  ]);

  it("puts every descendant, not the root or its ancestors, in its status column", () => {
    const cols = buildBoard(tree, true);
    expect(cols.map((c) => c.key)).toEqual(columnsFor(true));
    const ids = (s: string) => cols.find((c) => c.key === s)?.cards.map((c) => c.node.id) ?? [];
    expect(ids("open")).toEqual([12]);
    expect(ids("in_progress")).toEqual([11]);
    expect(ids("waiting")).toEqual([13]);
    expect(ids("done")).toEqual([14]);
    expect(ids("dropped")).toEqual([15]);
  });

  it("gives each card its path below the root", () => {
    const cols = buildBoard(tree, false);
    const great = cols.flatMap((c) => c.cards).find((c) => c.node.id === 13);
    expect(great?.path.map((p) => p.title)).toEqual(["Child", "Grandchild"]);
    const child = cols.flatMap((c) => c.cards).find((c) => c.node.id === 11);
    expect(child?.path).toEqual([]);
  });

  it("leaves out the closed columns unless asked", () => {
    expect(buildBoard(tree, false).map((c) => c.key)).toEqual(["open", "in_progress", "waiting"]);
  });

  it("orders cards by priority, focus, due, then id", () => {
    const cols = buildBoard(
      slice(1, [
        node(1, null),
        node(2, 1),
        node(3, 1, { due: "2026-12-01" }),
        node(4, 1, { due: "2026-11-20" }),
        node(5, 1, { focus: 1 }),
        node(6, 1, { effective_priority: 2 }),
        node(7, 1, { effective_priority: 1 }),
      ]),
      false,
    );
    expect(cols[0]?.cards.map((c) => c.node.id)).toEqual([7, 6, 5, 4, 3, 2]);
  });
});

describe("buildBoard by stage", () => {
  const tree = slice(1, [
    node(1, null),
    node(2, 1, { stage: "idea" }),
    node(3, 1, { stage: "planned" }),
    node(4, 1, { stage: "done", status: "done" }),
    node(5, 1),
    node(6, 1, { stage: "bogus" as never }),
  ]);

  it("has a column per stage in order, then No stage", () => {
    const cols = buildBoard(tree, false, "stage");
    expect(cols.map((c) => c.key)).toEqual([...STAGES, "none"]);
    expect(cols).toHaveLength(9);
    expect(cols[cols.length - 1]?.label).toBe("No stage");
  });

  it("puts each node in its stage column and the rest in No stage", () => {
    const cols = buildBoard(tree, false, "stage");
    const ids = (k: string) => cols.find((c) => c.key === k)?.cards.map((c) => c.node.id) ?? [];
    expect(ids("idea")).toEqual([2]);
    expect(ids("planned")).toEqual([3]);
    expect(ids("done")).toEqual([4]);
    expect(ids("none")).toEqual([5, 6]);
  });
});
