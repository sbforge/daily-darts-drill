import { describe, expect, it } from "vitest";
import { oneTwentyOne } from "./121";
import { turns } from "./test-helpers";

const play = (t: string, s = {}) =>
  oneTwentyOne.compute(turns(t), { ...oneTwentyOne.defaultSettings, ...s }, { open: false });

describe("121", () => {
  it("starts at the start checkout with nine darts", () => {
    const r = oneTwentyOne.compute([], oneTwentyOne.defaultSettings, { open: false });
    expect(r.focus?.value).toBe("121");
    expect(r.darts).toMatchObject({ total: 9, used: 0 });
  });

  it("raises the checkout by 3 after a checkout with dart 1-3 (fast-forward)", () => {
    // 121 = T20 T11 D14
    const r = play("T20 T11 D14");
    expect(r.values).toMatchObject({ checkouts: 1, nextCheckout: 124, highestCheckout: 121 });
  });

  it("raises it by 1 per checkout without fast-forward", () => {
    expect(play("T20 T11 D14", { fastForward: "off" }).values.nextCheckout).toBe(122);
  });

  it("a checkout in the second visit raises by 2, the third by 1 (fast-forward)", () => {
    expect(play("miss miss miss | T20 T11 D14").values.nextCheckout).toBe(123);
    expect(play("miss miss miss | miss miss miss | T20 T11 D14").values.nextCheckout).toBe(122);
  });

  it("nine darts without checkout lower the checkout, but not below the start", () => {
    const r = play("miss miss miss | miss miss miss | miss miss miss");
    expect(r.values).toMatchObject({ fails: 1, nextCheckout: 121 });
    const up = play("T20 T11 D14 | miss miss miss | miss miss miss | miss miss miss"); // 124 failed
    expect(up.values).toMatchObject({ fails: 1, nextCheckout: 123 });
  });

  it("the safehouse stops misses from dropping below the highest checkout made with three darts", () => {
    const fails = " | miss miss miss | miss miss miss | miss miss miss".repeat(4);
    const base = "T20 T11 D14 | T20 T20 D2"; // 121 and 124 in three darts, next is 127
    expect(play(base + fails, { safehouse: "on" }).values.nextCheckout).toBe(124);
    expect(play(base + fails, { safehouse: "off" }).values.nextCheckout).toBe(123);
  });

  it("a bust is No Score: rest back to the start of the visit, all three darts used", () => {
    // 121 - 60 - 60 = 1: a rest of 1 can't be checked out, the visit is over after dart 2
    const bust = play("T20 T20");
    expect(bust.noScore).toEqual({ turn: 0, darts: 2 });
    expect(bust.focus?.value).toBe("121");
    const next = play("T20 T20 | T20");
    expect(next.focus?.value).toBe("61");
    // the busted visit used all three darts
    expect(play("T20 T20 | T20").darts?.used).toBe(6);
  });

  it("going past the rest and 0 without a double are busts", () => {
    expect(play("T20 T20 T20").noScore).toMatchObject({ darts: 2 });
    expect(play("T20 T20", { start: 120 }).noScore).toMatchObject({ darts: 2 }); // 0 with a treble
  });

  it("a checkout with the first three darts earns the great moment", () => {
    expect(play("T20 T11 D14").moments).toHaveLength(1);
    expect(play("miss miss miss | T20 T11 D14").moments).toHaveLength(0);
  });
});
