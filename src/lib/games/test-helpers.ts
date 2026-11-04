// Readable fixtures for the game tests: darts("T20 D5 25 Bull miss") and turns("T20 T19 D12 | S1 S1 S1").
import type { Dart } from "../autodarts";

export function dart(code: string): Dart {
  const base = { zone: null, x: 0, y: 0, radius: 0.5, bouncer: false, failed: false, method: "test" } as const;
  const c = code.trim().toUpperCase();
  if (c === "MISS") return { ...base, kind: "miss", number: null, score: 0, radius: 1.2 };
  if (c === "BULL" || c === "DB") return { ...base, kind: "bull", number: null, score: 50, radius: 0.02 };
  if (c === "25" || c === "OB") return { ...base, kind: "outerBull", number: null, score: 25, radius: 0.06 };
  const m = /^([SIOTD])(\d{1,2})$/.exec(c);
  if (!m || +m[2] < 1 || +m[2] > 20) throw new Error(`Not a dart: ${code}`);
  const n = +m[2];
  // S = inner single, O = outer single (the "zone" matters to Around the clock)
  if (m[1] === "T") return { ...base, kind: "triple", number: n, score: n * 3 };
  if (m[1] === "D") return { ...base, kind: "double", number: n, score: n * 2 };
  return { ...base, kind: "single", number: n, score: n, zone: m[1] === "O" ? "outer" : "inner" };
}

export const darts = (codes: string): Dart[] => (codes.trim() ? codes.trim().split(/\s+/).map(dart) : []);

/** Turns separated by "|". */
export const turns = (codes: string): Dart[][] => codes.split("|").map(darts);

/** A turn of three misses, e.g. to burn through the darts of an attempt. */
export const MISSES = "miss miss miss";
