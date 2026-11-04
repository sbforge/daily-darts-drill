import { describe, expect, it } from "vitest";
import { bigFish } from "./big-fish";
import { catch40 } from "./catch-40";
import { oneTwentyOne } from "./121";
import { soloLeg } from "./solo-leg";
import type { GameDef } from "./types";
import { turns } from "./test-helpers";
import { checkoutAt, wildCard } from "./wild-card";

const play = (g: GameDef, t: string, s = {}, open = false) => g.compute(turns(t), { ...g.defaultSettings, ...s }, { open });
const NINE = "T20 T20 T20 | T20 T20 T20 | T20 T19 D12";

describe("Game shot", () => {
  it("Solo Leg: the checkout on the board counts, the next leg waits for the takeout", () => {
    const r = play(soloLeg, NINE, {}, true);
    expect(r.gameShot).toMatchObject({ turn: 2, darts: 3 });
    expect(r.values.legs).toBe(1);
    expect(r.targets).toEqual([]);
    expect(r.focus?.value).toBe("141");
    const after = play(soloLeg, NINE);
    expect(after.gameShot).toBeUndefined();
    expect(after.focus?.value).toBe("501");
  });
  it("darts after the checkout in the same turn don't count", () => {
    // 501 - 360 = 141; T20 T19 S2 = 119, 22 left: D11 with dart 1 of the next visit, then two more darts
    const r = play(soloLeg, "T20 T20 T20 | T20 T20 T20 | T20 T19 S2 | D11 T20 T20", {}, true);
    expect(r.gameShot).toMatchObject({ turn: 3, darts: 1 });
    expect(r.values.legs).toBe(1);
    expect(r.values.darts).toBe(10);
  });
  it("the last leg ends the game only after the takeout", () => {
    const open = play(soloLeg, NINE, { legs: 1 }, true);
    expect(open.done).toBe(false);
    expect(open.gameShot).toBeDefined();
    expect(play(soloLeg, NINE, { legs: 1 }).done).toBe(true);
  });
  it("Big Fish: 170 checked out on the board is a Game shot", () => {
    const r = play(bigFish, "T20 T20 Bull", {}, true);
    expect(r.gameShot).toMatchObject({ turn: 0, darts: 3 });
    expect(r.values.checkouts).toBe(1);
  });
  it("Checkout Ladder: the next checkout waits for the takeout", () => {
    const r = play(oneTwentyOne, "T20 S11 Bull", {}, true);
    expect(r.gameShot).toMatchObject({ turn: 0, darts: 3 });
    expect(r.values.checkouts).toBe(1);
    expect(r.targets).toEqual([]);
    expect(play(oneTwentyOne, "T20 S11 Bull").gameShot).toBeUndefined();
  });
  it("Catch 40 and Wild Card have it too", () => {
    expect(play(catch40, "S11 Bull", {}, true).gameShot).toMatchObject({ turn: 0, darts: 2 });
    const s = { range: "2-40", darts: 3, seed: 7 };
    const n = checkoutAt("2-40", 7, 0);
    const out = n % 2 ? `S1 D${(n - 1) / 2}` : `D${n / 2}`;
    expect(play(wildCard, out, s, true).gameShot).toMatchObject({ turn: 0 });
  });
  it("a bust is not a Game shot", () => {
    expect(play(soloLeg, "T20 T20 T20 | T20 T20 T20 | T20 T20 T20", {}, true).gameShot).toBeUndefined();
  });
});
