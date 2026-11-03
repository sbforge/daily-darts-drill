# Backups, crash reports, logs and data export plan

Scope: keeping the player's data safe and making problems analysable.
- **Must for v1** (`docs/v1-scope.md`): a backup of the database on the first start of every day (last 5 kept), and a
  notification with debug details for every unhandled error, so a crash can be analysed later. The log file, since the
  crash reports and the backups write to it.
- **Should for v1:** "Export my data".

Status: plan only, nothing is built yet. (The file keeps its old name, `logs-and-export-plan.md`, so links stay valid.)

Status legend: ✅ decided · ❓ needs a decision (my proposal next to it).

## Where we start from

- All data is one SQLite file, `darttrainer.db`, in the app config folder (paths per OS in the README).
  It runs in **WAL mode**: recent changes can sit in `darttrainer.db-wal` next to it until SQLite folds them into the
  main file. After a crash the `-wal` file may hold the last minutes of play, so **a backup copies both files**.
- No backups. The migrations plan adds one when the app version changes (`docs/db-migrations-plan.md`), the OTA plan
  one before installing an update.
- Errors show in the UI only where the code catches them (`saveError`, `dbError`); everything else ends in the
  WebView console, which a player never sees. Nothing is written to disk.
- Plugins today: `opener`, `sql`. No `log`, no `dialog`.

## 1. Daily backup ✅ Must

**When:** on start, **before the database is opened**, in Rust (`setup()` in `main.rs`), if there is no daily backup
from today yet. Running before the database is open means the files are not in use, so a plain file copy is safe
and complete.

**What:** `darttrainer.db` and, if present, `darttrainer.db-wal` (the `-shm` file is only an index SQLite rebuilds).
Opening a backup later replays its `-wal`, so nothing played before the crash is lost.

**Where and how many:**
- `<app config>/backups/daily/2026-11-03/` (one folder per backup, holding the copied files), **the last 5 kept**,
  older ones deleted after a successful copy.
- One backup step in `setup()` for all reasons, each with its own folder and count, so a daily backup never pushes
  out the one taken before a migration:

  | Reason | Folder | Kept |
  |---|---|---|
  | First start of the day | `backups/daily/<date>/` | 5 |
  | App version changed (before migrations) | `backups/update/<old version>-<date>/` | 3 |
  | Right before an in-app update (database open, `VACUUM INTO` from JS) | `backups/update/…` | (same 3) |

  On the first start after an update both apply: the daily one is taken, and the version one too.

**If the copy fails** (disk full, permissions): the app still starts (starting puts no data at risk), logs it and
shows a toast "Today's backup failed: …" with "Open backup folder". It tries again on the next start.

**Restoring** (by hand for v1): the README explains "close D³, copy the files from a backup folder over
`darttrainer.db`". An in-app restore is later (§5).

**Settings → "Your data" card:** "Last backup: today, 08:12", "Open backup folder", next to the export (§4).
❓ The number 5 fixed or a setting? Proposal: fixed for v1.

## 2. Crash reports for unhandled errors ✅ Must

**What counts:** every error nothing else caught:
- `window.onerror` and `unhandledrejection` (any error in the app's TypeScript);
- errors while drawing a screen: a `<svelte:boundary>` around the main view; it shows the toast and a "Something went
  wrong on this screen, back to Train" fallback instead of a blank window;
- Rust: failed commands already come back as rejected promises (caught above); a Rust **panic** is written to the log
  by a panic hook. A panic on the main thread ends the app, so there is no toast then; see "after a hard crash".

**The notification:** a toast at the bottom right, on top of everything (next to the fx layer), red accent, stays
until closed (not timed, a crash shouldn't slip by):
- "Something went wrong" + the error message in one line;
- **"Copy details"**: puts the full report on the clipboard;
- **"Report on GitHub"**: opens a new issue in the browser with the title and the short details filled in; the player
  sees it on GitHub and decides whether to submit. The full report stays a file to attach (a URL can't carry it all);
- **"Open log folder"**.
- The same error again within a minute: one toast with "×3" instead of three toasts.
- A crash during a game doesn't stop the game: the toast doesn't block clicks, the clock keeps running.

**The report** (`crash-2026-11-03T08-12-55.json` in the log folder, the last 20 kept), with what's needed to analyse it:
- time, app version, OS and version, WebView version, language;
- error type, message, **stack trace**;
- where the app was: screen, phase (countdown / running / break / summary), game id and its settings, routine,
  turn and dart count, Autodarts connection and board status, animations on/off;
- the last ~50 lines of the log;
- no personal data beyond the Autodarts host address; no darts history.

**After a hard crash** (the app was killed or the Rust side panicked): `setup()` writes a `running` marker file on
start and deletes it on a clean exit. If the marker is still there on the next start, the app shows the toast
"D³ closed unexpectedly last time" with "Open log folder" (the panic is in the log). ❓ Proposal: yes; the toast also
says that the daily backup from that morning exists.

**In development** (`npm run tauri dev`, the browser preview): the same toast, plus the error in the console as today.

## 3. Log file (Must, the base for §1 and §2)

- **`tauri-plugin-log`** (Rust + `@tauri-apps/plugin-log`): writes to the app's log folder (`LogDir`) and to stdout
  in dev. Level `info`, `debug` in dev builds.
- **Rotation:** one file, `d3.log`, max ~1 MB, keep the last 3 (`RotationStrategy::KeepSome(3)` if the plugin
  version has it, else `KeepOne`), so it never grows.
- **What is logged** (short lines, no personal data beyond the Autodarts host address):
  - start: app version, OS, migrations run (the plugin's `_sqlx_migrations`), backups taken or failed;
  - Autodarts: connect / disconnect / reconnect, board status changes, discovery results, reset / calibrate results;
  - routine start / end / abort, game finished (game id, minutes, early), no dart-by-dart lines;
  - database errors, failed saves, migration errors (with the backup path);
  - updater: check, found version, download, install, failure;
  - every crash report (one line with the file name), Rust panics (hook).
- JS side: a thin `log.ts` (`log.info/warn/error`) over the plugin, so the code doesn't import the plugin everywhere
  and the browser preview falls back to `console`.
- **About page:** "Open log folder" (opener plugin, `revealItemInDir`). The GitHub issue template asks for `d3.log`
  and the crash file.

## 4. Export my data (Should)

- In the **"Your data"** card in Settings (with the backups, §1): "Export my data" makes a copy of the database the
  player keeps elsewhere (USB stick, cloud folder, a new computer).
- ✅ A **"Save as" dialog** (`tauri-plugin-dialog`, default name `d3-export-<date>.db`), so the player picks the place.
- The copy is made with SQLite's `VACUUM INTO '<path>'`: one consistent file even while the app has the database open
  (it includes what is still in the `-wal`), no Rust needed. The same helper makes the backup right before an update.
- Not during a running routine (same rule as the updater), so the copy never has half a session in it.

## 5. Later (not v1)

- **Restore from a backup or an export** in the app: needs closing the database, a Rust command to swap the files,
  and a check that the backup's migrations aren't newer than the app's.
- **CSV / JSON export** of results for spreadsheets.

## Order

1. Log plugin, `log.ts`, the log lines. (S)
2. Daily backup in `setup()` (one step with the version backup from the migrations plan), pruning, the "Your data"
   card with last backup and "Open backup folder". (S)
3. Crash reports: handlers, `<svelte:boundary>`, toast, report file, GitHub link, `running` marker. (M)
4. Export with the dialog plugin. (S)
