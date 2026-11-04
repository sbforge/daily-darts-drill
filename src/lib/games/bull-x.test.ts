import { describe, expect, it } from "vitest";
import { bullX } from "./bull-x";
import { turns } from "./test-helpers";

const play = (t: string, s = {}, open = false) => bullX.compute(turns(t), { ...bullX.defaultSettings, ...s }, { open });

describe("Bull-X", () => {
  it("dart 1 goes at the bull", () => {
    const r = bullX.compute([], bullX.defaultSettings, { open: false });
    expect(r.focus?.value).toBe("Bull");
  });
  it("a bull on dart 1 keeps darts 2 and 3 on the bull; 3 bulls is a great turn", () => {
    const r = play("bull bull bull");
    expect(r.values).toMatchObject({ firstDartBullRate: 100, bulls: 3, perfectTurns: 1, recoveryDarts: 0 });
    expect(r.moments).toHaveLength(1);
    expect(play("bull", {}, true).focus?.value).toBe("Bull");
  });
  it("a miss on a segment sends darts 2 and 3 to its double", () => {
    const r = play("S7", {}, true);
    expect(r.focus?.value).toBe("D7");
    expect(r.targets).toEqual([{ bed: "double", number: 7 }]);
    const done = play("S7 D7 miss");
    expect(done.values).toMatchObject({ recoveries: 1, recoveryDarts: 2, firstDartBullRate: 0 });
    expect(play("S7 D7 D7").values.perfectTurns).toBe(1);
  });
  it("trebles", () => {
    expect(play("S7", { variant: "trebles" }, true).focus?.value).toBe("T7");
    const r = play("D7 T7 T7", { variant: "trebles" });
    expect(r.values.perfectTurns).toBe(1);
    expect(r.moments).toHaveLength(1);
  });
  it("Shanghai: dart 1 counts as one part, darts 2 and 3 the other two in any order", () => {
    expect(play("S7", { variant: "shanghai" }, true).focus?.value).toBe("D·T 7");
    expect(play("S7 T7 D7", { variant: "shanghai" }).moments).toHaveLength(1);
    expect(play("D7 T7 S7", { variant: "shanghai" }).moments).toHaveLength(1);
    expect(play("D7 S7 S7", { variant: "shanghai" }).values.recoveries).toBe(1);
    expect(play("D7 D7 D7", { variant: "shanghai" }).values.recoveries).toBe(0);
  });
  it("off the board: darts 2 and 3 go at the bull again", () => {
    const r = play("miss bull bull");
    expect(r.values).toMatchObject({ bulls: 2, bullDarts: 3, recoveryDarts: 0 });
    expect(play("miss", {}, true).focus?.value).toBe("Bull");
  });
  it("the outer bull counts, unless only the bullseye does", () => {
    expect(play("25 bull bull").values.firstDartBullRate).toBe(100);
    const strict = play("25 bull bull", { bullseyeOnly: "on" });
    expect(strict.values.firstDartBullRate).toBe(0);
    expect(strict.values.bulls).toBe(2); // no segment: darts 2 and 3 go at the bull again
  });
  it("with three darts on the board the next bull waits for the takeout", () => {
    const onBoard = play("S14 miss miss", {}, true);
    expect(onBoard.focus?.value).toBe("D14");
    expect(onBoard.targets).toEqual([{ bed: "double", number: 14 }]);
    expect(play("S14 miss miss").focus?.value).toBe("Bull");
  });
});
