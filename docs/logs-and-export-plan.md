# Logs and data export plan

Scope: two v1 Shoulds (`docs/v1-scope.md`): a log file a player can send with a bug report, and "Export my data" as
the manual counterpart to the automatic backups of the updater and the migrations.
Status: plan only, nothing is built yet.

Status legend: ✅ decided · ❓ needs a decision (my proposal next to it).

## Where we start from

- Errors show in the UI (`saveError`, `dbError`) and in the WebView console, which a player never sees. Nothing is
  written to disk.
- All data is one SQLite file, `darttrainer.db` in the app config folder (paths per OS in the README).
- The About page already has links and the SBOM; it is the natural home for "Open log folder".
- Plugins today: `opener`, `sql`. No `log`, no `dialog`.

## 1. Log file

- **`tauri-plugin-log`** (Rust + `@tauri-apps/plugin-log`): targets the app's log folder (`LogDir`) and stdout in dev.
  Level `info`, `debug` in dev builds.
- **Rotation:** one file, `d3.log`, max ~1 MB, keep the last 3 (`RotationStrategy::KeepSome(3)` if the plugin version has it, else
  `KeepOne`), so it never grows.
- **What is logged** (short lines, no personal data beyond the Autodarts host address):
  - start: app version, OS, schema version, migrations run;
  - Autodarts: connect / disconnect / reconnect, board status changes, discovery results, reset / calibrate results;
  - routine start / end / abort, game finished (game id, minutes, early), no dart-by-dart lines;
  - database errors, failed saves, migration errors (with the backup path);
  - updater: check, found version, download, install, failure;
  - **uncaught errors** in the WebView (`window.onerror`, `unhandledrejection`) and Rust panics.
- JS side: a thin `log.ts` (`log.info/warn/error`) over the plugin, so the code doesn't import the plugin everywhere
  and the browser preview falls back to `console`.
- **About page:** "Open log folder" (opener plugin, `revealItemInDir`) and a line in the bug report link:
  "Please attach `d3.log` from the log folder". The issue template on GitHub says the same.

## 2. Export my data

- **Settings → new card "Your data"**: "Export my data" and the data folder's path with "Open folder".
- **Export** writes a consistent copy of the database with SQLite's `VACUUM INTO '<path>'` (safe while the app has
  the file open, no Rust needed) to a place the player picks:
  - **`tauri-plugin-dialog`** `save()` with the default name `d3-export-<date>.db`. ❓ Alternatively without a new
    plugin: always into the Downloads folder (`downloadDir()`), then reveal it. Proposal: the save dialog, players
    expect to choose.
- Not during a running routine (same rule as the updater), so the copy never has half a session in it.
- The same `VACUUM INTO` helper does the automatic backups of the updater and the migrations
  (`docs/ota-updates-plan.md`, `docs/db-migrations-plan.md`): one function, three callers.

## 3. Later (not v1)

- **Import / restore** a database file (replace the current one): needs closing the database, a Rust command to swap
  the file, and a check of its schema version. Useful together with multi-device or a new computer.
- **CSV / JSON export** of results for spreadsheets.

## Order

1. `tauri-plugin-log`, `log.ts`, the log lines above, uncaught errors, "Open log folder". (S)
2. `VACUUM INTO` helper (shared with backups), dialog plugin, "Your data" card. (S)
