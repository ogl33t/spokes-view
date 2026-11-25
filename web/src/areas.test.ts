import { describe, expect, it } from "vitest";
import { AREA_SLOTS, areaOf, areaSlots } from "./areas";
import { emptyStore, ROOT_ID, type Store } from "./treeStore";
import type { ViewNode } from "./types";

function build(areaCount: number): Store {
  const store = emptyStore();
  const add = (id: number, parent: number | null, kind: "area" | "task") => {
    store.nodes.set(id, { id, parent, kind } as ViewNode);
    if (parent !== null) store.children.set(parent, [...(store.children.get(parent) ?? []), id]);
  };
  add(ROOT_ID, null, "task");
  for (let i = 0; i < areaCount; i++) add(100 + i, ROOT_ID, "area");
  add(500, 100, "task");
  add(501, 500, "task");
  return store;
}

describe("areaSlots", () => {
  it("numbers areas in child order and cycles past the slot count", () => {
    const slots = areaSlots(build(AREA_SLOTS + 2));
    expect(slots.get(100)).toBe(1);
    expect(slots.get(105)).toBe(6);
    expect(slots.get(106)).toBe(1);
    expect(slots.get(107)).toBe(2);
  });
});

describe("areaOf", () => {
  const store = build(2);
  it("is null at the root", () => expect(areaOf(store, ROOT_ID)).toBeNull());
  it("is the node itself at depth 1", () => expect(areaOf(store, 101)).toBe(101));
  it("is the depth-1 ancestor at depth 3", () => expect(areaOf(store, 501)).toBe(100));
  it("is null for an unknown id", () => expect(areaOf(store, 999)).toBeNull());
});
