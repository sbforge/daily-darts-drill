import { describe, expect, it } from "vitest";
import { bobs27 } from "./bobs-27";
import { turns } from "./test-helpers";

const play = (t: string, s = {}, ctx = {}) => bobs27.compute(turns(t), { ...bobs27.defaultSettings, ...s }, { open: false, ...ctx });

describe("Bob's 27", () => {
  it("starts on D1 with 27", () => {
    const r = bobs27.compute([], bobs27.defaultSettings, { open: false });
    expect(r.values.score).toBe(27);
    expect(r.focus?.value).toBe("D1");
  });
  it("a hit adds the double's value, twice counts twice", () => {
    expect(play("D1 miss miss").values.score).toBe(29);
    expect(play("D1 D1 miss").values.score).toBe(31);
  });
  it("no hit with three darts subtracts the double's value", () => {
    expect(play("miss miss miss").values.score).toBe(25);
    // D1 hit once (+2), then D2 missed (-4)
    expect(play("D1 miss miss | miss miss miss").values.score).toBe(25);
  });
  it("moves on to the next double each turn, whatever was hit", () => {
    expect(play("S1 S1 S1 | D2").values.score).toBe(27 - 2 + 4);
    expect(play("miss miss miss").focus?.value).toBe("D2");
  });
  it("ends at zero or below", () => {
    // D1 -2, D2 -4, ... the sum of misses 2+4+6+8 = 20 -> 7, D5 -10 = -3
    const r = play("miss miss miss | miss miss miss | miss miss miss | miss miss miss | miss miss miss");
    expect(r.values.score).toBe(-3);
    expect(r.done).toBe(true);
  });
  it("play on below zero throws at all 21 targets", () => {
    const miss = Array.from({ length: 21 }, () => "miss miss miss").join(" | ");
    const r = play(miss, { playOn: "on" });
    expect(r.done).toBe(true);
    expect(r.values.reached).toBe(21);
    expect(r.values.score).toBe(27 - 2 * 210 - 50 + 0); // 2*(1+..+20) = 420, bull 50
  });
  it("the bull is the 21st target and is worth 50", () => {
    const r = play(Array.from({ length: 20 }, () => "S1 S1 S1").join(" | ") + " | bull miss miss", { playOn: "on" });
    expect(r.done).toBe(true);
  });
  it("a turn still on the board adds hits but no penalty", () => {
    expect(play("miss miss", {}, { open: true }).values.score).toBe(27);
    expect(play("D1", {}, { open: true }).values.score).toBe(29);
  });
  it("starts over with a time cap when finished", () => {
    const miss = Array.from({ length: 21 }, () => "miss miss miss").join(" | ");
    const r = play(miss, { playOn: "on" }, { repeat: true });
    expect(r.done).toBe(false);
    expect(r.values.games).toBe(1);
    expect(r.values.score).toBe(27);
  });
  it("3 of 3 is a great turn", () => {
    expect(play("D1 D1 D1").moments).toHaveLength(1);
  });
  it("saves the average score of the finished games only", () => {
    const s = { ...bobs27.defaultSettings };
    const miss = "miss miss miss";
    // D1 missed: 27 - 2 = 25, nothing finished yet
    expect(bobs27.compute(turns(miss), s, { open: false }).values.finishedScore).toBeUndefined();
    // Missing everything goes below zero by D5 (27-2-4-6-8-10 < 0): a finished game
    const out = bobs27.compute(turns(Array(5).fill(miss).join(" | ")), s, { open: false });
    expect(out.done).toBe(true);
    expect(out.values.finishedScore).toBe(-3);
  });
});
