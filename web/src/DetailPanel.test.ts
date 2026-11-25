import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DetailPanel, branchProgress, type DetailState } from "./DetailPanel";
import type { ViewNode } from "./types";

function node(over: Partial<ViewNode>): ViewNode {
  return {
    id: 1,
    parent: null,
    kind: "task",
    ordered: false,
    title: "Node",
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
    created_at: "2026-11-01T10:00:00Z",
    updated_at: "2026-11-02T10:00:00Z",
    touched_at: "2026-11-03T10:00:00Z",
    child_count: 0,
    descendant_count: 0,
    closed_child_count: 0,
    children_loaded: true,
    ...over,
  };
}

const parent = node({
  id: 10,
  parent: 2,
  title: "Ship the workbench",
  kind: "task",
  ordered: true,
  status: "in_progress",
  effective_priority: 2,
  child_count: 2,
  descendant_count: 3,
  closed_child_count: 2,
});
const kids = [
  node({ id: 11, parent: 10, title: "Design", status: "done" }),
  node({ id: 12, parent: 10, title: "Build", status: "in_progress", is_next: true }),
  node({ id: 13, parent: 10, title: "Release", status: "open" }),
];

function detailOf(n: ViewNode): DetailState {
  return {
    id: n.id,
    etag: null,
    error: null,
    loading: false,
    data: {
      rev: 1,
      version: "0.5.0",
      time_zone: "UTC",
      today: "2026-11-24",
      path: [{ id: 2, title: "Work" }],
      node: { ...n, notes: "Some notes" },
      events: [{ id: 1, at: "2026-11-03T10:00:00Z", agent: "a", type: "created", detail: null }],
    },
  };
}

function render(extra: Record<string, unknown> = {}): string {
  return renderToStaticMarkup(
    createElement(DetailPanel, {
      detail: detailOf(parent),
      children: kids,
      areaSlot: 3,
      timeZone: "UTC",
      today: "2026-11-24",
      server: "home",
      onClose: () => {},
      onSelect: () => {},
      ...extra,
    }),
  );
}

describe("DetailPanel", () => {
  it("renders every section for a node with children", () => {
    const html = render({ onFocus: () => {}, onToggle: () => {}, expanded: false });
    for (const part of [
      "Work",
      "Close details",
      "Ship the workbench",
      "SPOKE-10",
      "in progress",
      "P2",
      "2 of 4 done",
      "Next step",
      "Build",
      "Focus branch",
      "Backlog",
      "Kanban",
      "Expand (3 beneath)",
      "Children",
      "Design",
      "Release",
      "Notes",
      "Some notes",
      "Recent events",
      "created",
      "Times in UTC",
    ]) {
      expect(html).toContain(part);
    }
  });

  it("offers Show in tree when there is no focus handler", () => {
    const html = render({ treeHref: "/?server=home" });
    expect(html).toContain("Show in tree");
    expect(html).not.toContain("Focus branch");
  });

  it("caps the children list at 12 and counts the rest", () => {
    const many = Array.from({ length: 15 }, (_, i) =>
      node({ id: 100 + i, parent: 10, title: `Kid ${i}` }),
    );
    const html = render({ children: many });
    expect(html).toContain("Kid 11");
    expect(html).not.toContain("Kid 12");
    expect(html).toContain("+3 more");
  });

  it("colours an area's dot with its area slot", () => {
    const area = node({ id: 2, kind: "area", title: "Work", child_count: 1 });
    const html = render({ detail: detailOf(area), children: [] });
    expect(html).toContain("var(--area-3)");
  });
});

describe("branchProgress", () => {
  it("uses the server's progress when present", () => {
    const n = node({ progress: { done: 2, total: 4 } });
    expect(branchProgress(n, kids)).toEqual({ done: 2, active: 1, total: 4 });
  });
  it("counts closed children the tree leaves out as done", () => {
    expect(branchProgress(parent, kids)).toEqual({ done: 2, active: 1, total: 4 });
  });
  it("is null for a leaf", () => {
    expect(branchProgress(node({}), [])).toBeNull();
  });
});
