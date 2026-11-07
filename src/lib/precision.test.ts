import { describe, expect, it } from "vitest";
import type { Dart } from "./autodarts";
import { aroundTheClock, bobs27, bullX, complexDoubles, jdcChallenge, simpleDoubles, soloLeg } from "./games";
import { turns } from "./games/test-helpers";
import { aimsOf, byField, fieldCenter, fieldKey, measurable, measureGame, MM, spreadOf } from "./precision";

const label = (a: ReturnType<typeof aimsOf>) =>
  a.map((turn) => turn.map((x) => (x ? `${fieldKey(x.field)}${x.hit ? "+" : ""}` : "-")).join(" ")).join(" | ");

/** A dart at a point of the board (board units, +y up). */
const at = (x: number, y: number, over: Partial<Dart> = {}): Dart => ({
  kind: "double",
  number: 20,
  zone: null,
  score: 40,
  x,
  y,
  radius: Math.hypot(x, y),
  bouncer: false,
  failed: false,
  method: "test",
  ...over,
});

describe("field centres", () => {
  it("the bulls centre on the middle, segments on the middle of their bed", () => {
    expect(fieldCenter({ bed: "bull" })).toEqual({ x: 0, y: 0 });
    expect(fieldCenter({ bed: "outerBull" })).toEqual({ x: 0, y: 0 });
    const d20 = fieldCenter({ bed: "double", number: 20 });
    expect(d20.x).toBeCloseTo(0);
    expect(d20.y).toBeCloseTo((0.953 + 1) / 2);
    // D6 is to the right (90°), D3 at the bottom (180°)
    expect(fieldCenter({ bed: "double", number: 6 }).x).toBeCloseTo((0.953 + 1) / 2);
    expect(fieldCenter({ bed: "double", number: 3 }).y).toBeCloseTo(-(0.953 + 1) / 2);
  });
});

describe("aims from the game's rules", () => {
  it("simple doubles: every dart at the double", () => {
    expect(label(aimsOf(simpleDoubles, turns("D16 S16 D8"), { double: 16 }, true))).toBe("double:16+ double:16 double:16");
  });

  it("around the clock: the number moves on with a hit, even within a turn", () => {
    const a = aimsOf(aroundTheClock, turns("T1 S1 S18 | S18 S4 S4"), { direction: "cw", zone: "triple", finish: "bull" }, true);
    expect(label(a)).toBe("triple:1+ triple:18 triple:18 | triple:18 triple:18 triple:18");
  });

  it("bob's 27: one double per turn", () => {
    expect(label(aimsOf(bobs27, turns("D1 S1 miss | D2 D2 S2"), { playOn: "off" }, false))).toBe(
      "double:1+ double:1 double:1 | double:2+ double:2+ double:2",
    );
  });

  it("complex doubles: set-up darts have no aim", () => {
    // D20 missed with S1: 39 left, set up (no aim); then 2 darts in: S7 leaves 32, D16 next
    expect(label(aimsOf(complexDoubles, turns("S1 S7 D16"), { double: 20 }, true))).toBe("double:20 - double:16+");
  });

  it("bull-x: both bulls count as one aim at the centre; a doubles recovery aims at the double", () => {
    expect(label(aimsOf(bullX, turns("25 S7 D7"), { variant: "doubles", bullseyeOnly: "off" }, true))).toBe("bull+ bull bull");
    expect(label(aimsOf(bullX, turns("S7 S7 D7"), { variant: "doubles", bullseyeOnly: "off" }, true))).toBe("bull double:7 double:7+");
    // Shanghai leaves a choice of fields for dart 2; once only the treble is left, that is the aim
    expect(label(aimsOf(bullX, turns("S7 D7 T7"), { variant: "shanghai", bullseyeOnly: "off" }, true))).toBe("bull - triple:7+");
  });

  it("jdc: the shanghai part has no aim", () => {
    const a = aimsOf(jdcChallenge, turns("S10 D10 T10"), jdcChallenge.defaultSettings, false);
    expect(label(a)).toBe("- - -");
  });

  it("a game whose targets are only suggestions counts nothing", () => {
    expect(label(aimsOf(soloLeg, turns("T20 T20 T20"), soloLeg.defaultSettings, false))).toBe("- - -");
  });
});

describe("measuring", () => {
  const center = fieldCenter({ bed: "double", number: 20 });

  it("offsets in mm, +y up, from the aimed field's centre", () => {
    const g = {
      id: "g",
      gameId: "simple-doubles",
      startedAt: "2026-11-01T10:00:00Z",
      minutes: 5,
      settings: { double: 20 },
      turns: [[at(center.x + 2 / MM, center.y - 4 / MM), at(center.x - 2 / MM, center.y - 4 / MM, { kind: "single", zone: "outer", score: 20 })]],
    };
    const m = measureGame(simpleDoubles, g);
    expect(m).toHaveLength(2);
    expect(m[0].dx).toBeCloseTo(2);
    expect(m[0].dy).toBeCloseTo(-4);
    expect(m[0].hit).toBe(true);
    expect(m[1].hit).toBe(false);
    const s = spreadOf(m)!;
    expect(s.biasX).toBeCloseTo(0);
    expect(s.biasY).toBeCloseTo(-4);
    expect(s.meanDist).toBeCloseTo(Math.hypot(2, 4));
    expect(s.scatter).toBeCloseTo(2);
    expect(s.hitRate).toBe(50);
    expect(byField(m).map((f) => f.key)).toEqual(["double:20"]);
  });

  it("darts without a position don't count", () => {
    expect(measurable(at(0, 0))).toBe(false);
    expect(measurable(at(0, 0, { kind: "bull" }))).toBe(true);
    expect(measurable(at(0.1, 0.9, { bouncer: true }))).toBe(false);
    expect(measurable(at(0.1, 0.9, { failed: true }))).toBe(false);
  });

  it("no darts, no spread", () => {
    expect(spreadOf([])).toBeNull();
  });
});
