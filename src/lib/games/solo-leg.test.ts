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
  it("a leg of 18 darts or fewer from 501 is a short leg", () => {
    // 180, 180, 60, 3, then T18 D12 for the 78 left: 14 darts.
    const r = play("T20 T20 T20 | T20 T20 T20 | S20 S20 S20 | S1 S1 S1 | T18 D12");
    expect(r.values.bestLeg).toBe(14);
    expect(r.moments?.map((m) => m.text)).toContain("Short leg!");
    // The same start, then 1s and S20 S20 D16: checked out with dart 21, too long for a short leg.
    const long = play("T20 T20 T20 | T20 T20 T20 | S20 S20 S20 | S1 S1 S1 | S1 S1 S1 | S1 S1 S1 | S20 S20 D16");
    expect(long.values.bestLeg).toBe(21);
    expect(long.moments ?? []).toHaveLength(0);
  });
  it("starts the next leg at 501", () => {
    const r = play(NINE + " | T20");
    expect(r.focus?.value).toBe("441");
    expect(r.focus?.label).toContain("2");
  });
  it("the rest changes after the visit, or after every dart when counting instantly", () => {
    expect(play("T20 T20 T20 | T20 T20", {}, true).focus?.value).toBe("321"); // 501 - 180 so far
    expect(play("T20 T20 T20 | T20 T20", { instantCount: "on" }, true).focus?.value).toBe("201");
    expect(play("T20 T20 T20 | T20 T20 T20", {}, true).focus?.value).toBe("141"); // the visit is full
  });
  it("a bust or a checkout shows at once, even when the rest waits for the visit", () => {
    // 301: T20 T20 T20 leaves 121, then T20 T20 leaves 1 on the second dart: a bust, the rest is back at 121.
    const bust = play("T20 T20 T20 | T20 T20", { start: 301 }, true);
    expect(bust.noScore).toMatchObject({ turn: 1, darts: 2 });
    expect(bust.focus?.value).toBe("121");
    // The checkout on the ninth dart: the Game shot comes up with the first dart of the visit still unchanged.
    const out = play("T20 T20 T20 | T20 T20 T20 | T20 T19 D12", {}, true);
    expect(out.gameShot).toMatchObject({ turn: 2, darts: 3 });
    expect(out.focus?.label).toBe("Game shot!");
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
    // During the Game shot the leg just won is shown; after the takeout the new leg starts at 0.0.
    expect(line(play(NINE, {}, true), "legAverage")).toBe("167.0");
    expect(line(play(NINE), "legAverage")).toBe("0.0");
  });
  it("a bust counts its darts but no points in the leg average", () => {
    const r = play("T20 T20 T20 | T20 T20 T20 | T20 T20 T20 | S1", {}, true);
    // 361 points in 10 darts: the bust's three darts count, its points don't
    expect(r.lines.find((l) => l.key === "legAverage")?.value).toBe(((361 / 10) * 3).toFixed(1));
  });
  it("counts 80+ and keeps the visit counts off the panel", () => {
    const r = play("T20 S20 miss | T20 T20 S20 | T20 T20 T20");
    expect(r.values).toMatchObject({ eighties: 1, ton40s: 1, oneEighties: 1, tons: 0 });
    // The panel: both averages, best leg, highest finish; everything else only in the result screen.
    const panel = r.lines.filter((l) => l.live !== false).map((l) => l.key);
    expect(panel).toEqual(["average", "legAverage", "bestLeg", "highestCheckout"]);
    expect(r.lines.filter((l) => l.hero).map((l) => l.key)).toEqual(["average", "legAverage"]);
    expect(r.lines.find((l) => l.key === "legAverage")?.liveOnly).toBe(true);
  });
});

describe("counting setting", () => {
  it("a game that counts a rest always gets what the player set, no choice per game", async () => {
    const { withCounting } = await import("./shared");
    expect(withCounting({}, true, true).instantCount).toBe("on");
    expect(withCounting({}, true, false).instantCount).toBe("off");
    // An older routine's own choice no longer counts: the setting decides.
    expect(withCounting({ instantCount: "off" }, true, true).instantCount).toBe("on");
    expect(withCounting({ instantCount: "on" }, true, false).instantCount).toBe("off");
    expect(withCounting({}, false, true)).toEqual({});
  });
});
