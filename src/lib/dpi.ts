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
  bySetting?: { key: string; metrics: Record<string, MetricConfig[]> };
  /** A result only counts with at least `min` of these values added up (darts, rounds, ...). Too short a game says little. */
  sample: { keys: string[]; min: number };
}

export interface IndexConfig {
  version: number;
  games: GameIndexConfig[];
  /** Weight of each area in the overall index. Areas without a result in a session are left out and the rest scaled up. */
  areas: Record<SkillArea, number>;
  /** Results in the current and in the previous period. */
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

/** The index config. Changing a baseline, target or weight means a new version: the whole history is recalculated with it. */
export const DPI_CONFIG: IndexConfig = {
  version: 1,
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
      metrics: [higher("accuracy", 5, 40)],
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
      gameId: "around-the-clock",
      area: "accuracy",
      metrics: [higher("accuracy", 20, 60)],
      // The rings differ a lot in size, so each has its own scale.
      bySetting: {
        key: "zone",
        metrics: {
          innerSingle: [higher("accuracy", 20, 60)],
          outerSingle: [higher("accuracy", 15, 50)],
          triple: [higher("accuracy", 5, 35)],
          double: [higher("accuracy", 5, 35)],
        },
      },
      sample: { keys: ["darts"], min: 15 },
    },
  ],
  areas: { scoring: 0.25, doubles: 0.25, checkout: 0.25, accuracy: 0.15, consistency: 0.1 },
  window: 10,
  minTrend: 5,
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

function gameConfig(gameId: string, config: IndexConfig): GameIndexConfig | undefined {
  return config.games.find((g) => g.gameId === gameId);
}

/** Whether a game has an index at all (the warm-up has none). */
export function hasIndex(gameId: string, config = DPI_CONFIG): boolean {
  return !!gameConfig(gameId, config);
}

/** The game index of one result, or null when the game has none or the result is too short to count. */
export function gameIndex(
  gameId: string,
  settings: Settings,
  values: Record<string, number>,
  config = DPI_CONFIG,
): number | null {
  const g = gameConfig(gameId, config);
  if (!g) return null;
  const sample = g.sample.keys.reduce((s, k) => s + (Number(values[k]) || 0), 0);
  if (sample < g.sample.min) return null;
  const metrics = (g.bySetting && g.bySetting.metrics[String(settings[g.bySetting.key])]) ?? g.metrics;
  return weighted(metrics.map((m) => ({ score: normalize(Number(values[m.key]), m), weight: m.weight })));
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
  /** `missing`: results still to play before both periods are full enough; 0 when the previous level is 0. */
  | { kind: "notEnough"; missing: number }
  | { kind: "trend"; percent: number };

export interface Performance {
  /** Average of the latest results (up to the window), 0-100; null without any. */
  current: number | null;
  /** How many results the current value is made of. */
  count: number;
  trend: Trend;
}

const avg = (list: number[]) => (list.length ? list.reduce((s, n) => s + n, 0) / list.length : null);

/** Current level and trend from a series of indices, oldest first. */
export function performance(series: number[], config = DPI_CONFIG): Performance {
  const current = series.slice(-config.window);
  const previous = series.slice(-2 * config.window, -config.window);
  const now = avg(current);
  const before = avg(previous);
  const needed = config.minTrend;
  // The previous period only fills once the current one is full. Without a previous level above 0 a percentage says nothing.
  const trend: Trend =
    current.length < needed || previous.length < needed || now === null || !before
      ? { kind: "notEnough", missing: Math.max(0, config.window + needed - series.length) }
      : { kind: "trend", percent: ((now - before) / before) * 100 };
  return { current: now, count: current.length, trend };
}

export interface DpiOverview {
  version: number;
  overall: Performance;
  /** Per game, in the order of the config; games without any counting result are left out. */
  games: { gameId: string; area: SkillArea; performance: Performance }[];
  /** Game index per result id and overall index per session id, for the history list. */
  byResult: Map<string, number>;
  bySession: Map<string, number>;
}

/** Everything the app shows about the index, calculated from all stored results. */
export function overview(results: ResultRecord[], config = DPI_CONFIG): DpiOverview {
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
  for (const [id, list] of sessions) {
    const idx = sessionIndex(list, config);
    if (idx !== null) bySession.set(id, idx);
  }

  const games = config.games
    .map((g) => ({
      gameId: g.gameId,
      area: g.area,
      performance: performance(sorted.filter((r) => r.gameId === g.gameId && byResult.has(r.id)).map((r) => byResult.get(r.id)!), config),
    }))
    .filter((g) => g.performance.count > 0);

  return { version: config.version, overall: performance([...bySession.values()], config), games, byResult, bySession };
}
