import { describe, expect, it } from "vitest";
import { localizeTimes } from "./DetailPanel";
import { daysUntil, clip, formatInstant, typeOf, stageOf, STAGES } from "./format";
import type { ViewNode } from "./types";

describe("format", () => {
  it("counts days between calendar dates", () => {
    expect(daysUntil("2026-11-15", "2026-11-20")).toBe(5);
    expect(daysUntil("2026-11-15", "2026-11-14")).toBe(-1);
    expect(daysUntil("2026-12-31", "2027-01-01")).toBe(1);
  });

  it("clips long titles with an ellipsis", () => {
    expect(clip("short", 10)).toBe("short");
    expect(clip("a much longer title", 8)).toBe("a much…");
  });

  it("shows UTC instants in the server's zone", () => {
    const local = formatInstant("2026-11-16T02:59:03Z", "America/Chicago");
    expect(local).toContain("8:59");
    expect(localizeTimes("until 2026-11-16T02:59:03Z", "America/Chicago")).toBe(`until ${local}`);
    expect(formatInstant("2026-11-16T02:59:03Z", "Not/AZone")).toContain("UTC");
  });

  it("reads type and stage, treating missing, null and unknown as unset", () => {
    const n = (over: object) => over as ViewNode;
    expect(typeOf(n({ type: "bug" }))).toBe("bug");
    expect(typeOf(n({ type: null }))).toBeNull();
    expect(typeOf(n({}))).toBeNull();
    expect(typeOf(n({ type: "saga" }))).toBeNull();
    expect(stageOf(n({ stage: "in_review" }))).toBe("in_review");
    expect(stageOf(n({ stage: null }))).toBeNull();
    expect(stageOf(n({}))).toBeNull();
    expect(stageOf(n({ stage: "shipped" }))).toBeNull();
  });

  it("lists the stages in workflow order", () => {
    expect(STAGES).toEqual([
      "idea",
      "backlog",
      "brainstormed",
      "understood",
      "planned",
      "in_progress",
      "in_review",
      "done",
    ]);
    expect(STAGES).toHaveLength(8);
  });
});
