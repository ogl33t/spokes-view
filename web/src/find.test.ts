import { describe, expect, it } from "vitest";
import { findNodes, parseSpokeId } from "./find";
import type { ViewNode } from "./types";

function node(id: number, title: string, effective_priority: number | null = null): ViewNode {
  return { id, title, effective_priority } as ViewNode;
}

const ids = (nodes: ViewNode[]) => nodes.map((n) => n.id);

describe("parseSpokeId", () => {
  it("reads SPOKE-N, spoke N and a bare number, case-insensitively", () => {
    expect(parseSpokeId("SPOKE-12")).toBe(12);
    expect(parseSpokeId("spoke-12")).toBe(12);
    expect(parseSpokeId("spoke 12")).toBe(12);
    expect(parseSpokeId("Spoke12")).toBe(12);
    expect(parseSpokeId("12")).toBe(12);
    expect(parseSpokeId("  12 ")).toBe(12);
  });

  it("rejects anything else", () => {
    expect(parseSpokeId("")).toBeNull();
    expect(parseSpokeId("spoke")).toBeNull();
    expect(parseSpokeId("SPOKE-")).toBeNull();
    expect(parseSpokeId("12a")).toBeNull();
    expect(parseSpokeId("plan 12")).toBeNull();
    expect(parseSpokeId("-3")).toBeNull();
    expect(parseSpokeId("0")).toBeNull();
    expect(parseSpokeId("99999999999999999999")).toBeNull();
  });
});

describe("findNodes", () => {
  it("ranks exact id, title prefix, word start, then substring", () => {
    const nodes = [
      node(1, "Explanation needed"), // substring "plan"
      node(2, "The plan for spring"), // word start "plan"
      node(3, "Plan the garden"), // title prefix
      node(4, "Unrelated"),
    ];
    expect(ids(findNodes("plan", nodes))).toEqual([3, 2, 1]);
  });

  it("puts the exact id first, before titles containing the digits", () => {
    const nodes = [node(5, "12 monkeys"), node(12, "Water the plants"), node(120, "Other")];
    expect(ids(findNodes("SPOKE-12", nodes))).toEqual([12]);
    expect(ids(findNodes("12", nodes))).toEqual([12, 5]);
  });

  it("is case-insensitive and ignores surrounding spaces", () => {
    const nodes = [node(1, "Garden Shed")];
    expect(ids(findNodes("  gARDEN ", nodes))).toEqual([1]);
    expect(ids(findNodes("SHED", nodes))).toEqual([1]);
  });

  it("breaks ties by effective priority, unset last, then by id", () => {
    const nodes = [
      node(9, "Fix a", null),
      node(4, "Fix b", 3),
      node(7, "Fix c", 1),
      node(2, "Fix d", 3),
      node(1, "Fix e", null),
    ];
    expect(ids(findNodes("fix", nodes))).toEqual([7, 2, 4, 1, 9]);
  });

  it("keeps rank ahead of priority", () => {
    const nodes = [node(1, "Big fix", 1), node(2, "Fix it", null)];
    expect(ids(findNodes("fix", nodes))).toEqual([2, 1]);
  });

  it("returns at most `limit` hits, 8 by default", () => {
    const nodes = Array.from({ length: 20 }, (_, i) => node(i + 1, `Task ${i + 1}`));
    expect(findNodes("task", nodes)).toHaveLength(8);
    expect(ids(findNodes("task", nodes, 3))).toEqual([1, 2, 3]);
    expect(findNodes("task", nodes, 0)).toEqual([]);
  });

  it("finds nothing for an empty query", () => {
    expect(findNodes("   ", [node(1, "Anything")])).toEqual([]);
  });

  it("accepts any iterable, such as a map's values", () => {
    const map = new Map([[1, node(1, "Alpha")]]);
    expect(ids(findNodes("alp", map.values()))).toEqual([1]);
  });
});
