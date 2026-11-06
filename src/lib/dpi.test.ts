import { describe, expect, it } from "vitest";
import { DPI_CONFIG, gameIndex, hasIndex, normalize, sessionIndex, trendStep, weighted, type MetricConfig, type ResultRecord } from "./dpi";

const up: MetricConfig = { key: "x", baseline: 10, target: 50, direction: "higher", weight: 1 };
const down: MetricConfig = { key: "x", baseline: 18, target: 6, direction: "lower", weight: 1 };

describe("normalize", () => {
  it("scales between baseline and target and clamps", () => {
    expect(normalize(30, up)).toBe(50);
    expect(normalize(0, up)).toBe(0);
    expect(normalize(99, up)).toBe(100);
  });
  it("lower is better", () => {
    expect(normalize(12, down)).toBe(50);
    expect(normalize(4, down)).toBe(100);
    expect(normalize(30, down)).toBe(0);
  });
});

describe("game index", () => {
  it("weights the metrics of 121", () => {
    // successRate 10..60 (0.7), highestCheckout 61..170 (0.3)
    const i = gameIndex("121", {}, { successRate: 60, highestCheckout: 61, checkouts: 3, fails: 0 });
    expect(i).toBeCloseTo(70);
  });
  it("a result that is too short doesn't count", () => {
    expect(gameIndex("scoring", {}, { average: 80, darts: 3 })).toBeNull();
    expect(gameIndex("scoring", {}, { average: 80, darts: 30 })).toBe(100);
  });
  it("Around the clock has a scale per ring", () => {
    const v = { accuracy: 50, darts: 30 };
    expect(gameIndex("around-the-clock", { zone: "triple" }, v)).toBe(100);
    expect(gameIndex("around-the-clock", { zone: "innerSingle" }, v)!).toBeLessThan(100);
  });
  it("Clockwork doubles: 25 % is 44 points (baseline 5, target 50)", () => {
    expect(gameIndex("around-the-clock", { zone: "double" }, { accuracy: 25, darts: 30 })).toBeCloseTo((20 / 45) * 100);
  });
  it("Bob's 27: hit rate 70 %, finished score 30 %; without a finished game the hit rate counts alone", () => {
    const v = { hitRate: 50, targets: 21 };
    expect(gameIndex("bobs-27", {}, { ...v, finishedScore: 862 })).toBeCloseTo(100);
    expect(gameIndex("bobs-27", {}, { ...v, finishedScore: 0 })).toBeCloseTo(70);
    expect(gameIndex("bobs-27", {}, v)).toBeCloseTo(100);
  });
  it("JDC Challenge: only the points, 300 to 1800, and only finished rounds", () => {
    const jdc = (values: Record<string, number>) => gameIndex("jdc-challenge", {}, values);
    expect(jdc({ score: 1050, games: 1 })).toBe(50);
    expect(Math.round(jdc({ score: 1213, games: 1 })!)).toBe(61);
    expect(jdc({ score: 2000, games: 2 })).toBe(100);
    expect(jdc({ score: 900, games: 0 })).toBeNull();
  });
  it("the warm-up has no index", () => {
    expect(hasIndex("warm-up")).toBe(false);
  });
});

describe("every configured game", () => {
  it("has weights that are positive and areas that add up to 1", () => {
    for (const g of DPI_CONFIG.games) expect(g.metrics.reduce((s, m) => s + m.weight, 0)).toBeGreaterThan(0);
    expect(Object.values(DPI_CONFIG.areas).reduce((s, n) => s + n, 0)).toBeCloseTo(1);
  });
});

describe("session index", () => {
  const r = (gameId: string, values: Record<string, number>): ResultRecord => ({ id: gameId, sessionId: "s", gameId, settings: {}, values, startedAt: "2026-01-01" });
  it("averages per area and scales up missing areas", () => {
    const only = sessionIndex([r("scoring", { average: 80, darts: 30 })]);
    expect(only).toBe(100);
  });
  it("is null without any counting result", () => {
    expect(sessionIndex([r("scoring", { average: 80, darts: 1 })])).toBeNull();
  });
});

describe("weighted", () => {
  it("scales weights", () => expect(weighted([{ score: 100, weight: 1 }, { score: 0, weight: 3 }])).toBe(25));
});

describe("trendStep", () => {
  it("steps at the boundaries", () => {
    expect(trendStep(0)).toBe("steady");
    expect(trendStep(1.9)).toBe("steady");
    expect(trendStep(2)).toBe("upSlight");
    expect(trendStep(5)).toBe("up");
    expect(trendStep(15)).toBe("upStrong");
    expect(trendStep(-20)).toBe("downStrong");
  });
});
