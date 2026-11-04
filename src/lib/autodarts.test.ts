import { describe, expect, it } from "vitest";
import { AutodartsNormalizer, toDart } from "./autodarts";

const raw = (name: string, multiplier: number, segmentNumber: number, extra = {}) => ({
  segmentName: name, segmentNumber, multiplier, bed: "SingleInner", coordsX: segmentNumber / 100, coordsY: multiplier / 100, method: "UnanimousCam", ...extra,
});
const state = (...throws: any[]) => ({ type: "state", data: { throws } });

describe("toDart", () => {
  it("maps beds", () => {
    expect(toDart(raw("T20", 3, 20, { bed: "Triple" }))).toMatchObject({ kind: "triple", number: 20, score: 60 });
    expect(toDart(raw("D16", 2, 16, { bed: "Double" }))).toMatchObject({ kind: "double", number: 16, score: 32 });
    expect(toDart(raw("S5", 1, 5, { bed: "SingleOuter" }))).toMatchObject({ kind: "single", zone: "outer", score: 5 });
    expect(toDart(raw("Bull", 2, 25))).toMatchObject({ kind: "bull", score: 50, number: null });
    expect(toDart(raw("25", 1, 25))).toMatchObject({ kind: "outerBull", score: 25 });
    expect(toDart({ multiplier: 0, bed: "Outside", coordsX: 1, coordsY: 1 })).toMatchObject({ kind: "miss", score: 0 });
  });
  it("keeps a bouncer flag", () => {
    expect(toDart(raw("S1", 1, 1, { bouncer: true })).bouncer).toBe(true);
  });
});

describe("AutodartsNormalizer", () => {
  const a = raw("S1", 1, 1), b = raw("S2", 1, 2), c = raw("S3", 1, 3);
  it("ignores the first state (what is already on the board)", () => {
    const n = new AutodartsNormalizer();
    expect(n.handle(state(a))).toEqual([]);
  });
  it("emits a dart per new throw, then a takeout", () => {
    const n = new AutodartsNormalizer();
    n.handle(state());
    expect(n.handle(state(a)).map((e) => e.kind)).toEqual(["dart"]);
    const two = n.handle(state(a, b));
    expect(two).toHaveLength(1);
    expect(two[0]).toMatchObject({ kind: "dart", indexInTurn: 1 });
    const end = n.handle(state());
    expect(end).toHaveLength(1);
    expect(end[0]).toMatchObject({ kind: "turnEnded" });
  });
  it("a changed earlier throw is a correction", () => {
    const n = new AutodartsNormalizer();
    n.handle(state());
    n.handle(state(a, b));
    const ev = n.handle(state(a, c));
    expect(ev).toHaveLength(1);
    expect(ev[0].kind).toBe("correction");
  });
  it("ignores other messages", () => {
    expect(new AutodartsNormalizer().handle({ type: "board" })).toEqual([]);
  });
});
