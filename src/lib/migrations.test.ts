// Runs the same .sql files the app ships, in order, on an in-memory SQLite (sql.js).
// The plugin's own part (a transaction per migration, refusing changed or unknown ones) is checked by hand in the app.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import initSqlJs, { type Database } from "sql.js";
import { beforeAll, describe, expect, it } from "vitest";

const DIR = join(__dirname, "../../src-tauri/migrations");
const files = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
let SQL: Awaited<ReturnType<typeof initSqlJs>>;

beforeAll(async () => {
  SQL = await initSqlJs();
});

const names = (db: Database, type: string) =>
  db.exec(`SELECT name FROM sqlite_master WHERE type='${type}' AND name NOT LIKE 'sqlite_%' ORDER BY name`)[0]?.values.flat() ?? [];

function migrate(db: Database, upTo = files.length) {
  for (const f of files.slice(0, upTo)) db.run(readFileSync(join(DIR, f), "utf8"));
}

describe("migrations", () => {
  it("are numbered without gaps", () => {
    files.forEach((f, i) => expect(f.startsWith(String(i + 1).padStart(4, "0"))).toBe(true));
  });

  it("an empty database gets every table and index", () => {
    const db = new SQL.Database();
    migrate(db);
    expect(names(db, "table")).toEqual(["darts", "game_results", "routines", "sessions", "settings"]);
    expect(names(db, "index")).toEqual(["idx_darts_result", "idx_results_game"]);
  });

  it("the baseline is a no-op on a database that already has it, rows included", () => {
    const db = new SQL.Database();
    migrate(db, 1);
    db.run("INSERT INTO settings VALUES ('language', 'de')");
    db.run("INSERT INTO sessions (id, routine_name, started_at) VALUES ('s1', 'R', '2026-01-01')");
    migrate(db, 1);
    expect(db.exec("SELECT value FROM settings")[0].values).toEqual([["de"]]);
    expect(db.exec("SELECT status FROM sessions")[0].values).toEqual([["completed"]]);
  });

  it("everything after the baseline keeps old rows", () => {
    const db = new SQL.Database();
    migrate(db, 1);
    db.run("INSERT INTO routines VALUES ('r', 'N', 'd', 15, 0, '[]', 'now')");
    db.run("INSERT INTO sessions (id, routine_name, started_at) VALUES ('s1', 'R', '2026-01-01')");
    migrate(db);
    expect(db.exec("SELECT count(*) FROM routines")[0].values[0][0]).toBe(1);
    expect(db.exec("SELECT count(*) FROM sessions")[0].values[0][0]).toBe(1);
  });
});
