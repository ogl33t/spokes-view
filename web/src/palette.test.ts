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

const STATUSES = ["open", "in-progress", "waiting", "done", "dropped", "alert", "focus", "next"];
const PRIORITIES = ["p1", "p2", "p3", "p4"];

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

describe("base palette", () => {
  for (const [theme, block] of Object.entries(themes)) {
    describe(theme, () => {
      for (const fg of ["text", "muted"]) {
        for (const bg of ["bg", "bg-2"]) {
          it(`--${fg} on --${bg} is readable (>= 4.5:1)`, () => {
            const ratio = contrast(rgb(variable(block, fg)), rgb(variable(block, bg)));
            expect(ratio).toBeGreaterThanOrEqual(4.5);
          });
        }
      }

      // Dark keeps its original graphics floor; light is held to the text bar.
      const floor = theme === "light" ? 4.5 : 3;
      for (const name of [...PRIORITIES, ...STATUSES]) {
        it(`--${name} is visible on --bg (>= ${floor}:1)`, () => {
          const ratio = contrast(rgb(variable(block, name)), rgb(variable(block, "bg")));
          expect(ratio).toBeGreaterThanOrEqual(floor);
        });
      }
    });
  }
});

describe("area palette", () => {
  for (const [theme, block] of Object.entries(themes)) {
    describe(theme, () => {
      for (let slot = 1; slot <= 6; slot++) {
        const area = () => rgb(variable(block, `area-${slot}`));
        for (const bg of ["bg", "bg-2"]) {
          it(`--area-${slot} on --${bg} is visible (>= 3:1)`, () => {
            expect(contrast(area(), rgb(variable(block, bg)))).toBeGreaterThanOrEqual(3);
          });
        }
        it(`--on-area on --area-${slot} is readable (>= 4.5:1)`, () => {
          expect(contrast(rgb(variable(block, "on-area")), area())).toBeGreaterThanOrEqual(4.5);
        });
      }
    });
  }
});
