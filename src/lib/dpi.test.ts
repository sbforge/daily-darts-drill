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
    const v = { accuracy: 35, darts: 30 };
    expect(gameIndex("around-the-clock", { zone: "triple" }, v)).toBe(100);
    expect(gameIndex("around-the-clock", { zone: "innerSingle" }, v)!).toBeLessThan(100);
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
