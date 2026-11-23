import { describe, expect, it } from "vitest";
import {
  ancestors,
  buildStore,
  closeOthers,
  fullExpansion,
  initialExpansion,
  knownChildren,
  missingChildren,
  needsFetch,
  ROOT_ID,
} from "./treeStore";
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

function slice(root: number, nodes: ViewNode[], truncated = false): TreeResponse {
  return {
    rev: 1,
    version: "0.2.0",
    time_zone: "UTC",
    today: "2026-11-15",
    root,
    depth: 3,
    include_closed: false,
    node_limit: 2000,
    path: [],
    truncated,
    nodes,
  };
}

describe("buildStore", () => {
  const first = slice(
    1,
    [
      node(1, null, { child_count: 2, descendant_count: 4 }),
      node(2, 1, { child_count: 2, descendant_count: 2, children_loaded: false }),
      node(3, 1),
    ],
    true,
  );
  const branch = slice(2, [
    node(2, 1, { child_count: 2, descendant_count: 2 }),
    node(4, 2),
    node(5, 2),
  ]);

  it("rebuilds children from parent ids in order", () => {
    const s = buildStore([first]);
    expect(knownChildren(s, 1)).toEqual([2, 3]);
    expect(knownChildren(s, 2)).toEqual([]);
    expect(needsFetch(s, 2)).toBe(true);
    expect(needsFetch(s, 3)).toBe(false);
    expect(s.truncated).toBe(true);
    expect(s.meta?.time_zone).toBe("UTC");
  });

  it("merges a branch fetched later", () => {
    const s = buildStore([first, branch]);
    expect(knownChildren(s, 2)).toEqual([4, 5]);
    expect(needsFetch(s, 2)).toBe(false);
    expect(ancestors(s, 5)).toEqual([1, 2]);
  });

  it("keeps a branch's children when a later slice has the node unloaded", () => {
    const s = buildStore([branch, first]);
    expect(knownChildren(s, 2)).toEqual([4, 5]);
    expect(needsFetch(s, 2)).toBe(false);
  });

  it("counts children cut off by the node cap", () => {
    const s = buildStore([
      slice(
        7,
        [node(7, 1, { child_count: 2500, children_loaded: false }), node(8, 7), node(9, 7)],
        true,
      ),
    ]);
    expect(knownChildren(s, 7)).toEqual([8, 9]);
    expect(needsFetch(s, 7)).toBe(false);
    expect(missingChildren(s, 7)).toBe(2498);
  });

  it("drops nodes that are no longer under their parent", () => {
    const later = slice(1, [node(1, null, { child_count: 1 }), node(3, 1)]);
    const s = buildStore([later]);
    expect(knownChildren(s, 1)).toEqual([3]);
  });
});

describe("initialExpansion", () => {
  it("opens levels while the drawn count fits the budget", () => {
    const nodes = [node(1, null, { child_count: 3 })];
    for (const a of [2, 3, 4]) {
      nodes.push(node(a, 1, { child_count: 10 }));
      for (let i = 0; i < 10; i++) nodes.push(node(a * 100 + i, a));
    }
    const s = buildStore([slice(1, nodes)]);
    expect([...initialExpansion(s, 40)].sort()).toEqual([1, 2, 3, 4]);
    expect([...initialExpansion(s, 10)]).toEqual([1]);
  });

  it("always opens the root even past the budget", () => {
    const nodes = [node(1, null, { child_count: 50 })];
    for (let i = 0; i < 50; i++) nodes.push(node(10 + i, 1));
    expect([...initialExpansion(buildStore([slice(1, nodes)]), 5)]).toEqual([1]);
  });
});

describe("fullExpansion", () => {
  const store = buildStore([
    slice(1, [
      node(1, null, { child_count: 2 }),
      node(2, 1, { child_count: 2 }),
      node(4, 2),
      node(5, 2, { child_count: 3, children_loaded: false }),
      node(3, 1, { child_count: 1, children_loaded: false }),
    ]),
  ]);

  it("opens every loaded branch and lists the ones that still need a fetch", () => {
    const plan = fullExpansion(store, 100);
    expect([...plan.expanded].sort()).toEqual([1, 2]);
    expect(plan.pending.sort()).toEqual([3, 5]);
    expect(plan.limited).toBe(false);
  });

  it("stops at the budget, shallow levels first", () => {
    const plan = fullExpansion(store, 3);
    expect([...plan.expanded]).toEqual([1]);
    expect(plan.pending).toEqual([]);
    expect(plan.limited).toBe(true);
  });
});

describe("closeOthers", () => {
  const store = buildStore([
    slice(1, [
      node(1, null, { child_count: 2 }),
      node(2, 1, { child_count: 2 }),
      node(3, 1, { child_count: 1 }),
      node(4, 2, { child_count: 2 }),
      node(5, 2, { child_count: 1 }),
      node(6, 4, { child_count: 1 }),
      node(7, 4),
      node(8, 3),
      node(9, 5),
      node(10, 6),
    ]),
  ]);
  const open = new Set([1, 2, 3, 4, 5, 6]);

  it("collapses sibling branches", () => {
    const next = closeOthers(store, open, 4);
    expect(next.has(3)).toBe(false);
    expect(next.has(5)).toBe(false);
  });

  it("keeps the path to the node open", () => {
    const next = closeOthers(store, open, 4);
    expect(next.has(1)).toBe(true);
    expect(next.has(2)).toBe(true);
  });

  it("keeps the node's own open descendants open", () => {
    const next = closeOthers(store, open, 4);
    expect(next.has(4)).toBe(true);
    expect(next.has(6)).toBe(true);
  });

  it("leaves a collapsed node collapsed", () => {
    const next = closeOthers(store, new Set([1, 2, 6]), 4);
    expect(next.has(4)).toBe(false);
    expect(next.has(6)).toBe(true);
  });

  it("always includes the root and does not mutate the input", () => {
    const input = new Set([2]);
    expect(closeOthers(store, input, 3).has(ROOT_ID)).toBe(true);
    expect([...input]).toEqual([2]);
  });
});
