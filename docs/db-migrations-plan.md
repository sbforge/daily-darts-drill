# Database migrations plan

Scope: once other people have history in their database, every schema change has to run exactly once, in order,
on every machine, and must never lose data. v1 Must (`docs/v1-scope.md`), needed by the OTA updates
(`docs/ota-updates-plan.md`, "What happens on the player's computer", step 6) and by the scorer plan (`darts` table).
Status: plan only, nothing is built yet.

Status legend: ✅ decided · ❓ needs a decision (my proposal next to it).

✅ **Decided:** the migrations of `tauri-plugin-sql` itself (the framework's own way), not a hand-made runner in JS
and not our own Rust command.

## Where we start from

- One SQLite file, `darttrainer.db` in the app config folder, opened from JS through `tauri-plugin-sql`
  (`src/lib/db.ts`, `openDb()`).
- `SCHEMA`: `CREATE TABLE IF NOT EXISTS` for `settings`, `routines`, `sessions`, `game_results`, `darts`, two indexes.
- Then three hand-made upgrades: add `sessions.status`, `routines.description`, `routines.pause_seconds` if
  `pragma_table_info` doesn't list them.
- Then a clean-up that is not a migration: sessions still `running` become `aborted`, their results are deleted.
- No schema version anywhere.
- **No release has been published yet** (no tags on GitHub), so the only existing database is the developer's own,
  and it already has every column.
- Why not hand-made in JS: the plugin uses a **connection pool**; `BEGIN` and `COMMIT` sent as separate calls can land
  on different connections, and a failed step can leave a transaction open. The plugin's migrations run in Rust on one
  connection and don't have that problem.

## How the plugin's migrations work

- In Rust (`src-tauri/src/main.rs`), the plugin gets a list of migrations for the database URL:
  ```rust
  tauri_plugin_sql::Builder::new()
      .add_migrations("sqlite:darttrainer.db", migrations())
      .build()
  ```
  Each one is `Migration { version: 1, description: "baseline", sql: include_str!("../migrations/0001_baseline.sql"),
  kind: MigrationKind::Up }`.
- They run **when the database is opened** (`Database.load("sqlite:darttrainer.db")` in `openDb()`, as today): every
  migration not applied yet, in version order, **each in its own transaction**. A failing one rolls back and
  `Database.load` rejects with the error; nothing after it runs.
- What ran is recorded in a table the plugin manages, `_sqlx_migrations` (version, description, checksum, time).
  - A migration that was already applied and has **changed since** (checksum) → `load` fails. That enforces
    "never edit a released migration".
  - A database with a migration the app **doesn't know** (written by a newer app, e.g. after a manual downgrade) →
    `load` fails too. That is the "refuse a newer database" rule for free. ❓ To confirm while building: the exact
    error in both cases, so the error screen can tell them apart.

## Design

### Migration files

- `src-tauri/migrations/0001_baseline.sql`, `0002_….sql`, … pulled into the binary with `include_str!`, listed in
  `migrations()` in `main.rs`. Plain SQL files: easy to read, and the tests (below) can run the same files.
- **Migration 1 = baseline:** today's `SCHEMA`, every table and index with `IF NOT EXISTS`. A new install creates
  everything; the developer's existing database already has it all, so it just gets recorded as version 1.
- **The three column checks go away.** They only existed for databases from before those columns; no such database
  exists outside development (no release yet), and the developer's own one already has the columns.
- `SCHEMA` and the column checks are removed from `db.ts`; `openDb()` only calls `Database.load` and then the
  stale-session clean-up as today.
- Only `MigrationKind::Up`. No down migrations: the updater never goes back a version.

### Backup before migrating

The plugin migrates inside `Database.load`, so the backup has to happen **before** the database is opened:

- A Rust step in `setup()` (before any window can call `load`): if `darttrainer.db` exists and the app version differs
  from the one in `<config>/last-version` (a one-line text file), copy `darttrainer.db` and its `-wal` file (WAL mode)
  to `<config>/backups/update/<old version>-<date>/`, keep the last 3, then write the new version into `last-version`.
- A plain file copy is safe there: the database isn't open yet at that point.
- The same step also takes the **daily backup** (first start of the day, last 5 kept), see
  `docs/logs-and-export-plan.md` §1: one backup step in `setup()`, two folders.
- "Version changed" is a simple stand-in for "migrations pending" and also catches manual installs. It makes a few
  backups that weren't strictly needed (a version without a schema change); with only the last 3 kept, that's fine.
- The updater's own backup right before installing (`docs/ota-updates-plan.md`) stays; with the database open it uses
  `VACUUM INTO` from JS (`docs/logs-and-export-plan.md`).

### When a migration fails

- `Database.load` rejects → `openDb()` throws → the app shows an error screen instead of starting (today: `dbError`):
  "Your data could not be updated", the backup's path, "Open backup folder", and the line to attach the log.
  Nothing writes to the database; the transaction already rolled back.
- The error goes to the log (`docs/logs-and-export-plan.md`).
- The loading screen gets a step "Updating your data…". ❓ The plugin doesn't report which migration runs, so it's one
  step for all of them. Proposal: fine, migrations are quick.

### Rules for later changes (for the maintainer)

- A schema change = a new file `000n_<what>.sql` + one line in `migrations()`. Never edit or delete a released one.
- New column: `ALTER TABLE x ADD COLUMN y … DEFAULT …` (SQLite can't add a NOT NULL column without a default).
- Renaming or dropping a column, changing a type: the SQLite way (`CREATE TABLE x_new`, copy, `DROP`, `ALTER TABLE
  x_new RENAME TO x`) in the same file.
- Changing data is fine too (e.g. renaming a game id inside `items_json`), as long as it works on every older database.
- JSON columns (`items_json`, `settings_json`, `values_json`) can change shape without a migration as long as the code
  still reads old shapes (like 121 reading results from before its settings existed).

## Tests

Part of `docs/testing-plan.md`, in vitest with Node's built-in SQLite (`node:sqlite`), running the same `.sql` files
in order (the plugin itself is Rust and is not part of these tests):
- empty database → all files → every table and index exists;
- the developer's current database (an anonymised copy as fixture) → baseline is a no-op, all rows still there;
- each new migration: applied to a database with sample rows from the version before, rows kept and moved as intended.

The plugin's own behaviour (transaction per migration, refusing a changed or unknown migration, the error reaching
the app) is checked once by hand in the real app.

## Order

1. Baseline file, `migrations()` in `main.rs`, `SCHEMA` and the column checks out of `db.ts`. Check by hand: a new
   install, the existing database, a deliberately broken migration, a changed migration. (S)
2. Backup in `setup()` with `last-version`, the error screen. (S)
3. Tests for the `.sql` files. (S)

Ships with or before the first OTA-capable release, since the updater relies on it.
