/// <reference types="node" />
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const STAGES = [
  "idea",
  "backlog",
  "brainstormed",
  "understood",
  "planned",
  "in-progress",
  "in-review",
  "done",
];

const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
const lightStart = css.indexOf("@media (prefers-color-scheme: light)");
const themes: Record<string, string> = {
  dark: css.slice(0, lightStart),
  light: css.slice(lightStart),
};

type Rgb = [number, number, number];

function variable(block: string, name: string): string {
  const hex = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`).exec(block)?.[1];
  if (!hex) throw new Error(`--${name} missing or not a 6-digit hex colour`);
  return hex;
}

function rgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance([r, g, b]: Rgb): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: Rgb, b: Rgb): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function tint([fr, fg, fb]: Rgb, [br, bg, bb]: Rgb, amount: number): Rgb {
  const mix = (f: number, back: number) => f * amount + back * (1 - amount);
  return [mix(fr, br), mix(fg, bg), mix(fb, bb)];
}

describe("stage palette", () => {
  for (const [theme, block] of Object.entries(themes)) {
    describe(theme, () => {
      for (const stage of STAGES) {
        it(`${stage} is defined and readable (>= 4.5:1)`, () => {
          const bg = rgb(variable(block, "bg"));
          const fg = rgb(variable(block, `stage-${stage}`));
          expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
          expect(contrast(fg, tint(fg, bg, 0.16))).toBeGreaterThanOrEqual(4.5);
        });
      }
    });
  }

  it("uses 8 distinct dark colours", () => {
    const values = STAGES.map((s) => variable(themes.dark ?? "", `stage-${s}`));
    expect(new Set(values).size).toBe(8);
  });
});
