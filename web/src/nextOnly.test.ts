import { describe, expect, it } from "vitest";
import { nextOnlyKeep } from "./nextOnly";
import type { ViewNode } from "./types";

function node(id: number, parent: number | null, isNext = false): ViewNode {
  return { id, parent, is_next: isNext } as ViewNode;
}

describe("nextOnlyKeep", () => {
  it("keeps next nodes, their ancestors and the root", () => {
    const nodes = [node(1, null), node(2, 1), node(3, 2), node(4, 3, true), node(5, 2), node(6, 1)];
    expect([...nextOnlyKeep(nodes, 1)].sort()).toEqual([1, 2, 3, 4]);
  });

  it("keeps just the root when nothing is next", () => {
    expect([...nextOnlyKeep([node(1, null), node(2, 1)], 1)]).toEqual([1]);
  });

  it("stops at ancestors that are not present", () => {
    expect([...nextOnlyKeep([node(9, 8, true)], 1)].sort()).toEqual([1, 9]);
  });
});
