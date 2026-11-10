import { describe, expect, it } from "vitest";
import type { Dart } from "./autodarts";
import { dartLabel, missSegment } from "./autodarts";
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
/** A miss seen just off the board at an angle (degrees clockwise from the top). */
const missAt = (deg: number, over: Partial<Dart> = {}) => {
  const a = (deg * Math.PI) / 180;
  return dart({ kind: "miss", number: null, zone: null, score: 0, x: 1.05 * Math.sin(a), y: 1.05 * Math.cos(a), radius: 1.05, ...over });
};

describe("neighbours", () => {
  it("left one first, as on the board", () => {
    expect(neighbours(20)).toEqual([5, 1]);
    expect(neighbours(3)).toEqual([19, 17]);
    // at the sides the upper one first
    expect(neighbours(6)).toEqual([13, 10]);
    expect(neighbours(11)).toEqual([14, 8]);
  });
});

describe("quick fixes: the fields touching the one counted", () => {
  // Order: the number counted first, then the numbers beside it, lower first; within a number the higher score first.
  it("an outer single: treble and double of the number, the singles beside it", () => {
    expect(labels(dart({}))).toEqual(["triple:20::60", "double:20::40", "single:1:outer:1", "single:5:outer:5"]);
  });
  it("an inner single: treble of the number, the 25, the singles beside it", () => {
    expect(labels(dart({ zone: "inner", radius: 0.3 }))).toEqual(["triple:20::60", "outerBull:::25", "single:1:inner:1", "single:5:inner:5"]);
  });
  it("a treble: the single on the dart's side, the trebles and singles beside it, no double", () => {
    expect(labels(dart({ kind: "triple", zone: null, score: 60, radius: 0.62 }))).toEqual([
      "single:20:outer:20",
      "triple:1::3",
      "single:1:outer:1",
      "triple:5::15",
      "single:5:outer:5",
    ]);
    expect(labels(dart({ kind: "triple", zone: null, score: 60, radius: 0.59 }))).toEqual([
      "single:20:inner:20",
      "triple:1::3",
      "single:1:inner:1",
      "triple:5::15",
      "single:5:inner:5",
    ]);
  });
  it("a double: the single, a miss, the doubles and singles beside it, no treble", () => {
    expect(labels(dart({ kind: "double", zone: null, score: 40, radius: 0.97 }))).toEqual([
      "single:20:outer:20",
      "miss:::0",
      "double:1::2",
      "single:1:outer:1",
      "double:5::10",
      "single:5:outer:5",
    ]);
  });
  it("a miss beside a number: double and single of it, then those beside it (M20: D20 S20 D1 S1 D5 S5)", () => {
    expect(labels(missAt(0))).toEqual(["double:20::40", "single:20:outer:20", "double:1::2", "single:1:outer:1", "double:5::10", "single:5:outer:5"]);
    expect(labels(missAt(54))).toEqual(["double:4::8", "single:4:outer:4", "double:13::26", "single:13:outer:13", "double:18::36", "single:18:outer:18"]);
  });
  it("a miss without a spot of its own has none", () => {
    expect(quickFixes(missAt(54, { method: "manual" }))).toEqual([]);
    expect(quickFixes(missAt(54, { x: 0, y: 0, radius: 0 }))).toEqual([]);
    expect(quickFixes(missAt(54, { failed: true }))).toEqual([]);
  });
  it("the bulls swap", () => {
    expect(labels(dart({ kind: "bull", number: null, zone: null, score: 50 }))).toEqual(["outerBull:::25"]);
    expect(labels(dart({ kind: "outerBull", number: null, zone: null, score: 25 }))).toEqual(["bull:::50"]);
  });
  it("keeps the spot, marked as set by hand", () => {
    const [f] = quickFixes(dart({ x: 0.02, y: 0.61, radius: 0.61 }));
    expect(f).toMatchObject({ x: 0.02, y: 0.61, radius: 0.61, method: "manual", bouncer: false, failed: false });
  });
});

describe("misses beside a number", () => {
  it("are named after it, like Autodarts does", () => {
    expect(missSegment(missAt(54))).toBe(4);
    expect(missSegment(missAt(180))).toBe(3);
    expect(missSegment(missAt(-18))).toBe(5);
    expect(dartLabel(missAt(54))).toBe("M4");
  });
  it("a miss set by hand stays a plain miss", () => {
    expect(missSegment(missAt(54, { method: "manual" }))).toBeNull();
    expect(dartLabel(missAt(54, { method: "manual" }))).not.toBe("M4");
  });
});
