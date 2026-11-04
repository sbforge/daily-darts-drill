import { describe, expect, it } from "vitest";
import { canCheckOut, checkoutsIn, routeFor, routeText } from "./routes";

describe("checkout routes", () => {
  it("every route adds up, ends on a double or the bull and has at most three darts", () => {
    for (let rest = 2; rest <= 170; rest++) {
      const r = routeFor(rest);
      if (!r) continue;
      expect(r.length).toBeLessThanOrEqual(3);
      expect(r.reduce((s, d) => s + d.score, 0)).toBe(rest);
      expect(r[r.length - 1].label).toMatch(/^(D\d+|Bull)$/);
    }
  });
  it("the famous ones", () => {
    expect(routeText(170)).toBe("T20 T20 Bull");
    expect(routeText(167)).toBe("T20 T19 Bull");
    expect(routeText(164)).toBe("T20 T18 Bull");
    expect(routeText(161)).toBe("T20 T17 Bull");
    expect(routeText(160)).toBe("T20 T20 D20");
    expect(routeText(100)).toBe("T20 D20");
    expect(routeText(40)).toBe("D20");
    expect(routeText(50)).toBe("Bull");
    expect(routeText(2)).toBe("D1");
  });
  it("knows the rests that can't be checked out", () => {
    for (const n of [159, 162, 163, 165, 166, 168, 169]) expect(canCheckOut(n)).toBe(false);
    expect(canCheckOut(171)).toBe(false);
    expect(canCheckOut(1)).toBe(false);
    expect(canCheckOut(158)).toBe(true);
  });
  it("lists a range without the impossible ones", () => {
    expect(checkoutsIn(158, 170)).toEqual([158, 160, 161, 164, 167, 170]);
  });
});
