import { describe, expect, it } from "vitest";
import { catch40, pointsFor } from "./catch-40";
import { turns } from "./test-helpers";

const play = (t: string, repeat = false) => catch40.compute(turns(t), catch40.defaultSettings, { open: false, repeat });

describe("Catch 40", () => {
  it("scores 3 / 2 / 1 for two, three, four to six darts", () => {
    expect(pointsFor(61, 2)).toBe(3);
    expect(pointsFor(61, 3)).toBe(2);
    expect(pointsFor(61, 4)).toBe(1);
    expect(pointsFor(61, 6)).toBe(1);
  });
  it("99 can't be checked out with two darts", () => {
    expect(pointsFor(99, 3)).toBe(3);
    expect(pointsFor(99, 4)).toBe(2);
    expect(pointsFor(99, 5)).toBe(1);
  });
  it("starts at 61 and moves on after a checkout in 2 darts", () => {
    expect(play("").focus?.value).toBe("61");
    // 61 = T11 + D14
    const r = play("T11 D14");
    expect(r.values).toMatchObject({ points: 3, numbers: 1, checkouts: 1, threePointers: 1 });
    expect(r.focus?.label).toContain("62");
    expect(r.moments).toHaveLength(1);
  });
  it("moves on after six darts without a checkout", () => {
    const r = play("miss miss miss | miss miss miss");
    expect(r.values).toMatchObject({ points: 0, numbers: 1, checkouts: 0 });
    expect(r.focus?.label).toContain("62");
  });
  it("a bust is No Score and the visit uses its darts", () => {
    const r = play("T20 T20");
    expect(r.noScore).toBeDefined();
    expect(r.darts?.used).toBe(3);
  });
  it("is done after 100, or starts over with a time cap", () => {
    // Fail every number: 40 numbers x 2 visits
    const all = Array.from({ length: 80 }, () => "miss miss miss").join(" | ");
    expect(play(all).done).toBe(true);
    const again = play(all, true);
    expect(again.done).toBe(false);
    expect(again.values.rounds).toBe(1);
    expect(again.focus?.value).toBe("61");
  });
  it("shows the route and lights its first field", () => {
    const r = play("");
    expect(r.focus?.hint).toBeTruthy();
    expect(r.targets).toHaveLength(1);
    expect(catch40.compute([], { showRoute: "off" }, { open: false }).focus?.hint).toBeUndefined();
  });
});
