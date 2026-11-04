import { describe, expect, it } from "vitest";
import { canCheckOut } from "./routes";
import { checkoutAt, deck, RANGES, wildCard, type RangeKey } from "./wild-card";
import { turns } from "./test-helpers";
import { gameIndex } from "../dpi";

const s = (extra = {}) => ({ ...wildCard.defaultSettings, seed: 42, ...extra });

describe("Wild Card", () => {
  it("the same seed gives the same checkouts, another seed another order", () => {
    expect(deck("61-100", 42, 0)).toEqual(deck("61-100", 42, 0));
    expect(deck("61-100", 42, 0)).not.toEqual(deck("61-100", 43, 0));
  });
  it("a deck holds every checkout of the range once, never an impossible one", () => {
    for (const range of Object.keys(RANGES) as RangeKey[]) {
      const d = deck(range, 7, 0);
      expect(new Set(d).size).toBe(d.length);
      expect(d.every(canCheckOut)).toBe(true);
      const [from, to] = RANGES[range];
      expect(d.every((n) => n >= from && n <= to)).toBe(true);
    }
    expect(deck("101-170", 1, 0)).not.toContain(159);
  });
  it("no repeats until the range has been through once, then a new deck", () => {
    const size = deck("2-40", 5, 0).length;
    const first = Array.from({ length: size }, (_, i) => checkoutAt("2-40", 5, i));
    expect(new Set(first).size).toBe(size);
    expect(checkoutAt("2-40", 5, size)).toBeDefined();
  });
  it("the first checkout and the next one follow the seed", () => {
    const first = checkoutAt("61-100", 42, 0);
    const r = wildCard.compute([], s(), { open: false });
    expect(r.focus?.label).toContain(String(first));
    expect(r.focus?.value).toBe(String(first));
  });
  it("a missed checkout (all darts used) brings the next one", () => {
    const miss = "miss miss miss | miss miss miss"; // 6 darts
    const r = wildCard.compute(turns(miss), s(), { open: false });
    expect(r.values).toMatchObject({ attempts: 1, checkouts: 0 });
    expect(r.focus?.value).toBe(String(checkoutAt("61-100", 42, 1)));
  });
  it("prepare adds a seed", () => {
    expect(typeof wildCard.prepare?.({}).seed).toBe("number");
  });
  it("has an index scale for every range and number of darts", () => {
    for (const range of Object.keys(RANGES)) {
      for (const darts of [3, 6, 9]) {
        expect(gameIndex("wild-card", { range, darts }, { successRate: 100, attempts: 10 })).toBe(100);
      }
    }
  });
});
