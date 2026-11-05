# Preview channel plan

Scope: build pre-releases of a release branch in the pipeline, and let an app with **developer mode** on update to
them, while every other app keeps updating exactly as today (stable versions only).
Status: built on `feature/preview-channel`; the pipeline is untested until the first beta tag. How to use it: `docs/release-process.md` (sections 2a and 7).

Status legend: ✅ decided · ❓ needs a decision (my proposal next to it).

## Where we start from

- `release.yml` builds on a pushed `v*` tag into a draft, checks it, and publishes it. A tag with a dash
  (`v0.9.7-beta.1`) is already published as a GitHub **pre-release**, never as latest.
- The app reads `releases/latest/download/latest.json` (`src-tauri/tauri.conf.json`). GitHub's "latest" skips
  pre-releases, so **players can never get a pre-release**. Nothing changes on their side.
- `src/lib/updates.svelte.ts` uses the JS `check()` of `@tauri-apps/plugin-updater`, which can't change the address.
- The version check (`scripts/sync-version.js --check --tag`) wants the tag to equal `package.json`, and
  `scripts/release-notes.js` wants a changelog section for exactly that version. Both would refuse a beta today.
- **Trap found in v0.9.5's `latest.json`:** its URLs point to `releases/latest/download/<file>`, and the macOS
  update packages have no version in their name (`Daily.Darts.Drill_aarch64.app.tar.gz`). A beta's `latest.json`
  as written by tauri-action would send the app to the *stable* release's file, whose signature doesn't match:
  the update fails. The preview channel needs URLs that name the tag (`releases/download/v0.9.7-beta.1/<file>`).

## 1. Naming and branches

✅ Builds on the flow of `docs/release-process.md`; the release branch *is* the pre-release branch.

| What | Name | Built as | Who gets it |
|---|---|---|---|
| Feature / fix | `feature/<name>`, `fix/<name>` | nothing (CI only on its PR) | — |
| Pre-release branch | `release/vX.Y.Z` | pre-releases `vX.Y.Z-beta.N` | apps in developer mode |
| `main` | — | stable `vX.Y.Z` | everybody |

- **Pre-release versions:** `X.Y.Z-beta.N`, `N` counting from 1 per version. Semver orders them as wanted:
  `0.9.6 < 0.9.7-beta.1 < 0.9.7-beta.2 < 0.9.7`. So a preview app moves through the betas and lands on the stable
  version at the end, with no extra rule.
- **Tag placement is checked:** a stable tag must be on `main`, a beta tag on a `release/v*` branch with the same
  `X.Y.Z`. The `version` job fails otherwise.
- **Hotfixes** are tested locally and go straight to stable (section 5).

### How a beta gets built

❓ Proposal: **tag it, as with stable releases.**

```bash
git switch release/v0.9.7
git tag -a v0.9.7-beta.1 -m "Version 0.9.7 beta 1"
git push origin v0.9.7-beta.1
```

- ✅ No version bump for a beta: the release branch's `package.json` may still have the previous version. For a tag
  with a dash, the workflow checks that it is on `release/v<X.Y.Z>`, then writes the full version (`0.9.7-beta.1`)
  into `package.json`/`Cargo.toml` inside the build only (`sync-version.js --set <version>`). Stable tags keep the
  strict check (and must be on `main`).
- **Release notes of a beta:** the `## [0.9.7]` section if there is one, else `## [Unreleased]`, so testers see
  what's new. Only a stable tag requires the dated section.
- You decide when a build is worth testing; one build costs about 15–20 minutes of four runners.

Alternative, not chosen: **every push to `release/v*` builds a beta** on its own (`N` = the workflow's run number,
the workflow makes the tag). Nothing to type, but every small fix-up commit becomes a version and an update prompt
for the testers. It's easy to add later, by an extra trigger on the same jobs.

## 2. Pipeline changes (`release.yml`)

1. **`version` job:** tag placement check (above); for a beta, the "starts with" check plus the notes fallback.
2. **`build` job:** for a beta, set the full version before building (one step, `if` the tag has a dash).
3. **Tag URLs in `latest.json`:** after publishing, `scripts/preview.js feed` rewrites every `.platforms[].url` from
   `releases/latest/download/<file>` to `releases/download/<tag>/<file>`. The result goes only to the `preview`
   release; the stable `latest.json` stays untouched, so the stable update path doesn't change by a byte.
4. **A moving `preview` release:** one release with the tag `preview`, a pre-release (never latest), holding just
   `latest.json`. At the end of **every** release (stable and beta) the workflow replaces that file with this
   release's `latest-preview.json`, but only when this version is newer than the one in it. Then a late hotfix for an
   older version can't move preview apps backwards. Stable releases update it too, so preview apps also get the stable
   version.
   The app's preview address: `https://github.com/sbforge/daily-darts-drill/releases/download/preview/latest.json`.
   - Why not the GitHub API ("newest release, pre-releases included")? 60 requests an hour without a login, and
     more code in the app. A static file has neither problem.
5. The `check` job verifies `latest.json` before publishing (every platform, a signature, its package an asset of
   this release), so the rewritten file points at files that exist.

## 3. The app

### Developer mode

✅ A visible **"Developer" section** in Settings, right above "Erase all data", with a **"Developer mode"
checkbox**. Ticking it asks first, in a dialog in the style of "Erase all data": *only turn this on if you know what
you are doing; stored data is in danger when updating to versions that aren't released*, plus a note that backups
are restored by hand. The box only gets its tick after confirming. Unticking needs no question and also sets the
channel back to Stable.

With developer mode on, the section shows **Updates: Stable / Preview** (saved as `updates.channel`, next to
`updates.autoCheck`; default Stable). Developer mode itself is saved as `developer.enabled`.

While the channel is Preview, a small **"Preview"** label sits in the header, next to the version in Settings, and on
the About page. A screenshot or a bug report can then never be taken for a stable version. A beta shows its full
version (`0.9.7-beta.1`) anyway.

Not chosen: a hidden switch (tap the version 7 times): too easy to miss what it does, and the warning belongs in
front of the switch. A command-line flag or a marker file (awkward with an app bundle on macOS and Windows), a
separate developer build (defeats testing the real installed app).

### The update check

- ✅ **Stable stays as it is:** with the channel on Stable (every player), `checkForUpdate` runs the same JS `check()`
  against the address in `tauri.conf.json`, the same code as today.
- **Preview** goes through two small Rust commands, because only Rust can set the address
  (`app.updater_builder().endpoints(vec![preview_url]).build()?.check()`):
  - `preview_check()` → version, date, notes, or nothing; it keeps the found update in the app state.
  - `preview_install()` → downloads and installs that update, with progress events for the existing progress bar.
  Same signing key, same signature check, same backup before installing: no new risk.
- `updates.svelte.ts` picks the path by `updates.channel`; status, dialog, notes and progress bar are shared.
- **Skipped version per channel** (`updates.skippedVersion.preview`), so skipping a beta doesn't hide the stable
  version with the same number.

### Going back to stable

❓ Proposal: switching to Stable only stops future beta offers. The install stays on its beta until the next stable
version is newer (`0.9.7-beta.2 → 0.9.7`), which happens with the normal update. No downgrade: a beta may already
have changed the database (`docs/db-migrations-plan.md`), and an older version can't read that. If you really need to
go back: uninstall, install the stable version by hand, and restore the backup from before the update.

## 4. Cleaning up

Betas are throwaway: once `X.Y.Z` is stable, nobody needs `X.Y.Z-beta.N` any more.

- **Releases and tags, automatic:** a last job `cleanup` in `release.yml`, only for stable tags, after `publish`.
  It deletes every **pre-release** with a version up to `X.Y.Z` (`v1.3.0-beta.*`, and leftover older ones such as
  `v1.2.1-beta.*`), together with its tag. It never deletes stable releases, the `preview` release, or betas of a
  newer version (`v1.4.0-beta.1` stays). What's left in GitHub's release list is the stable versions, the betas
  being tested right now, and `preview`.
  - A preview app on a deleted beta is fine: the `preview` pointer already moved to the stable version, which is
    newer.
  - Local copies of deleted tags go with `git fetch --prune --prune-tags`.
- **Branches:**
  - Turn on GitHub's **"Automatically delete head branches"** (repo Settings → General). The `release/vX.Y.Z`
    branch then goes away when its PR is merged.
  - Feature and fix branches are merged into the release branch, not by a PR, so GitHub doesn't delete them. A
    small script `scripts/cleanup-branches.sh` lists every `feature/*`, `fix/*`, `docs/*` branch (local and on
    GitHub) that's fully merged into `main`, and deletes them after a yes. Nothing that isn't in `main` gets deleted.
    Run it after each stable release (a step in `docs/release-process.md`).

## 5. Hotfixes

✅ Hotfixes don't go through the preview channel. A fix for the released version (`1.2.1` while `1.3.0` is in
development) is tested **locally**, with `npm run tauri dev` or with installers from a manual run of `release.yml`
(no release is made), then released as stable straight away. It is merged forward into the newer release branch,
so the next beta and `1.3.0` include it.

Why: the preview channel only ever offers the newest version, and a beta may have changed the database, so an app
can't go back from `1.3.0-beta.N` to `1.2.1`. One version in the preview channel at a time, the newest.

## Decisions

- ✅ A beta is built from a tag (section 1), not on every push.
- ✅ Only `beta.N` for now; the pipeline treats any dash the same, so `rc` works later without changes.
- ✅ Developer mode is a visible checkbox with a warning dialog, not a hidden switch.

## Testing

- **Pipeline:** one beta tag on a release branch. Then check that the beta is a pre-release, `latest.json` on the
  `preview` release names the beta's tag, and `releases/latest` is still the stable version.
- **Stable unchanged:** an app on Stable sees no beta (manual check says "up to date").
- **Preview:** an installed stable build, switched to Preview, updates to `beta.1`; after a second tag to `beta.2`;
  after the stable tag to `X.Y.Z`.
- The checkbox, the dialog, the Developer section and the label can be tried with `tauri dev`.

## Order and size

One branch `feature/preview-channel`, two steps, each testable on its own:

1. **Pipeline (S–M):** `sync-version.js --set`, notes fallback, tag placement check, `latest-preview.json`, the
   `preview` release, the extra check, the `cleanup` job, `scripts/cleanup-branches.sh`. Test with a first beta: it
   changes nothing for players.
2. **App (M):** the two Rust commands, the channel in `updates.svelte.ts`, the Developer section, the label,
   translations (en, de). Test with a second beta.

Then add a "Pre-release" section to `docs/release-process.md`.
