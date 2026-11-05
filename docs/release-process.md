# Release process

How a version of D³ goes from single features to the download players get offered in the app. This is the flow used
for 0.9.4, 0.9.5 and 0.9.6. The technical details of the build (what `release.yml` checks, signing, `latest.json`) are
in [DEVELOPMENT.md](../DEVELOPMENT.md#releasing) and [release-plan.md](release-plan.md).

```
feature/a ──┐
feature/b ──┼──► release/vX.Y.Z ──(PR)──► main ──► tag vX.Y.Z ──► release.yml: draft → build → check → publish as latest
fix/c ──────┘     test all together
```

Pushing the tag is the last manual step: the workflow publishes on its own once every check passed.
Betas for testers come from the release branch on the way (section 2a); hotfixes take a shorter path (section 7).

## 1. One branch per feature

- Every feature or fix gets its own branch from `main`: `feature/<name>` for features, `fix/<name>` for bug fixes,
  `docs/<name>` for documentation only.
- A feature that needs another one is branched from that feature branch (stacked), and later merged in that order.
- Each branch carries its own `CHANGELOG.md` entry under `## [Unreleased]`, written for players (rules at the top of
  `CHANGELOG.md`).
- Guesses made without asking go into `docs/v1-assumptions.md`, so they can be checked when testing.
- Single feature branches stay around until the release is out: a feature that fails the test can be left out of the
  release branch without touching the others.

## 2. Collect everything in a release branch

The release branch is the pre-release: all features of the version together, tested on the real board before anything
reaches `main`.

```bash
git switch main && git pull
git switch -c release/v0.9.7
git merge --no-ff feature/a
git merge --no-ff feature/b
git merge --no-ff fix/c
```

- Merge in dependency order (stacked features last). On conflicts keep both sides; fix-up commits go on the release
  branch ("Fix the merge of …").
- Small changes found while testing are committed on the release branch directly.
- Build and test locally (`npm test`, `npm run tauri dev` or `npm run tauri build`), or start `release.yml` by hand on
  the release branch (Actions → Release → Run workflow): it builds every platform and keeps the installers as workflow
  artifacts for 7 days, without creating a release. Good for testers on Windows or Linux.

### Prepare the version on the release branch

Once the content is final:

1. **Changelog:** rename `## [Unreleased]` to `## [0.9.7] - YYYY-MM-DD`, add a new empty `## [Unreleased]` above it,
   start the section with one or two sentences on what the version is about. Check what will be published:

   ```bash
   npm run release-notes -- 0.9.7
   ```

2. **Version number**, without commit or tag (the tag is made later on `main`):

   ```bash
   npm version 0.9.7 --no-git-tag-version
   ```

   This sets `package.json` and, through the `version` script, `src-tauri/Cargo.toml` and `Cargo.lock`.
   `tauri.conf.json` reads the version from `package.json`.

3. Commit both (e.g. "Version 0.9.7: …") and push the branch:

   ```bash
   git push -u origin release/v0.9.7
   ```

## 2a. Betas for testers (optional)

To test a build of the release branch as an installed app, tag a beta on the release branch. No version bump is
needed for it: the tag carries the version, and the build sets it.

```bash
git switch release/v0.9.7
git tag -a v0.9.7-beta.1 -m "Version 0.9.7 beta 1"
git push origin v0.9.7-beta.1
```

- **Name:** `vX.Y.Z-beta.N` on `release/vX.Y.Z`, `N` counting from 1. The workflow refuses a beta tag that isn't on
  its release branch.
- **Notes:** a `## [0.9.7]` changelog section if there already is one, else `## [Unreleased]`. One of them must
  have entries.
- **What happens:** the same workflow as a stable release (section 4), but the release is a **pre-release**, never
  "latest". Players on the normal update never see it. Apps with **developer mode** on the **Preview** channel get it
  through the moving `preview` release (Settings → tap the version 7 times → Developer → Update channel).
- Next beta after more fixes: `v0.9.7-beta.2`, and so on. The final `v0.9.7` on `main` is newer than every beta, so
  preview apps move on to it with the normal update.

## 3. Merge into `main`

- Open a pull request `release/v0.9.7` → `main` (there is no `gh` CLI, so via the compare link):
  `https://github.com/sbforge/daily-darts-drill/compare/main...release/v0.9.7?expand=1`
- `ci.yml` runs on the PR: version check (`package.json` = `Cargo.toml`), `svelte-check`, tests, build, `cargo check`,
  `cargo test`, and `cargo audit` as its own job. Wait for green.
- Merge with a **merge commit** ("Merge pull request #NN from sbforge/release/v0.9.7"), not squash, so the feature
  history stays visible.

## 4. Tag → build → draft release

Tag the merge commit on `main`, not the release branch:

```bash
git switch main && git pull
git tag -a v0.9.7 -m "Version 0.9.7"
git push origin v0.9.7
```

Release tags are always **annotated** (`-a`): they record who tagged, when, and a message, and they are what
`git describe` and `git push --follow-tags` look for. Plain tags are only for private bookmarks.

The pushed `v*` tag starts `.github/workflows/release.yml`:

1. **Check the version:** the tag must match `package.json` and `Cargo.toml`, and `CHANGELOG.md` must have a section
   for the version. Otherwise nothing is built.
2. **Create the draft release** `D³ v0.9.7`, with the changelog section as the release text. A tag with a dash
   (`v1.1.0-beta.1`) becomes a pre-release.
3. **Build** Windows (setup `.exe`), macOS Apple Silicon and Intel (`.dmg`), Linux (`.AppImage`, `.deb`) into that
   draft, signed for the updater, plus `latest.json`. macOS also verifies its ad-hoc signature.
4. **Check the draft:** `latest.json` must list all four platforms (`darwin-aarch64`, `darwin-x86_64`,
   `windows-x86_64`, `linux-x86_64`), each with a signature, and each update package it points to must be an asset of
   this draft.
5. **Publish:** the checked draft is published and marked as the **latest release**. A pre-release tag (with a dash) is
   published as a pre-release and never marked latest.
6. **Move the preview channel:** the `preview` release gets this version's `latest.json` (with links into this
   release), if this version is newer than what it has. Only apps in developer mode read it.
7. **Clean up (stable only):** deletes the releases and tags of the betas this version makes obsolete
   (`v0.9.7-beta.*`, and older leftovers). Stable releases, `preview` and betas of a newer version stay.

Takes roughly 15–20 minutes.

### Why the draft first

The apps look for updates at `releases/latest/download/latest.json`. If the release were public while the four builds
upload one after another, an app could see the new version before its platform's package is there, or get a
`latest.json` that points to a missing file. As a draft the release is invisible; it goes public in one step, only when
it is complete. When anything fails, the release stays a draft and players keep getting the previous version.

### When the workflow fails

- **A build failed for a passing reason** (runner, network): re-run the failed jobs. A re-run reuses the same draft,
  then checks and publishes.
- **The fix needs a code change:** delete the draft and the tag (locally `git tag -d v0.9.7`, on GitHub
  `git push origin :refs/tags/v0.9.7`), fix it on a branch → PR → `main`, and tag again.

## 5. After publishing

The apps find the update at their next start or with the update button in the header. Install it once on one machine
and look over the release on GitHub. If something is wrong with it, publish a fixed version quickly: a release that
apps have already updated to can't be taken back (deleting it only makes the previous one "latest" again for apps that
haven't updated yet).

## 6. Afterwards

- Pull `main` locally; start the next version's branches from there.
- Delete the merged branches: `scripts/cleanup-branches.sh` lists every `feature/*`, `fix/*` and `docs/*` branch
  that's fully merged into `main` (here and on GitHub) and deletes them after a yes (`--dry-run` only lists). It
  also removes local copies of the beta tags the workflow deleted. The release branch goes by itself when GitHub's
  "Automatically delete head branches" is on (repo Settings → General).
- Ask the testers to update and collect their feedback for the next version's branches.

## 7. Hotfixes

A fix for the released version (`1.2.1` while `1.3.0` is in development) skips the betas. It is tested **locally**,
with `npm run tauri dev` or with installers from a manual run of `release.yml` (Actions → Release → Run workflow on
the branch: it builds every platform but makes no release). Then it goes the normal way, `fix/<name>` →
`release/v1.2.1` → `main` → tag `v1.2.1`. Afterwards, merge the fix into the newer release branch too, so the next
beta and `1.3.0` include it.

Why no beta: the preview channel only ever offers the newest version, so an app already on `1.3.0-beta.N` would
never be offered `1.2.1-beta.N`, and it can't go back anyway (a beta may have changed the database).

## Checklist

- [ ] Every feature in its own branch, each with its changelog entry
- [ ] `release/vX.Y.Z` from `main`, all branches merged, tested on the board
- [ ] Optional: betas `vX.Y.Z-beta.N` tagged on the release branch, tested on the preview channel
- [ ] Changelog section `## [X.Y.Z] - date`, new empty `[Unreleased]`
- [ ] `npm version X.Y.Z --no-git-tag-version`, committed, pushed
- [ ] PR → `main`, CI green, merged with a merge commit
- [ ] `git tag -a vX.Y.Z` on the merge commit, tag pushed
- [ ] `release.yml` green up to "Publish the release"
- [ ] Release is public and marked latest; the update installs on one machine
- [ ] `scripts/cleanup-branches.sh`
