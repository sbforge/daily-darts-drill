// All persistence lives here: one SQLite file managed by the Tauri SQL plugin.
// Tables: settings, routines, sessions, game_results, darts. The schema lives in src-tauri/migrations.
import Database from "@tauri-apps/plugin-sql";
import type { Dart } from "./autodarts";
import type { ResultRecord } from "./dpi";
import type { Settings } from "./games";
import { cleanItems, DEFAULT_CONFIG, pauseSeconds, starterRoutine, type Config, type Routine, type RoutineItem } from "./store";

let db: Database | null = null;

// The plugin uses a connection pool, so we run our writes one after another.
let chain: Promise<unknown> = Promise.resolve();
function queue<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(fn);
  chain = next.catch(() => undefined);
  return next;
}

function conn(): Database {
  if (!db) throw new Error("The database is not open.");
  return db;
}

export async function openDb(): Promise<void> {
  // Opening the database runs the migrations (src-tauri/migrations), each in its own transaction.
  db = await Database.load("sqlite:darttrainer.db");

  // A routine that was still running when the app closed counts as aborted: no scores kept.
  const stale = await db.select<{ id: string }[]>("SELECT id FROM sessions WHERE status = 'running'");
  for (const { id } of stale) {
    await db.execute(
      `DELETE FROM darts WHERE game_result_id IN (SELECT id FROM game_results WHERE session_id = $1)`,
      [id],
    );
    await db.execute("DELETE FROM game_results WHERE session_id = $1", [id]);
    await db.execute("UPDATE sessions SET status = 'aborted', finished_at = $1 WHERE id = $2", [
      new Date().toISOString(),
      id,
    ]);
  }
}

// ------------------------------------------------------------- settings

export async function getSetting(key: string): Promise<string | null> {
  const rows = await conn().select<{ value: string }[]>("SELECT value FROM settings WHERE key = $1", [key]);
  return rows.length ? rows[0].value : null;
}

export function setSetting(key: string, value: string): Promise<void> {
  return queue(async () => {
    await conn().execute(
      `INSERT INTO settings (key, value) VALUES ($1, $2)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [key, value],
    );
  });
}

export async function loadConfig(): Promise<Config> {
  const host = await getSetting("autodarts_host");
  const port = Number(await getSetting("autodarts_port"));
  return { host: host || DEFAULT_CONFIG.host, port: port || DEFAULT_CONFIG.port };
}

/** False until a connection was saved, i.e. on the first start. */
export async function hasConfig(): Promise<boolean> {
  return (await getSetting("autodarts_host")) !== null;
}

export async function saveConfig(config: Config): Promise<void> {
  await setSetting("autodarts_host", config.host);
  await setSetting("autodarts_port", String(config.port));
}

/** The games and settings last played as a quick game, and which game that was. */
export async function loadQuickGame(): Promise<{ last: string; items: RoutineItem[] }> {
  try {
    const v = JSON.parse((await getSetting("quick_game")) ?? "{}");
    return { last: String(v.last ?? ""), items: cleanItems(Array.isArray(v.items) ? v.items : []) };
  } catch {
    return { last: "", items: [] };
  }
}

export function saveQuickGame(last: string, items: RoutineItem[]): Promise<void> {
  return setSetting("quick_game", JSON.stringify({ last, items }));
}

// ------------------------------------------------------------- routines

export async function loadRoutines(): Promise<Routine[]> {
  const rows = await conn().select<
    { id: string; name: string; description: string; pause_seconds: number; items_json: string }[]
  >("SELECT id, name, description, pause_seconds, items_json FROM routines ORDER BY position");
  const list: Routine[] = rows.map((r) => {
    let items = [];
    try {
      items = JSON.parse(r.items_json);
    } catch {
      /* a broken row becomes an empty routine instead of blocking the app */
    }
    return {
      id: r.id,
      name: r.name,
      description: r.description ?? "",
      pauseSeconds: r.pause_seconds ?? 0,
      items: cleanItems(items),
    };
  });
  if (list.length) return list;

  const starter = [starterRoutine()];
  await saveRoutines(starter);
  return starter;
}

export function saveRoutines(routines: Routine[]): Promise<void> {
  return queue(async () => {
    const d = conn();
    const now = new Date().toISOString();
    for (let i = 0; i < routines.length; i++) {
      const r = routines[i];
      await d.execute(
        `INSERT INTO routines (id, name, description, pause_seconds, position, items_json, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, description = excluded.description,
           pause_seconds = excluded.pause_seconds, position = excluded.position,
           items_json = excluded.items_json, updated_at = excluded.updated_at`,
        [r.id, r.name, r.description, pauseSeconds(r), i, JSON.stringify(r.items), now],
      );
    }
    if (routines.length) {
      const marks = routines.map((_, i) => `$${i + 1}`).join(",");
      await d.execute(`DELETE FROM routines WHERE id NOT IN (${marks})`, routines.map((r) => r.id));
    }
  });
}

// -------------------------------------------------------------- results

export interface GameResultInput {
  sessionId: string;
  /** null for a quick game, played without a routine. */
  routineId: string | null;
  routineName: string;
  sessionStartedAt: string;
  position: number;
  gameId: string;
  gameName: string;
  settings: Settings;
  /** The time cap; 0 for a quick game without one. */
  minutes: number;
  endedEarly: boolean;
  startedAt: string;
  finishedAt: string;
  values: Record<string, number>;
  turns: Dart[][];
}

export function saveGameResult(p: GameResultInput): Promise<void> {
  return queue(async () => {
    const d = conn();
    const resultId = crypto.randomUUID();

    await d.execute(
      `INSERT OR IGNORE INTO sessions (id, routine_id, routine_name, started_at, status)
       VALUES ($1, $2, $3, $4, 'running')`,
      [p.sessionId, p.routineId, p.routineName, p.sessionStartedAt],
    );
    await d.execute(
      `INSERT INTO game_results (id, session_id, position, game_id, game_name, settings_json, minutes,
         ended_early, started_at, finished_at, values_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        resultId,
        p.sessionId,
        p.position,
        p.gameId,
        p.gameName,
        JSON.stringify(p.settings),
        p.minutes,
        p.endedEarly ? 1 : 0,
        p.startedAt,
        p.finishedAt,
        JSON.stringify(p.values),
      ],
    );

    // Raw darts, so stats can always be recomputed or extended later.
    const rows: unknown[][] = [];
    p.turns.forEach((turn, ti) =>
      turn.forEach((dart, di) =>
        rows.push([
          resultId,
          ti,
          di,
          dart.kind,
          dart.number,
          dart.zone,
          dart.score,
          dart.x,
          dart.y,
          dart.radius,
          dart.bouncer ? 1 : 0,
          dart.failed ? 1 : 0,
          dart.method,
        ]),
      ),
    );
    const COLS = 13;
    for (let i = 0; i < rows.length; i += 40) {
      const chunk = rows.slice(i, i + 40);
      const marks = chunk
        .map((_, r) => `(${Array.from({ length: COLS }, (_, c) => `$${r * COLS + c + 1}`).join(",")})`)
        .join(",");
      await d.execute(
        `INSERT INTO darts (game_result_id, turn_index, dart_index, kind, number, zone, score, x, y, radius,
           bouncer, failed, method) VALUES ${marks}`,
        chunk.flat(),
      );
    }
  });
}

export interface SessionInfo {
  sessionId: string;
  /** null for a quick game, played without a routine. */
  routineId: string | null;
  routineName: string;
  startedAt: string;
}

/**
 * Closes a routine run. An aborted run keeps no scores: the results and darts
 * saved so far for that run are removed and only the "Aborted" entry remains.
 */
export function endSession(info: SessionInfo, status: "completed" | "aborted"): Promise<void> {
  return queue(async () => {
    const d = conn();
    if (status === "aborted") {
      await d.execute(
        `DELETE FROM darts WHERE game_result_id IN (SELECT id FROM game_results WHERE session_id = $1)`,
        [info.sessionId],
      );
      await d.execute("DELETE FROM game_results WHERE session_id = $1", [info.sessionId]);
    }
    await d.execute(
      `INSERT INTO sessions (id, routine_id, routine_name, started_at, finished_at, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT(id) DO UPDATE SET finished_at = excluded.finished_at, status = excluded.status`,
      [info.sessionId, info.routineId, info.routineName, info.startedAt, new Date().toISOString(), status],
    );
  });
}

export function deleteSession(sessionId: string): Promise<void> {
  return queue(async () => {
    const d = conn();
    await d.execute(
      `DELETE FROM darts WHERE game_result_id IN (SELECT id FROM game_results WHERE session_id = $1)`,
      [sessionId],
    );
    await d.execute("DELETE FROM game_results WHERE session_id = $1", [sessionId]);
    await d.execute("DELETE FROM sessions WHERE id = $1", [sessionId]);
  });
}

/** When each routine was last started, keyed by routine id. Runs still in progress don't count. */
export async function loadLastPlayed(): Promise<Record<string, string>> {
  const rows = await conn().select<{ routine_id: string; last: string }[]>(
    `SELECT routine_id, MAX(started_at) AS last FROM sessions
     WHERE routine_id IS NOT NULL AND status != 'running' GROUP BY routine_id`,
  );
  return Object.fromEntries(rows.map((r) => [r.routine_id, r.last]));
}

export interface HistoryRow {
  id: string;
  position: number;
  gameId: string;
  gameName: string;
  minutes: number;
  endedEarly: boolean;
  startedAt: string;
  finishedAt: string;
  settings: Settings;
  values: Record<string, number>;
}

export interface HistorySession {
  id: string;
  /** A quick game, played without a routine. */
  quick: boolean;
  routineName: string;
  startedAt: string;
  finishedAt: string | null;
  status: "completed" | "aborted" | "running";
  rows: HistoryRow[];
}

/** The sessions started from `from` (inclusive) to `to` (exclusive), both ISO timestamps, newest first. */
export async function loadSessions(from: string, to: string): Promise<HistorySession[]> {
  const d = conn();
  const sessions = await d.select<any[]>(
    `SELECT id, routine_id, routine_name, started_at, finished_at, status FROM sessions
     WHERE started_at >= $1 AND started_at < $2 ORDER BY started_at DESC`,
    [from, to],
  );
  if (!sessions.length) return [];

  const marks = sessions.map((_, i) => `$${i + 1}`).join(",");
  const results = await d.select<any[]>(
    `SELECT id, session_id, position, game_id, game_name, minutes, ended_early, started_at, finished_at,
            settings_json, values_json
     FROM game_results WHERE session_id IN (${marks}) ORDER BY position`,
    sessions.map((r) => r.id),
  );

  return sessions.map((r) => ({
    id: r.id,
    quick: r.routine_id === null,
    routineName: r.routine_name,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    status: r.status,
    rows: results
      .filter((g) => g.session_id === r.id)
      .map((g) => ({
        id: g.id,
        position: g.position,
        gameId: g.game_id,
        gameName: g.game_name,
        minutes: g.minutes,
        endedEarly: !!g.ended_early,
        startedAt: g.started_at,
        finishedAt: g.finished_at,
        settings: JSON.parse(g.settings_json),
        values: JSON.parse(g.values_json),
      })),
  }));
}

/**
 * Every stored game result, unlimited, for the performance index. Runs still in progress don't count yet.
 * Only the raw values are read: the index itself is never stored, see dpi.ts.
 */
export async function loadResults(): Promise<ResultRecord[]> {
  const rows = await conn().select<any[]>(
    `SELECT g.id, g.session_id, g.game_id, g.started_at, g.settings_json, g.values_json
     FROM game_results g JOIN sessions s ON s.id = g.session_id
     WHERE s.status != 'running' ORDER BY g.started_at`,
  );
  return rows.flatMap((g) => {
    try {
      return [
        {
          id: g.id,
          sessionId: g.session_id,
          gameId: g.game_id,
          startedAt: g.started_at,
          settings: JSON.parse(g.settings_json),
          values: JSON.parse(g.values_json),
        },
      ];
    } catch {
      return []; // a broken row is left out instead of blocking the index
    }
  });
}
