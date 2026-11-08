import { describe, expect, it } from "vitest";
import type { Dart } from "./autodarts";
import { neighbours, quickFixes } from "./quickfix";

const dart = (over: Partial<Dart>): Dart => ({
  kind: "single",
  number: 20,
  zone: "outer",
  score: 20,
  x: 0.01,
  y: 0.8,
  radius: 0.8,
  bouncer: false,
  failed: false,
  method: "Detection",
  ...over,
});
const labels = (d: Dart) => quickFixes(d).map((f) => `${f.kind}:${f.number ?? ""}:${f.zone ?? ""}:${f.score}`);

describe("neighbours", () => {
  it("left one first, as on the board", () => {
    expect(neighbours(20)).toEqual([5, 1]);
    expect(neighbours(3)).toEqual([19, 17]);
    // at the sides the upper one first
    expect(neighbours(6)).toEqual([13, 10]);
    expect(neighbours(11)).toEqual([14, 8]);
  });
});

describe("quick fixes", () => {
  it("a single: the triple and double of the number, the single beside it", () => {
    expect(labels(dart({}))).toEqual(["triple:20::60", "double:20::40", "single:5:outer:5", "single:1:outer:1"]);
    expect(labels(dart({ zone: "inner", radius: 0.3 }))).toEqual(["triple:20::60", "double:20::40", "single:5:inner:5", "single:1:inner:1"]);
  });
  it("a double: the single and triple of the number, the doubles beside it", () => {
    expect(labels(dart({ kind: "double", zone: null, score: 40 }))).toEqual(["single:20:outer:20", "triple:20::60", "double:5::10", "double:1::2"]);
  });
  it("a triple: the single on the dart's side, the double, the triples beside it", () => {
    expect(labels(dart({ kind: "triple", zone: null, score: 60, radius: 0.59 }))[0]).toBe("single:20:inner:20");
    expect(labels(dart({ kind: "triple", zone: null, score: 60, radius: 0.62 }))).toEqual(["single:20:outer:20", "double:20::40", "triple:5::15", "triple:1::3"]);
  });
  it("the bulls swap, a miss has none", () => {
    expect(labels(dart({ kind: "bull", number: null, zone: null, score: 50 }))).toEqual(["outerBull:::25"]);
    expect(labels(dart({ kind: "outerBull", number: null, zone: null, score: 25 }))).toEqual(["bull:::50"]);
    expect(quickFixes(dart({ kind: "miss", number: null, zone: null, score: 0 }))).toEqual([]);
  });
  it("keeps the spot, marked as set by hand", () => {
    const [f] = quickFixes(dart({ x: 0.02, y: 0.61, radius: 0.61 }));
    expect(f).toMatchObject({ x: 0.02, y: 0.61, radius: 0.61, method: "manual", bouncer: false, failed: false });
  });
});
