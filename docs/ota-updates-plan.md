# OTA updates plan

Scope: the app finds out by itself that a newer D³ release exists, tells the player, and installs it on request.
Status: plan only, nothing is built yet.

Status legend: ❓ = needs a decision from you before I start.

## Where we start from

- Tauri 2 app, version `0.1.0` in three places: `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`.
- Releases live on GitHub (`sbforge/daily-darts-drill`). `.github/workflows/release.yml` builds
  `.msi` (Windows) and `.dmg` (macOS) when a release is published and attaches them. No Linux build, no signing,
  no update metadata. (TODO.md #5 "Fix GitHub Actions asset creation" overlaps with this.)
- No updater or process plugin yet. The CSP already allows `https:` in `connect-src`.
- All data is in a SQLite file in the app config folder; a running routine that gets interrupted is stored as "Aborted".

## User stories

### Discovery

- **US-1 Automatic check.** As a player, I want the app to check for a new version when it starts, so that I don't
  have to watch the GitHub page.
  - The check runs in the background after the loading screen and never blocks or slows down the start.
  - No network, GitHub down, or rate limited: nothing is shown, the error goes to the log only.
  - At most one automatic check per day (time of the last check is stored in settings).
- **US-2 Manual check.** As a player, I want a "Check for updates" button in Settings, so that I can check right now.
  - Shows "Checking…", then either "You are on the latest version (x.y.z)" or the update (US-3).
  - Errors are shown here (unlike US-1), in plain words: "Could not reach the update server".
- **US-3 See what's new.** As a player, I want to see the new version number and its release notes before I update,
  so that I know what changes.
  - Notes come from the GitHub release text (Markdown, rendered as plain formatted text, links open in the browser).
- **US-4 Unobtrusive hint.** As a player, I want a small badge (e.g. on the gear icon / in the footer) when an update is
  available, instead of a popup in my face, so that my training is not interrupted.
- **US-5 Turn it off.** As a player, I want to switch the automatic check off in Settings, so that the app does not
  go online by itself. The manual check (US-2) keeps working.
- **US-6 Skip a version.** As a player, I want to say "Skip this version", so that I am not reminded about it again.
  A newer version than the skipped one is shown again.

### Installation

- **US-7 One-click install.** As a player, I want to click "Update now" and have the app download, install and restart
  itself, so that I don't have to download and run an installer by hand.
  - Download progress is shown (percent / MB).
  - After the restart the app shows "Updated to x.y.z" once.
- **US-8 Never during training.** As a player, I want the update to never start while a routine is running, so that
  my run is not recorded as "Aborted".
  - "Update now" is disabled during a session, with a hint why; the badge stays.
- **US-9 Later.** As a player, I want "Later", so that I can update after my training. The hint comes back on the next
  start (unless skipped, US-6).
- **US-10 Safe data.** As a player, I want my history to survive an update, and a backup to exist if a new version's
  database migration goes wrong.
  - Before installing, the SQLite file is copied to `backups/d3-<old version>-<date>.db` (keep the last 3).
- **US-11 Trustworthy updates.** As a player, I want the app to install only updates that really come from the
  D³ project, so that nobody can push a manipulated build to me.
  - Every update is signature checked (Tauri updater signature); a bad signature aborts with an error, nothing is installed.
- **US-12 Failed install.** As a player, I want a clear message and a "Download manually" link to the GitHub release
  if the download or install fails, so that I am never stuck.

### Maintainer

- **US-13 Release once, update everywhere.** As the maintainer, I want publishing a GitHub release to be the only step,
  so that the installers, the update packages, their signatures and the update manifest are all built and attached
  automatically.
- **US-14 One version number.** As the maintainer, I want to bump the version in one place, so that the app, the
  installer and the update manifest never disagree.
- **US-15 Pre-releases.** As the maintainer, I want GitHub pre-releases not to reach normal players, so that I can test
  a build first. ❓ Optional: a "beta channel" switch in Settings for players who want them.

## Technical plan

### 1. Signing keys (one-time, manual, you)

- `npx tauri signer generate -w ~/.tauri/d3.key` → private key + password, public key.
- Private key and password go into GitHub repo secrets `TAURI_SIGNING_PRIVATE_KEY` and
  `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. Back the key up somewhere safe: **if it is lost, installed apps can never
  verify an update again** and players must reinstall by hand.
- The public key goes into `tauri.conf.json` (it is not secret).

This is separate from OS code signing (Apple Developer ID / Windows Authenticode), see Risks.

### 2. Plugins and config

- Rust: add `tauri-plugin-updater` and `tauri-plugin-process` to `Cargo.toml`, register both in `src-tauri/src/main.rs`
  (updater via `Builder::new().build()`, desktop only).
- JS: `@tauri-apps/plugin-updater`, `@tauri-apps/plugin-process`.
- `capabilities/default.json`: add `updater:default` and `process:allow-restart`.
- `tauri.conf.json`:
  - `bundle.createUpdaterArtifacts: true` (builds `.app.tar.gz` on macOS and signed `.msi`/NSIS `.exe` on Windows,
    each with a `.sig`).
  - `plugins.updater.pubkey: "<public key>"`
  - `plugins.updater.endpoints: ["https://github.com/sbforge/daily-darts-drill/releases/latest/download/latest.json"]`
    (`/releases/latest` skips pre-releases and drafts, which covers US-15 for free).
  - `plugins.updater.windows.installMode: "passive"` (small progress window, no wizard).
  - `version: "../package.json"` so `package.json` is the single source (US-14); `Cargo.toml` version is bumped
    alongside by the release script or kept in sync by a CI check.

### 3. Release workflow (`.github/workflows/release.yml`)

- Pass the two signing secrets as env vars to the `tauri build` step.
- Collect the updater artifacts as well (`*.app.tar.gz`, `*.sig`, the Windows installer used for updates).
- New step in `publish`: generate `latest.json` from the version, the release body (notes), the publish date, and per
  platform the download URL + the content of its `.sig`:
  ```json
  {
    "version": "0.2.0",
    "notes": "…release text…",
    "pub_date": "2026-11-03T12:00:00Z",
    "platforms": {
      "darwin-aarch64": { "url": ".../D3_0.2.0_aarch64.app.tar.gz", "signature": "…" },
      "darwin-x86_64":  { "url": ".../D3_0.2.0_x64.app.tar.gz",     "signature": "…" },
      "windows-x86_64": { "url": ".../D3_0.2.0_x64-setup.exe",      "signature": "…" }
    }
  }
  ```
  and upload it as a release asset. Alternative: replace the hand-made jobs with `tauri-apps/tauri-action`, which
  builds, signs, uploads and writes `latest.json` itself. ❓ Recommendation: switch to `tauri-action`, it removes most
  of the current workflow and also fixes TODO #5.
- macOS: `macos-latest` builds Apple Silicon only. Add a second macOS job with `--target x86_64-apple-darwin`
  (or a universal build) if Intel Macs should get updates. ❓
- Check in CI that the tag (`v0.2.0`) matches the version in `package.json`, fail otherwise.

### 4. Frontend

- New module `src/lib/updates.svelte.ts`, reactive state like `session.svelte.ts`:
  - `state`: `idle | checking | upToDate | available | downloading | installing | error`
  - `available`: `{ version, notes, date }`, `progress`: bytes done / total
  - `check({ manual })` wraps `check()` from the plugin; applies "skipped version" and "once a day" rules only when
    not manual.
  - `install()`: refuses while a session runs (US-8) → backup DB (step 5) → `downloadAndInstall(onEvent)` for progress
    → `relaunch()`.
- `App.svelte`:
  - after the loading screen, `updates.check({ manual: false })` if auto check is on.
  - badge on the settings gear / footer when `state === "available"`.
  - Settings, new section "Updates": current version, auto check toggle, "Check for updates" button, and when
    available: version, notes, "Update now" / "Later" / "Skip this version", progress bar, error + manual download link.
  - one-time "Updated to x.y.z" toast: compare stored `lastRunVersion` with `getVersion()` on start.
- i18n: all new strings in `src/lib/i18n/en.ts` and `de.ts`.
- Settings in the DB (`store.ts` defaults + `db.ts`): `updates.autoCheck` (default on ❓), `updates.lastCheck`,
  `updates.skippedVersion`, `app.lastRunVersion`.
- Browser preview (sql.js mock): the updater is Tauri-only, so `updates.svelte.ts` must fall back to a no-op/fake
  state outside Tauri, like the DB does.

### 5. Data safety

- Small Rust command `backup_database(label)` (or JS via `@tauri-apps/plugin-fs`) that copies the SQLite file into
  `<app config>/backups/` and prunes to the last 3. Called right before `downloadAndInstall`.
- DB migrations keep being forward-only; a new version must open an old DB. Downgrades are not supported (the updater
  only offers higher versions anyway).

### 6. Testing

- Local: build version `0.1.0`, install it, then serve a `latest.json` for `0.1.1` from a local static server and point
  a dev-only endpoint at it (endpoint list can be overridden via config for test builds). Check: discovery, skip,
  later, progress, restart, toast, backup file, bad signature (edit the `.sig`) is rejected, offline start is silent.
- Real: publish `0.1.1` as a pre-release first (must not be offered), then as a release (must be offered).
- Both on Windows and macOS.

## Risks and open points

- **The first update-capable version must be installed by hand.** `0.1.0` has no updater; only versions from the one
  with this feature onward can update themselves. Worth saying in the release notes.
- **macOS without Apple signing/notarization.** Self-updates of the `.app.tar.gz` work, but the very first install of
  an unsigned `.dmg` still needs the right-click → Open dance. Real notarization needs an Apple Developer account (99 $/yr). ❓
- **Windows without Authenticode.** SmartScreen may warn on the first install; the updater itself works. Windows closes
  the app during install (that is why US-8 matters).
- **Linux:** ✅ decided: part of v1. The updater only supports AppImage, so CI builds an AppImage (Ubuntu runner,
  `linux-x86_64` entry in `latest.json`); a `.deb` would only update manually.
- **Lost signing key** = no more updates for installed apps (see step 1).
- **GitHub API limits:** not an issue, `releases/latest/download/latest.json` is a plain file download, not the API.

## Suggested order

1. Keys + plugins + config + `latest.json` in CI (US-11, US-13, US-14, US-15). Ship it as a release so an
   update-capable version exists in the wild.
2. Manual check + install in Settings (US-2, US-3, US-7, US-8, US-10, US-12).
3. Automatic check, badge, skip, later, off switch, "updated" toast (US-1, US-4, US-5, US-6, US-9).
4. ❓ Beta channel (rest of US-15).
