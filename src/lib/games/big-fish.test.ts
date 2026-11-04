import { describe, expect, it } from "vitest";
import { bigFish } from "./big-fish";
import { turns } from "./test-helpers";
import { pickMoments } from "../fx/moments";

const play = (t: string, s = {}) => bigFish.compute(turns(t), { ...bigFish.defaultSettings, ...s }, { open: false });

describe("Big Fish", () => {
  it("starts at 170 and shows no route (switched off)", () => {
    const r = play("");
    expect(r.focus?.value).toBe("170");
    expect(r.focus?.hint).toBeUndefined();
  });
  it("170 in three darts is the big fish and beats a 180's stamp", () => {
    const r = play("T20 T20 bull");
    expect(r.values).toMatchObject({ legs: 1, checkouts: 1, bigFish: 1, bestLeg: 3, dartsPerLeg: 3 });
    const picked = pickMoments(r, turns("T20 T20 bull"));
    expect(picked.play[0].text).toBe("The Big Fish!");
  });
  it("the next leg starts at 170 again", () => {
    expect(play("T20 T20 bull | T20").focus?.value).toBe("110");
  });
  it("a bust sends the visit back", () => {
    const r = play("T20 T20 T20");
    expect(r.noScore).toBeDefined();
    expect(r.focus?.value).toBe("170");
  });
  it("a leg can be given up after n darts, and counts with its darts", () => {
    const miss3 = "miss miss miss";
    const r = play(`${miss3} | ${miss3} | ${miss3}`, { giveUp: 9 });
    expect(r.values).toMatchObject({ legs: 1, checkouts: 0, darts: 9, dartsPerLeg: 9 });
    expect(play(`${miss3} | ${miss3} | ${miss3}`, { giveUp: 0 }).values.legs).toBe(0);
  });
  it("a number of legs ends the game", () => {
    expect(play("T20 T20 bull", { legs: 1 }).done).toBe(true);
    expect(play("T20 T20 bull", { legs: 3 }).done).toBe(false);
  });
});
