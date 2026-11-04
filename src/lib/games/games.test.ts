import { describe, expect, it } from "vitest";
import { aroundTheClock } from "./around-the-clock";
import { complexDoubles } from "./complex-doubles";
import { scoring } from "./scoring";
import { simpleDoubles } from "./simple-doubles";
import { oneTwentyOne } from "./121";
import { turns } from "./test-helpers";

const open = { open: false };

describe("Plan B (complex doubles)", () => {
  const play = (t: string) => complexDoubles.compute(turns(t), { double: 16 }, open);
  it("dart 1 on the double is a success and a great turn", () => {
    const r = play("D16");
    expect(r.values).toMatchObject({ successes: 1, rounds: 1, firstDart: 1 });
    expect(r.moments).toHaveLength(1);
  });
  it("a single changes the target to the double of half the rest", () => {
    // 32 - 16 = 16 -> D8
    const r = complexDoubles.compute(turns("S16"), { double: 16 }, { open: true });
    expect(r.focus?.value).toBe("D8");
    expect(play("S16 D8").values).toMatchObject({ successes: 1, secondDart: 1 });
  });
  it("an odd rest after dart 2 sends you to the bull", () => {
    const r = complexDoubles.compute(turns("S1 S2"), { double: 16 }, { open: true });
    expect(r.focus?.value).toBeTruthy();
    expect(r.targets).toEqual([{ bed: "bull" }]);
  });
  it("going past the rest is a lost round with No Score", () => {
    const r = play("T20 T20 T20");
    expect(r.values).toMatchObject({ successes: 0, rounds: 1 });
    expect(r.noScore).toBeDefined();
  });
});

describe("Double Trouble (simple doubles)", () => {
  it("counts hits on the chosen double and finds 3 of 3", () => {
    const r = simpleDoubles.compute(turns("D20 D20 D20 | D20 S20 miss"), { double: 20 }, open);
    expect(r.values).toMatchObject({ hits: 4, darts: 6 });
    expect(r.moments).toHaveLength(1);
  });
  it("the bull is a double", () => {
    expect(simpleDoubles.compute(turns("bull 25"), { double: 25 }, open).values.hits).toBe(1);
  });
});

describe("Ton Machine (scoring)", () => {
  it("three-dart average, best turn, ton-plus", () => {
    const r = scoring.compute(turns("T20 T20 T20 | S1 S1 S1"), {}, open);
    expect(r.values).toMatchObject({ average: 91.5, bestTurn: 180, tonPlus: 1, triples: 3 });
  });
});

describe("Clockwork (around the clock)", () => {
  const s = { direction: "cw", zone: "innerSingle", finish: "bull" };
  it("goes clockwise from 1, 18, 4 ...", () => {
    const r = aroundTheClock.compute(turns("S1 S18 miss"), s, open);
    expect(r.values).toMatchObject({ progress: 2, hits: 2, darts: 3 });
    expect(aroundTheClock.compute(turns("S1"), { ...s, direction: "ccw" }, open).values.progress).toBe(1);
  });
  it("the wrong ring doesn't count", () => {
    expect(aroundTheClock.compute(turns("O1"), s, open).values.progress).toBe(0);
    expect(aroundTheClock.compute(turns("T1"), { ...s, zone: "triple" }, open).values.progress).toBe(1);
  });
  it("three hits in one turn is a great turn", () => {
    expect(aroundTheClock.compute(turns("S1 S18 S4"), s, open).moments).toHaveLength(1);
  });
  it("finishes on the bull, and restarts with a time cap", () => {
    const order = "S1 S18 S4 S13 S6 S10 S15 S2 S17 S3 S19 S7 S16 S8 S11 S14 S9 S12 S5 S20 bull";
    const done = aroundTheClock.compute(turns(order), s, open);
    expect(done.done).toBe(true);
    const again = aroundTheClock.compute(turns(order), s, { open: false, repeat: true });
    expect(again.values).toMatchObject({ rounds: 1, progress: 0 });
    expect(aroundTheClock.compute(turns(order.replace("bull", "25")), s, open).done).toBe(false);
    expect(aroundTheClock.compute(turns(order.replace("bull", "25")), { ...s, finish: "anyBull" }, open).done).toBe(true);
  });
});

describe("corrections replay", () => {
  it("121 with a dart changed equals playing it that way from the start", () => {
    const base = turns("T20 T11 miss");
    const fixed = turns("T20 T11 D14");
    const corrected = base.map((t, i) => (i === 0 ? [t[0], t[1], fixed[0][2]] : t));
    expect(oneTwentyOne.compute(corrected, oneTwentyOne.defaultSettings, open)).toEqual(
      oneTwentyOne.compute(fixed, oneTwentyOne.defaultSettings, open),
    );
  });
});
