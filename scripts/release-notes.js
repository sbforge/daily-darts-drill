// The notes of one release, taken from CHANGELOG.md (Keep a Changelog format): everything under its
// "## [x.y.z] - date" heading up to the next "## " heading, without the heading itself.
//
//   node scripts/release-notes.js 1.0.0      prints the notes; fails when the section is missing or empty
//
// The release workflow puts this text into the GitHub draft release; the updater passes it on to the app.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The notes of `version` in a changelog text, or null when it has no such section or the section is empty. */
export function releaseNotes(changelog, version) {
  const lines = changelog.replace(/\r\n?/g, "\n").split("\n");
  const head = new RegExp(`^##\\s+\\[${escape(version.replace(/^v/, ""))}\\](\\s|$)`);
  const start = lines.findIndex((l) => head.test(l));
  if (start < 0) return null;
  let end = lines.findIndex((l, i) => i > start && /^##\s/.test(l));
  if (end < 0) end = lines.length;
  // The link list at the very end of the file belongs to no release.
  const slice = lines.slice(start + 1, end);
  const links = slice.findIndex((l) => /^\[[^\]]+\]:\s/.test(l));
  const body = links < 0 ? slice : slice.slice(0, links);
  const text = body.join("\n").trim();
  return text ? text + "\n" : null;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const version = process.argv[2];
  if (!version) {
    console.error("Usage: node scripts/release-notes.js <version>");
    process.exit(2);
  }
  const notes = releaseNotes(readFileSync(new URL("../CHANGELOG.md", import.meta.url), "utf8"), version);
  if (!notes) {
    console.error(`CHANGELOG.md has no notes for ${version}: add a "## [${version.replace(/^v/, "")}] - date" section.`);
    process.exit(1);
  }
  process.stdout.write(notes);
}
