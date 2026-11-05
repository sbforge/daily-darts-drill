import { describe, expect, it } from "vitest";
import { jdcChallenge, maxScore, plan } from "./jdc-challenge";
import { MISSES, turns } from "./test-helpers";

const play = (t: string, s = {}, ctx = {}) =>
  jdcChallenge.compute(turns(t), { ...jdcChallenge.defaultSettings, ...s }, { open: false, ...ctx });
const misses = (n: number) => Array(n).fill(MISSES).join(" | ");

describe("JDC Challenge", () => {
  it("plans 6 + 7 + 6 visits per pass", () => {
    expect(plan(1)).toHaveLength(19);
    expect(plan(5)).toHaveLength(95);
    expect(maxScore(1)).toBe(3380);
  });
  it("starts on the 10", () => {
    const r = jdcChallenge.compute([], jdcChallenge.defaultSettings, { open: false });
    expect(r.focus?.value).toBe("10");
    expect(r.targets).toHaveLength(4);
  });
  it("hits on the number score their value, other numbers nothing", () => {
    // 1 visit per number: 10, then 11, 12, 13
    const r = play(`${misses(3)} | S13 T13 S6`, { visits: 1 });
    expect(r.values.score).toBe(52);
    expect(r.values).toMatchObject({ segmentHits: 2, segmentDarts: 12 });
  });
  it("a Shanghai is 100 extra", () => {
    const r = play("S10 D10 T10", { visits: 1 });
    expect(r.values).toMatchObject({ score: 160, shanghais: 1, part1: 160 });
    expect(r.moments).toHaveLength(1);
    expect(play("O10 T10 D10", { visits: 1 }).values.shanghais).toBe(1);
    expect(play("S10 S10 T10", { visits: 1 }).values.shanghais).toBe(0);
  });
  it("visits on one number come in a row", () => {
    expect(play(misses(4)).focus?.value).toBe("10");
    expect(play(misses(5)).focus?.value).toBe("11");
    expect(play(misses(4)).focus?.hint).toBe("Visit 5 of 5");
  });
  it("part 2 is one dart per double, 50 a double and 100 for the bull", () => {
    const r = play(`${misses(6)} | D1 D2 D3 | ${misses(5)} | D19 D20 bull`, { visits: 1 });
    expect(r.values).toMatchObject({ part2: 50 * 5 + 100, doubleHits: 6, doubleDarts: 21 });
    // D2 on dart 1 is the wrong double
    expect(play(`${misses(6)} | D2 miss miss`, { visits: 1 }).values.part2).toBe(0);
  });
  it("the next dart's double follows the darts on the board", () => {
    const r = jdcChallenge.compute(turns(`${misses(6)} | D1`), { visits: 1 }, { open: true });
    expect(r.focus?.value).toBe("D2");
    expect(r.targets).toEqual([{ bed: "double", number: 2 }]);
    expect(r.darts).toMatchObject({ used: 1, total: 3 });
  });
  it("part 3 goes from 15 to 20 and the challenge ends", () => {
    const r = play(`${misses(13)} | S20 D20 T20`, { visits: 1 });
    expect(r.focus?.value).toBe("16"); // the 15 got S20 D20 T20: nothing
    const done = play(`${misses(18)} | S20 D20 T20`, { visits: 1 });
    expect(done.done).toBe(true);
    expect(done.values).toMatchObject({ part3: 220, score: 220 });
  });
  it("starts over with a time cap", () => {
    const r = play(misses(19), { visits: 1 }, { repeat: true });
    expect(r.done).toBe(false);
    expect(r.values.games).toBe(1);
    expect(r.focus?.value).toBe("10");
  });
  it("can't go over the most points", () => {
    const shanghai = (from: number) => Array.from({ length: 6 }, (_, i) => `S${from + i} D${from + i} T${from + i}`).join(" | ");
    const doubles = "D1 D2 D3 | D4 D5 D6 | D7 D8 D9 | D10 D11 D12 | D13 D14 D15 | D16 D17 D18 | D19 D20 bull";
    const r = play(`${shanghai(10)} | ${doubles} | ${shanghai(15)}`, { visits: 1 });
    expect(r.values.score).toBe(3380);
    expect(r.done).toBe(true);
  });
});
