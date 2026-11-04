import { describe, expect, it } from "vitest";
import { soloLeg } from "./solo-leg";
import { turns } from "./test-helpers";

const play = (t: string, s = {}, open = false) => soloLeg.compute(turns(t), { ...soloLeg.defaultSettings, ...s }, { open });
const NINE = "T20 T20 T20 | T20 T20 T20 | T20 T19 D12";

describe("Solo Leg", () => {
  it("a nine-darter is a leg of 9 darts with an average of 167", () => {
    const r = play(NINE);
    expect(r.values).toMatchObject({ legs: 1, bestLeg: 9, dartsPerLeg: 9, highestCheckout: 141, oneEighties: 2 });
    expect(r.values.average).toBeCloseTo(501 / 3);
    expect(r.values.first9).toBeCloseTo(501 / 3);
    expect(r.moments).toHaveLength(1); // ton out
  });
  it("starts the next leg at 501", () => {
    const r = play(NINE + " | T20");
    expect(r.focus?.value).toBe("441");
    expect(r.focus?.label).toContain("2");
  });
  it("a bust is no score, uses three darts and sets the rest back", () => {
    const r = play("T20 T20 T20 | T20 T20 T20 | T20 T20 T20 | T20");
    // 501-360 = 141, T20 T20 T20 busts (past the rest after two), rest stays 141
    expect(r.noScore).toBeUndefined(); // the bust is not the latest turn
    expect(r.focus?.value).toBe("81");
    expect(r.values.average).toBeCloseTo((420 / 12) * 3);
    const bust = play("T20 T20 T20 | T20 T20 T20 | T20 T20 T20");
    expect(bust.noScore).toMatchObject({ turn: 2 });
    expect(bust.focus?.value).toBe("141");
    expect(bust.values.average).toBeCloseTo((360 / 9) * 3);
  });
  it("counts tons, 140+ and 180s", () => {
    const r = play("T20 T20 T20 | T20 T20 S20 | T20 S20 S20", {}, false);
    expect(r.values).toMatchObject({ oneEighties: 1, ton40s: 1, tons: 1 });
    expect(r.values.first9).toBeCloseTo((180 + 140 + 100) / 9 * 3);
    expect(play("T20 S20 S20 | T19 T19 miss").values.tons).toBe(2);
  });
  it("a fixed number of legs ends the game", () => {
    const r = play(NINE, { legs: 1 });
    expect(r.done).toBe(true);
    expect(play(NINE, { legs: 2 }).done).toBe(false);
    expect(play(NINE, { legs: 0 }).done).toBe(false);
  });
  it("checkout rate is checkouts per dart at a double", () => {
    // 141 left: D12 thrown at 24 -> 1 dart at a double (the checkout)
    const r = play(NINE);
    expect(r.values.dartsAtDouble).toBe(1);
    expect(r.values.checkoutRate).toBe(100);
  });
  it("301 and 701 start where they say", () => {
    expect(play("", { start: 301 }).focus?.value).toBe("301");
    expect(play("", { start: 701 }).focus?.value).toBe("701");
  });
  it("match average goes on over all legs, leg average starts again with each leg", () => {
    const line = (r: ReturnType<typeof play>, k: string) => r.lines.find((l) => l.key === k)?.value;
    // Leg 1: nine-darter (167), leg 2: one visit of 60
    const r = play(NINE + " | T20 miss miss");
    expect(line(r, "legAverage")).toBe("60.0");
    expect(r.values.average).toBeCloseTo(((501 + 60) / 12) * 3);
    expect(r.values.bestLegAverage).toBeCloseTo(167);
    // During the Game shot the leg just won is shown; after the takeout the new leg has none yet.
    expect(line(play(NINE, {}, true), "legAverage")).toBe("167.0");
    expect(line(play(NINE), "legAverage")).not.toMatch(/\d/);
  });
  it("a bust counts its darts but no points in the leg average", () => {
    const r = play("T20 T20 T20 | T20 T20 T20 | T20 T20 T20 | S1", {}, true);
    // 361 points in 10 darts: the bust's three darts count, its points don't
    expect(r.lines.find((l) => l.key === "legAverage")?.value).toBe(((361 / 10) * 3).toFixed(1));
  });
  it("counts 80+ and keeps the visit counts off the panel", () => {
    const r = play("T20 S20 miss | T20 T20 S20 | T20 T20 T20");
    expect(r.values).toMatchObject({ eighties: 1, ton40s: 1, oneEighties: 1, tons: 0 });
    const hidden = r.lines.filter((l) => l.live === false).map((l) => l.key);
    expect(hidden).toEqual(["bestLegAverage", "eighties", "tons", "ton40s", "oneEighties"]);
    expect(r.lines.find((l) => l.key === "legAverage")?.liveOnly).toBe(true);
  });
});
