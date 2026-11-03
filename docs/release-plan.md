# Release plan

Scope: everything between "the code is ready" and "players can download and update v1": the release workflow,
the Linux build, one version number, macOS ad-hoc signing, and the steps to cut a release.
Covers the v1 Musts "Release workflow fixed", "Linux build" and "Version number" (`docs/v1-scope.md`).
The updater side (keys, plugin, `latest.json` content, client flow) is in `docs/ota-updates-plan.md`.
Status: plan only, nothing is built yet.

Status legend: ✅ decided · ❓ needs a decision (my proposal next to it).

## Where we start from

- `.github/workflows/release.yml`, hand-made: runs when a release is **published** (or by hand), builds Windows
  (`.msi`), macOS Apple Silicon and Intel (`.dmg`, Intel cross-compiled on the Apple Silicon runner), then deletes and
  re-uploads `.msi`/`.dmg` on the release. No Linux, no signing, no `latest.json`.
- No CI on pull requests: nothing runs `npm run check` or a build before merging.
- Version `0.1.0` in `package.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`.
- The build already writes `sbom.json` (CycloneDX, `scripts/sbom.js`) into the frontend for the About page.
- Apple notarization: ✅ not for v1 (no paid account). Windows Authenticode: not for v1.

## 1. One version number

- `tauri.conf.json`: `"version": "../package.json"` (Tauri 2 reads the version from there), so `package.json` is the
  source for the app and the installers.
- `Cargo.toml` can't point anywhere. A small script `scripts/sync-version.js` writes the `package.json` version into
  `Cargo.toml` (and `Cargo.lock`'s own entry), run from npm's `version` hook: `npm version 1.0.0` bumps
  `package.json`, syncs `Cargo.toml`, commits and tags `v1.0.0` in one go.
- CI fails when the tag, `package.json` and `Cargo.toml` disagree.
- Versions are semantic (`1.0.0`, pre-releases `1.1.0-beta.1`), tags `v<version>`.

## 2. Release workflow with `tauri-action`

✅ Recommended in the OTA plan; this is what it looks like.

- **Trigger:** a pushed tag `v*` (from `npm version`), plus `workflow_dispatch` for test builds (artifacts only, no
  release).
- **Matrix** (one `tauri-apps/tauri-action` step per job):

  | Job | Runner | Target | Bundles |
  |---|---|---|---|
  | Windows | `windows-latest` | `x86_64-pc-windows-msvc` | `msi` (✅ MSI only, also for updates) |
  | macOS Apple Silicon | `macos-latest` | `aarch64-apple-darwin` | `app`, `dmg` |
  | macOS Intel | `macos-latest` | `x86_64-apple-darwin` | `app`, `dmg` |
  | Linux | `ubuntu-22.04` | `x86_64-unknown-linux-gnu` | `appimage`, `deb` |

- **Draft first:** `releaseDraft: true`, `tagName: v__VERSION__`, `releaseName: D³ v__VERSION__`. The action creates
  the draft release, uploads every installer, update package and `.sig`, and with `includeUpdaterJson: true` writes
  `latest.json`. Re-runs replace assets instead of failing.
- **Signing for the updater:** `TAURI_SIGNING_PRIVATE_KEY` and `..._PASSWORD` from the repo secrets as env;
  `createUpdaterArtifacts` is switched on **only here** (`args: --config '{"bundle":{"createUpdaterArtifacts":true}}'`),
  so local builds keep working without the key.
- **Publish:** by hand, after a quick check of the draft (step 6). Only then is it "latest" for the updater.
- Keeps the Rust cache (`Swatinem/rust-cache`) and Node cache of today's workflow.
- **Linux runner packages:** `libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf` (Tauri's list).
  `ubuntu-22.04`, not `latest`: an AppImage only runs on systems with the same or a newer glibc, so the older base
  reaches more distributions.

## 3. Linux

- **AppImage** is the main download and the one that updates itself. It has to sit somewhere the player can write to
  (e.g. `~/Applications`), else the update can't replace it; the README says so.
- **`.deb`** as a second download for Debian/Ubuntu players who want a normal install; it updates only by hand
  (download the next `.deb`). ❓ Keep it? Proposal: yes, it costs nothing in CI.
- The mDNS discovery and the SQLite plugin work on Linux as they are; the data folder is
  `~/.config/dev.darttrainer.app/` (already in the README).
- Test once on a real Ubuntu (or a VM): start, discovery, a game, an update from the AppImage.

## 4. macOS ad-hoc signing

- `bundle.macOS.signingIdentity: "-"` ad-hoc signs the whole `.app` (free, no Apple account). Without a complete
  signature, Apple Silicon Macs may call a downloaded app "damaged" with no way to open it; ad-hoc signed, macOS
  shows "can't be verified" and offers **System Settings → Privacy & Security → Open Anyway**.
- CI step after the build: `codesign --verify --deep --strict` on the `.app`, so a broken signature fails the build.
- The README's macOS steps describe the Sequoia way (Open Anyway); `xattr -dr com.apple.quarantine …` stays as the
  fallback.

## 5. SBOM

✅ No separate release asset: the build already packs `sbom.json` (CycloneDX, Rust + npm) into the app, and the About
page shows it. One file for every platform, as today.

## 6. CI on pull requests (new `ci.yml`)

On every pull request and push to `main`, on `ubuntu-22.04`:
`npm ci` → `npm run check` → `npm test` (`docs/testing-plan.md`) → `npm run build` → `cargo check` in `src-tauri`
(with the Linux packages above). Fast (a few minutes with caches), catches broken builds before a release does.

## 7. Cutting a release (maintainer checklist)

1. `main` is green; TODO/CHANGELOG notes ready.
2. `npm version 1.0.0` (bumps, syncs `Cargo.toml`, commits, tags), `git push --follow-tags`.
3. The workflow builds and fills the **draft** release (≈15–20 min).
4. Check the draft: every platform's installer is there, `latest.json` lists `darwin-aarch64`, `darwin-x86_64`,
   `windows-x86_64`, `linux-x86_64`; install one build; write the release notes (they become the update notes in the
   app).
5. Publish. From now on installed apps see the update.
6. For a test first: tag `v1.0.1-beta.1`, publish as **pre-release**: `/releases/latest` ignores it, so no player is
   offered it, but it can be downloaded by hand.

## Order

1. Version source + `sync-version.js` + `ci.yml`. (S)
2. `release.yml` on `tauri-action` with the four jobs, draft releases, ad-hoc signing; a test run by
   hand. (M) Updater signing and `latest.json` switch on in the same file once the keys exist (OTA plan step 1).
3. Linux test on a real machine. (S)
