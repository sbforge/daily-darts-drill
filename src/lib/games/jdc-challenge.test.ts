import { describe, expect, it } from "vitest";
import { jdcChallenge, MAX_SCORE, PLAN } from "./jdc-challenge";
import { MISSES, turns } from "./test-helpers";

const play = (t: string, s = {}, ctx = {}) =>
  jdcChallenge.compute(turns(t), { ...jdcChallenge.defaultSettings, ...s }, { open: false, ...ctx });
const misses = (n: number) => Array(n).fill(MISSES).join(" | ");

describe("JDC Challenge", () => {
  it("one round is 6 + 7 + 6 visits, 57 darts, at most 3380 points", () => {
    expect(PLAN).toHaveLength(19);
    expect(MAX_SCORE).toBe(3380);
  });
  it("starts on the 10", () => {
    const r = jdcChallenge.compute([], jdcChallenge.defaultSettings, { open: false });
    expect(r.focus?.value).toBe("10");
    expect(r.targets).toHaveLength(4);
  });
  it("hits on the number score their value, other numbers nothing", () => {
    // 1 visit per number: 10, then 11, 12, 13
    const r = play(`${misses(3)} | S13 T13 S6`);
    expect(r.values.score).toBe(52);
    expect(r.values).toMatchObject({ segmentHits: 2, segmentDarts: 12 });
  });
  it("a Shanghai is 100 extra", () => {
    const r = play("S10 D10 T10");
    expect(r.values).toMatchObject({ score: 160, shanghais: 1, part1: 160 });
    expect(r.moments).toHaveLength(1);
    expect(play("O10 T10 D10").values.shanghais).toBe(1);
    expect(play("S10 S10 T10").values.shanghais).toBe(0);
  });
  it("one visit per number", () => {
    expect(play(misses(1)).focus?.value).toBe("11");
    expect(play(misses(1)).focus?.hint).toBeUndefined();
  });
  it("ignores the old visits setting", () => {
    expect(play(misses(1), { visits: 5 }).focus?.value).toBe("11");
  });
  it("part 2 is one dart per double, 50 a double and 100 for the bull", () => {
    const r = play(`${misses(6)} | D1 D2 D3 | ${misses(5)} | D19 D20 bull`);
    expect(r.values).toMatchObject({ part2: 50 * 5 + 100, doubleHits: 6, doubleDarts: 21 });
    // D2 on dart 1 is the wrong double
    expect(play(`${misses(6)} | D2 miss miss`).values.part2).toBe(0);
  });
  it("the next dart's double follows the darts on the board", () => {
    const r = jdcChallenge.compute(turns(`${misses(6)} | D1`), {}, { open: true });
    expect(r.focus?.value).toBe("D2");
    expect(r.targets).toEqual([{ bed: "double", number: 2 }]);
    expect(r.darts).toMatchObject({ used: 1, total: 3 });
  });
  it("part 3 goes from 15 to 20 and the challenge ends", () => {
    const r = play(`${misses(13)} | S20 D20 T20`);
    expect(r.focus?.value).toBe("16"); // the 15 got S20 D20 T20: nothing
    const done = play(`${misses(18)} | S20 D20 T20`);
    expect(done.done).toBe(true);
    expect(done.values).toMatchObject({ part3: 220, score: 220 });
  });
  it("shows the round's result while its last darts are on the board", () => {
    const open = (t: string, s = {}) => jdcChallenge.compute(turns(t), { ...jdcChallenge.defaultSettings, ...s }, { open: true });
    // Not yet: two darts of the last visit.
    expect(open(`${misses(18)} | S20 D20`).roundEnd).toBeUndefined();
    const r = open(`S10 D10 T10 | ${misses(5)} | D1 D2 D3 | ${misses(11)} | S20 D20 T20`);
    expect(r.roundEnd).toMatchObject({ turn: 18, title: "Round complete", score: { value: "530" }, next: "Challenge complete" });
    expect(r.roundEnd?.lines).toContainEqual({ label: "Shanghais", value: "2" });
    expect(r.roundEnd?.lines).toContainEqual({ label: "Doubles hit", value: "3 of 21" });
    expect(r.done).toBe(false);
    // The takeout closes the turn: the game is over.
    expect(play(`S10 D10 T10 | ${misses(5)} | D1 D2 D3 | ${misses(11)} | S20 D20 T20`).roundEnd).toBeUndefined();
    // Round 2 of 2 compares with round 1.
    const second = open(`${misses(19)} | ${misses(18)} | S20 D20 T20`, { rounds: 2 });
    expect(second.roundEnd).toMatchObject({ turn: 37, title: "Round 2 of 2 done", badge: "New best round!" });
    expect(second.roundEnd?.lines).toContainEqual({ label: "Best round so far", value: "0" });
    expect(open(`${misses(18)} | S20 D20 T20`, { rounds: 2 }).roundEnd?.next).toBe("Round 2 next");
  });
  it("a finished game of several rounds shows the parts' averages", () => {
    const r = play(`S10 D10 T10 | ${misses(18)} | ${misses(19)}`, { rounds: 2 });
    expect(r.done).toBe(true);
    expect(r.lines.find((l) => l.key === "part1")?.value).toBe("80");
  });
  it("plays the rounds set, then ends", () => {
    const r = play(misses(19), { rounds: 2 });
    expect(r.done).toBe(false);
    expect(r.values.games).toBe(1);
    expect(r.focus).toMatchObject({ value: "10", hint: "Round 2 of 2" });
    expect(play(misses(38), { rounds: 2 }).done).toBe(true);
  });
  it("scores the average per round, with the best round", () => {
    const round = (first: string) => `${first} | ${misses(18)}`;
    const r = play(`${round("S10 D10 T10")} | ${round("S10 miss miss")}`, { rounds: 2 });
    expect(r.values).toMatchObject({ games: 2, best: 160, score: 85, part1: 85 });
    expect(r.done).toBe(true);
    expect(jdcChallenge.summary(r.values)).toContain("85");
  });
  it("an unfinished first round counts its points so far", () => {
    expect(play("S10 D10 T10", { rounds: 3 }).values).toMatchObject({ games: 0, score: 160 });
  });
  it("has no time cap, about 30 seconds a visit", () => {
    expect(jdcChallenge.noTimeCap).toBe(true);
    expect(jdcChallenge.estimateMinutes?.({ rounds: 1 })).toBe(10);
    expect(jdcChallenge.estimateMinutes?.({ rounds: 3 })).toBe(29);
  });
  it("can't go over the most points", () => {
    const shanghai = (from: number) => Array.from({ length: 6 }, (_, i) => `S${from + i} D${from + i} T${from + i}`).join(" | ");
    const doubles = "D1 D2 D3 | D4 D5 D6 | D7 D8 D9 | D10 D11 D12 | D13 D14 D15 | D16 D17 D18 | D19 D20 bull";
    const r = play(`${shanghai(10)} | ${doubles} | ${shanghai(15)}`);
    expect(r.values.score).toBe(3380);
    expect(r.done).toBe(true);
  });
});
