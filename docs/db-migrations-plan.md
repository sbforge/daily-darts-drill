# Database migrations plan

Scope: once other people have history in their database, every schema change has to run exactly once, in order,
on every machine, and must never lose data. v1 Must (`docs/v1-scope.md`), needed by the OTA updates
(`docs/ota-updates-plan.md`, "What happens on the player's computer", step 6) and by the scorer plan (`darts` table).
Status: plan only, nothing is built yet.

Status legend: ✅ decided · ❓ needs a decision (my proposal next to it).

## Where we start from

- One SQLite file, `darttrainer.db` in the app config folder, opened from JS through `tauri-plugin-sql`
  (`src/lib/db.ts`, `openDb()`).
- `SCHEMA`: `CREATE TABLE IF NOT EXISTS` for `settings`, `routines`, `sessions`, `game_results`, `darts`, two indexes.
- Then three hand-made upgrades for older databases: add `sessions.status`, `routines.description`,
  `routines.pause_seconds` if `pragma_table_info` doesn't list them.
- Then a clean-up that is not a migration: sessions still `running` become `aborted`, their results are deleted.
- No schema version anywhere. The plugin uses a **connection pool**: two `execute()` calls may run on different
  connections, so `BEGIN` in one call and `COMMIT` in the next is not a transaction.

## Design

### Schema version

`PRAGMA user_version` (an integer SQLite keeps in the file header, 0 for every database today) is the schema version.
The app knows its own version as `MIGRATIONS.length`.

### Migrations

A numbered list in `db.ts` (or `src/lib/migrations.ts` once it grows), never edited after a release, only appended:

```ts
const MIGRATIONS: string[] = [
  /* 1 */ `…the full schema of today, every table and index with IF NOT EXISTS…`,
  /* 2 */ `ALTER TABLE …`,
];
```

- **Migration 1 = baseline.** The tables as they are today. A new install creates them; an existing `0.1.0` database
  already has them (`IF NOT EXISTS` makes it a no-op). The three column checks run once more, **before** migration 1,
  as a small `upgradeLegacy()` for databases from before 0.1.0, and are never extended again.
- **Each migration is one string run by one `execute()` call**, wrapped as
  `BEGIN; …statements…; PRAGMA user_version = n; COMMIT;`. One call means one connection, so it is a real transaction:
  a failing statement rolls back the whole step and the version stays where it was. ❓ To confirm while building:
  the plugin (sqlx) runs all statements of one call; if it only runs the first, a small Rust command
  `run_migration(sql)` with `rusqlite`/`sqlx` takes over (same plan, other place).
- Migrations are **forward-only**. Changing or deleting data is allowed (e.g. renaming a game id in `items_json`),
  but must work on every older database.

### Order on start (`openDb()`)

1. Open the database, read `PRAGMA user_version` → `v`.
2. `v > MIGRATIONS.length` (a newer app wrote this database, e.g. after a manual downgrade) → the app opens
   **read-only in spirit**: it shows "This data is from a newer version of D³. Please update." and writes nothing.
3. `v < MIGRATIONS.length` → **backup first** (`VACUUM INTO '<config>/backups/d3-schema<v>-<date>.db'`, a consistent
   copy even while the file is open, no Rust needed; keep the last 3), then `upgradeLegacy()` if `v == 0`, then the
   migrations `v+1 … n`, one after another.
4. A migration fails → stop, show an error screen with the backup's path and "Open backup folder", and don't load the
   rest of the app (no writes on a half-upgraded database). The error goes to the log (`docs/logs-and-export-plan.md`).
5. Then the stale-session clean-up, then the normal start.

The loading screen already has steps; "Updating your data…" becomes one of them when migrations run.

### Rules for later changes (for the maintainer)

- New column: `ALTER TABLE x ADD COLUMN y … DEFAULT …` (SQLite can't add a NOT NULL column without a default).
- Renaming or dropping a column, changing a type: the SQLite way (`CREATE TABLE x_new`, copy, drop, rename) inside
  the same migration.
- JSON columns (`items_json`, `settings_json`, `values_json`) can change shape without a migration as long as the
  code reads old shapes (like 121 reading results from before its settings existed). A migration is only needed when
  old shapes would otherwise need code forever.
- Never edit a released migration; fix it with a new one.

## Tests

Part of the testing plan (`docs/testing-plan.md`), run against a real SQLite (Node's `node:sqlite` or `better-sqlite3`
in vitest, with the same SQL strings):
- empty database → all migrations → schema matches `MIGRATIONS` result;
- a fixture database from `0.1.0` (copy of today's file, version 0) → upgraded, all rows still there;
- a broken migration → version unchanged, data unchanged;
- a database with a higher version → refused.

## Order

1. `user_version`, `MIGRATIONS` with the baseline, `upgradeLegacy()`, runner with the transaction per call. (S)
2. Backup via `VACUUM INTO`, pruning, the error screen. (S)
3. Tests with a `0.1.0` fixture. (S)

Ships with or before the first OTA-capable release, since the updater relies on step 6 of its flow.
