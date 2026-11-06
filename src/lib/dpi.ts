// D³ Performance Index (DPI): a score from 0 to 100 that makes the results of different games comparable.
//
// Nothing here is stored. The index is always calculated from the saved game results, so a new config
// version recalculates the whole history, and a deleted session drops out of the index and the trend.
//
// 1. Every metric of a result is normalized to 0-100 between its baseline (0) and its target (100).
// 2. A game's index is the weighted average of its metric scores.
// 3. A session's overall index combines the game indices by skill area, each area with a fixed weight,
//    so a game played often within a session doesn't outweigh the others.
// 4. The current level is the average of the latest 10 results; the trend compares them with the 10 before.
import type { Settings } from "./games";

export interface MetricConfig {
  /** A key of the stored result values. */
  key: string;
  /** The value worth 0 index points. */
  baseline: number;
  /** The value worth 100 index points. A target, not perfection. */
  target: number;
  direction: "higher" | "lower";
  /** Share of the game index; the weights of a game add up to 1. */
  weight: number;
}

export type SkillArea = "scoring" | "doubles" | "checkout" | "accuracy" | "consistency";

export interface GameIndexConfig {
  gameId: string;
  area: SkillArea;
  metrics: MetricConfig[];
  /** Metrics that depend on a setting (e.g. the ring in Around the clock): they replace `metrics` for that value. */
  bySetting?: { key: string | string[]; metrics: Record<string, MetricConfig[]> };
  /** A result only counts with at least `min` of these values added up (darts, rounds, ...). Too short a game says little. */
  sample: { keys: string[]; min: number };
}

export interface IndexConfig {
  version: number;
  games: GameIndexConfig[];
  /** Weight of each area in the overall index. Areas without a result in a session are left out and the rest scaled up. */
  areas: Record<SkillArea, number>;
  /** Results the rolling average (the chart line) is made of, and for all time the latest results against as many before. */
  window: number;
  /** Results each period needs before a trend is shown. */
  minTrend: number;
}

const higher = (key: string, baseline: number, target: number, weight = 1): MetricConfig => ({
  key,
  baseline,
  target,
  direction: "higher",
  weight,
});

const lower = (key: string, baseline: number, target: number, weight = 1): MetricConfig => ({
  key,
  baseline,
  target,
  direction: "lower",
  weight,
});

/** Success rate (baseline, target) per range, for 3, 6 and 9 darts. */
const WILD_SCALES: Record<string, [number, number][]> = {
  "2-40": [[20, 70], [40, 90], [60, 95]],
  "41-80": [[10, 50], [25, 75], [40, 90]],
  "61-100": [[5, 35], [10, 50], [20, 70]],
  "81-120": [[3, 25], [8, 40], [15, 55]],
  "101-170": [[2, 15], [3, 25], [5, 35]],
  "2-170": [[5, 30], [8, 40], [12, 50]],
};
function wildCardScales(): Record<string, MetricConfig[]> {
  const out: Record<string, MetricConfig[]> = {};
  for (const [range, scales] of Object.entries(WILD_SCALES)) {
    [3, 6, 9].forEach((darts, i) => (out[`${range}|${darts}`] = [higher("successRate", scales[i][0], scales[i][1])]));
  }
  return out;
}

/** "Results per comparison" until it is changed in the settings. Small, so the line follows the results closely. */
export const DEFAULT_SAMPLE = 3;
export const MAX_SAMPLE = 20;

/** The config with "Results per comparison" from the settings. Only how levels and trends are read changes, not the index. */
export function withSample(n: number, config = DPI_CONFIG): IndexConfig {
  const size = Math.max(1, Math.min(MAX_SAMPLE, Math.round(n) || DEFAULT_SAMPLE));
  return { ...config, window: size, minTrend: size };
}

/** The index config. Changing a baseline, target or weight means a new version: the whole history is recalculated with it. */
export const DPI_CONFIG: IndexConfig = {
  version: 5,
  games: [
    {
      gameId: "scoring",
      area: "scoring",
      metrics: [higher("average", 20, 80)],
      sample: { keys: ["darts"], min: 15 },
    },
    {
      gameId: "simple-doubles",
      area: "doubles",
      // 50 % on one double is tough on purpose: 100 points should stay out of reach for a while.
      metrics: [higher("accuracy", 5, 50)],
      sample: { keys: ["darts"], min: 15 },
    },
    {
      gameId: "complex-doubles",
      area: "checkout",
      metrics: [higher("successRate", 10, 60)],
      sample: { keys: ["rounds"], min: 5 },
    },
    {
      gameId: "121",
      area: "checkout",
      metrics: [higher("successRate", 10, 60, 0.7), higher("highestCheckout", 61, 170, 0.3)],
      sample: { keys: ["checkouts", "fails"], min: 3 },
    },
    {
      gameId: "catch-40",
      area: "checkout",
      // 60 points over the 40 numbers is the "professional" mark.
      metrics: [higher("pointsPerNumber", 0.4, 1.5)],
      sample: { keys: ["numbers"], min: 10 },
    },
    {
      gameId: "solo-leg",
      // Its own area, so a session with a Solo Leg doesn't count twice for scoring.
      area: "consistency",
      // The 3-dart average only (version 3): darts per leg depend mostly on the checkouts, and the checkout rate
      // can't tell a set-up dart on an even rest (S4 on 24 for D10) from a dart at the double. The same for every start.
      metrics: [higher("average", 30, 100)],
      sample: { keys: ["legs"], min: 1 },
    },
    {
      gameId: "big-fish",
      area: "checkout",
      // Darts per leg from 170: 18 is three visits of three too many, 6 is two visits.
      metrics: [lower("dartsPerLeg", 18, 6)],
      sample: { keys: ["legs"], min: 2 },
    },
    {
      gameId: "wild-card",
      area: "checkout",
      metrics: [higher("successRate", 5, 35)],
      // Every range and number of darts has its own scale: a 3-dart 40 is not a 3-dart 140.
      bySetting: { key: ["range", "darts"], metrics: wildCardScales() },
      sample: { keys: ["attempts"], min: 5 },
    },
    {
      gameId: "bobs-27",
      area: "doubles",
      // Hit rate on the doubles, plus the score of the finished games: 862 is 60 % of the maximum 1437
      // (27 + 3 hits on D1-D20 + 3 bulls). A game cut off by the clock has no finished score; then the hit rate counts alone.
      metrics: [higher("hitRate", 5, 50, 0.7), higher("finishedScore", 0, 862, 0.3)],
      sample: { keys: ["targets"], min: 5 },
    },
    {
      gameId: "bull-x",
      area: "accuracy",
      metrics: [higher("firstDartBullRate", 5, 35, 0.6), higher("recoveryRate", 5, 40, 0.4)],
      // Trebles and Shanghai are harder to hit as a second chance.
      bySetting: {
        key: "variant",
        metrics: {
          doubles: [higher("firstDartBullRate", 5, 35, 0.6), higher("recoveryRate", 5, 40, 0.4)],
          trebles: [higher("firstDartBullRate", 5, 35, 0.6), higher("recoveryRate", 3, 30, 0.4)],
          shanghai: [higher("firstDartBullRate", 5, 35, 0.6), higher("recoveryRate", 2, 20, 0.4)],
        },
      },
      sample: { keys: ["turns"], min: 10 },
    },
    {
      gameId: "jdc-challenge",
      area: "accuracy",
      // The points, the average per finished round (version 4). Only finished rounds count: a round cut short
      // says nothing comparable. Version 5: 300 to 1800, so the best juniors (about 1600) are near 87.
      metrics: [higher("score", 300, 1800)],
      sample: { keys: ["games"], min: 1 },
    },
    {
      gameId: "around-the-clock",
      area: "accuracy",
      metrics: [higher("accuracy", 20, 80)],
      // The rings differ a lot in size, so each has its own scale. The baselines are the "luck" level, the
      // targets tough on purpose (version 2): 100 points should stay out of reach for a while.
      bySetting: {
        key: "zone",
        metrics: {
          innerSingle: [higher("accuracy", 20, 80)],
          outerSingle: [higher("accuracy", 15, 80)],
          triple: [higher("accuracy", 5, 50)],
          double: [higher("accuracy", 5, 50)],
        },
      },
      sample: { keys: ["darts"], min: 15 },
    },
  ],
  areas: { scoring: 0.25, doubles: 0.25, checkout: 0.25, accuracy: 0.15, consistency: 0.1 },
  // Both come from "Results per comparison" in the settings, see withSample.
  window: DEFAULT_SAMPLE,
  minTrend: DEFAULT_SAMPLE,
};

// ------------------------------------------------------------ the engine

const clamp = (n: number) => Math.max(0, Math.min(100, n));

/** A measured value as 0-100 index points. */
export function normalize(x: number, m: MetricConfig): number {
  if (!Number.isFinite(x) || m.target === m.baseline) return 0;
  return clamp(m.direction === "higher" ? (100 * (x - m.baseline)) / (m.target - m.baseline) : (100 * (m.baseline - x)) / (m.baseline - m.target));
}

/** Weighted average of the metric scores; weights are scaled to add up to 1. */
export function weighted(parts: { score: number; weight: number }[]): number | null {
  const total = parts.reduce((s, p) => s + p.weight, 0);
  return total > 0 ? parts.reduce((s, p) => s + p.score * p.weight, 0) / total : null;
}

/** The value a `bySetting` table is looked up by: one setting, or several joined with "|" (e.g. "61-100|6"). */
const settingKey = (key: string | string[], settings: Settings) =>
  (Array.isArray(key) ? key : [key]).map((k) => String(settings[k])).join("|");

function gameConfig(gameId: string, config: IndexConfig): GameIndexConfig | undefined {
  return config.games.find((g) => g.gameId === gameId);
}

/** Whether a game has an index at all (the warm-up has none). */
export function hasIndex(gameId: string, config = DPI_CONFIG): boolean {
  return !!gameConfig(gameId, config);
}

/** One metric of a result: the measured value, its index points and its share of the game index. */
export interface MetricScore {
  key: string;
  value: number;
  score: number;
  weight: number;
}

/**
 * The metrics behind the game index of one result, or null when the game has none.
 * `counts` is false when the result is too short to count; the scores are still worked out.
 */
export function metricScores(
  gameId: string,
  settings: Settings,
  values: Record<string, number>,
  config = DPI_CONFIG,
): { counts: boolean; metrics: MetricScore[] } | null {
  const g = gameConfig(gameId, config);
  if (!g) return null;
  const sample = g.sample.keys.reduce((s, k) => s + (Number(values[k]) || 0), 0);
  // A metric the result has no value for (an older result, a game without a finished score) is left out,
  // and the other weights are scaled up, instead of counting as 0.
  const metrics = ((g.bySetting && g.bySetting.metrics[settingKey(g.bySetting.key, settings)]) ?? g.metrics).filter(
    (m) => values[m.key] !== undefined && values[m.key] !== null,
  );
  const total = metrics.reduce((s, m) => s + m.weight, 0) || 1;
  return {
    counts: sample >= g.sample.min,
    metrics: metrics.map((m) => ({
      key: m.key,
      value: Number(values[m.key]) || 0,
      score: normalize(Number(values[m.key]), m),
      weight: m.weight / total,
    })),
  };
}

/** The game index of one result, or null when the game has none or the result is too short to count. */
export function gameIndex(
  gameId: string,
  settings: Settings,
  values: Record<string, number>,
  config = DPI_CONFIG,
): number | null {
  const s = metricScores(gameId, settings, values, config);
  return s?.counts ? weighted(s.metrics) : null;
}

/** One stored game result, the raw input of the index. */
export interface ResultRecord {
  id: string;
  sessionId: string;
  gameId: string;
  settings: Settings;
  values: Record<string, number>;
  startedAt: string;
}

/** The overall index of one session: the game indices averaged per area, then the areas weighted. */
export function sessionIndex(results: ResultRecord[], config = DPI_CONFIG): number | null {
  const byArea = new Map<SkillArea, number[]>();
  for (const r of results) {
    const g = gameConfig(r.gameId, config);
    const idx = gameIndex(r.gameId, r.settings, r.values, config);
    if (!g || idx === null) continue;
    byArea.set(g.area, [...(byArea.get(g.area) ?? []), idx]);
  }
  return weighted(
    [...byArea].map(([area, list]) => ({ score: list.reduce((s, n) => s + n, 0) / list.length, weight: config.areas[area] })),
  );
}

export type Trend =
  /**
   * `missing`: results still to play in the current period before a trend shows;
   * 0 when it is the period before that has too few (or a level of 0), which playing now can't change.
   */
  | { kind: "notEnough"; missing: number }
  | { kind: "trend"; percent: number };

export interface Performance {
  /** Average of the results in the period, 0-100; null without any. */
  current: number | null;
  /** How many results the current value is made of. */
  count: number;
  trend: Trend;
}

/** How far back to look: the last `amount` days, weeks, months or years, or all time. */
export type TimeRange = { unit: "all" } | { unit: "day" | "week" | "month" | "year"; amount: number };

export const DEFAULT_RANGE: TimeRange = { unit: "day", amount: 30 };

/** Where the period ends going back from `now`; months and years follow the calendar. null for all time. */
export function rangeStart(range: TimeRange, now: number): number | null {
  if (range.unit === "all") return null;
  const n = Math.max(1, Math.round(range.amount) || 1);
  const d = new Date(now);
  if (range.unit === "day") d.setDate(d.getDate() - n);
  else if (range.unit === "week") d.setDate(d.getDate() - 7 * n);
  else {
    // 31 March minus a month is the end of February, not 3 March.
    const day = d.getDate();
    d.setDate(1);
    if (range.unit === "month") d.setMonth(d.getMonth() - n);
    else d.setFullYear(d.getFullYear() - n);
    d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  }
  return d.getTime();
}

const avg = (list: number[]) => (list.length ? list.reduce((s, n) => s + n, 0) / list.length : null);

function compare(current: number[], previous: number[], missing: number, config: IndexConfig): Performance {
  const now = avg(current);
  const before = avg(previous);
  const needed = config.minTrend;
  // Without a previous level above 0 a percentage says nothing.
  const trend: Trend =
    current.length < needed || previous.length < needed || now === null || !before
      ? { kind: "notEnough", missing }
      : { kind: "trend", percent: ((now - before) / before) * 100 };
  return { current: now, count: current.length, trend };
}

/**
 * Current level and trend from a series of indices, oldest first.
 * For a period: the average within it, and the trend against the same span right before it.
 * For all time: the latest `window` results, and the trend against the `window` before them.
 */
export function performance(
  series: { at: string; value: number }[],
  range: TimeRange = { unit: "all" },
  now = Date.now(),
  config = DPI_CONFIG,
): Performance {
  const needed = config.minTrend;
  const start = rangeStart(range, now);
  if (start === null) {
    const values = series.map((p) => p.value);
    const current = values.slice(-config.window);
    // The previous period only fills once the current one is full.
    return compare(current, values.slice(-2 * config.window, -config.window), Math.max(0, config.window + needed - values.length), config);
  }
  const before = start - (now - start);
  const at = (p: { at: string }) => Date.parse(p.at);
  const current = series.filter((p) => at(p) > start && at(p) <= now).map((p) => p.value);
  const previous = series.filter((p) => at(p) > before && at(p) <= start).map((p) => p.value);
  return compare(current, previous, Math.max(0, needed - current.length), config);
}

/** How far a trend moved, for its feedback. Changes below `steady` percent read as steady; from `strong` on as a big move. */
export const TREND_STEPS = { steady: 2, slight: 5, strong: 15 };

export type TrendStep = "upStrong" | "up" | "upSlight" | "steady" | "downSlight" | "down" | "downStrong";

export function trendStep(percent: number): TrendStep {
  const a = Math.abs(percent);
  if (a < TREND_STEPS.steady) return "steady";
  const size = a < TREND_STEPS.slight ? "Slight" : a < TREND_STEPS.strong ? "" : "Strong";
  return `${percent > 0 ? "up" : "down"}${size}` as TrendStep;
}

/** One point of a chart: the index of a session or result, and the current level (rolling average) at that point. */
export interface DpiPoint {
  at: string;
  value: number;
  level: number;
}

/** Each index with the average of the latest `window` up to and including it, oldest first. */
export function withLevel(series: { at: string; value: number }[], config = DPI_CONFIG): DpiPoint[] {
  return series.map((p, i) => {
    const last = series.slice(Math.max(0, i + 1 - config.window), i + 1);
    return { ...p, level: last.reduce((s, q) => s + q.value, 0) / last.length };
  });
}

export interface DpiOverview {
  version: number;
  /** Any result counts at all, in any period. */
  hasData: boolean;
  overall: Performance;
  overallSeries: DpiPoint[];
  /** Per game, in the order of the config; games without any counting result at all are left out. */
  games: {
    gameId: string;
    area: SkillArea;
    performance: Performance;
    series: DpiPoint[];
    /** The measured values behind the index, one series per metric key, from the same results. */
    raw: { key: string; series: DpiPoint[] }[];
  }[];
  /** Game index per result id and overall index per session id, for the history list. */
  byResult: Map<string, number>;
  bySession: Map<string, number>;
}

/**
 * Everything the app shows about the index, calculated from all stored results.
 * Levels, trends and chart points follow the time range; the history badges always cover every result.
 */
export function overview(
  results: ResultRecord[],
  range: TimeRange = { unit: "all" },
  now = Date.now(),
  config = DPI_CONFIG,
): DpiOverview {
  const start = rangeStart(range, now);
  // The level line is the average of the latest results, so it is drawn over the whole history and then cut.
  const inRange = (list: DpiPoint[]) => (start === null ? list : list.filter((p) => Date.parse(p.at) > start));
  const sorted = [...results].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const byResult = new Map<string, number>();
  for (const r of sorted) {
    const idx = gameIndex(r.gameId, r.settings, r.values, config);
    if (idx !== null) byResult.set(r.id, idx);
  }

  // Sessions in the order they were played: the first result of a session marks its place.
  const sessions = new Map<string, ResultRecord[]>();
  for (const r of sorted) sessions.set(r.sessionId, [...(sessions.get(r.sessionId) ?? []), r]);
  const bySession = new Map<string, number>();
  const overallSeries: { at: string; value: number }[] = [];
  for (const [id, list] of sessions) {
    const idx = sessionIndex(list, config);
    if (idx === null) continue;
    bySession.set(id, idx);
    overallSeries.push({ at: list[0].startedAt, value: idx });
  }

  const games = config.games
    .map((g) => {
      const counted = sorted.filter((r) => r.gameId === g.gameId && byResult.has(r.id));
      const series = counted.map((r) => ({ at: r.startedAt, value: byResult.get(r.id)! }));
      const keys = [...new Set(g.metrics.map((m) => m.key))];
      return {
        gameId: g.gameId,
        area: g.area,
        performance: performance(series, range, now, config),
        series: inRange(withLevel(series, config)),
        raw: keys.map((key) => ({
          key,
          series: inRange(withLevel(counted.map((r) => ({ at: r.startedAt, value: Number(r.values[key]) || 0 })), config)),
        })),
        played: series.length > 0,
      };
    })
    // Games never played don't show; games not played in the period do, without a level.
    .filter((g) => g.played)
    .map(({ played: _, ...g }) => g);

  return {
    version: config.version,
    hasData: overallSeries.length > 0,
    overall: performance(overallSeries, range, now, config),
    overallSeries: inRange(withLevel(overallSeries, config)),
    games,
    byResult,
    bySession,
  };
}
