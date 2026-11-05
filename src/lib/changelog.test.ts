import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import pkg from "../../package.json";
// @ts-expect-error a plain JS script, shared with the release workflow
import { notesFor, releaseNotes } from "../../scripts/release-notes.js";

const log = readFileSync(new URL("../../CHANGELOG.md", import.meta.url), "utf8");

describe("release notes from the changelog", () => {
  it("takes one release, without its heading or the next release", () => {
    const n = releaseNotes("# Log\n\n## [Unreleased]\n\n## [1.1.0] - 2026-01-02\n\n### Added\n- B\n\n## [1.0.0] - 2026-01-01\n\n### Added\n- A\n", "1.1.0");
    expect(n).toBe("### Added\n- B\n");
  });
  it("accepts a version with a leading v and a pre-release tag", () => {
    expect(releaseNotes("## [1.0.0-beta.1] - 2026-01-01\n- x\n", "v1.0.0-beta.1")).toBe("- x\n");
  });
  it("finds nothing for a missing or an empty section", () => {
    expect(releaseNotes("## [1.0.0] - x\n- a\n", "2.0.0")).toBeNull();
    expect(releaseNotes("## [Unreleased]\n\n## [1.0.0] - x\n- a\n", "Unreleased")).toBeNull();
  });
  it("leaves the link list at the end of the file out of the last release", () => {
    const n = releaseNotes("## [1.0.0] - x\n- a\n\n[1.0.0]: https://example.com\n", "1.0.0");
    expect(n).toBe("- a\n");
  });
  it("a beta takes its own section, else its version's, else Unreleased", () => {
    const c = "## [Unreleased]\n- next\n\n## [1.1.0-beta.1] - x\n- own\n\n## [1.0.0] - x\n- stable\n";
    expect(notesFor(c, "v1.1.0-beta.1")).toBe("- own\n");
    expect(notesFor(c, "v1.0.0-beta.3")).toBe("- stable\n");
    expect(notesFor(c, "v1.2.0-beta.1")).toBe("- next\n");
    expect(notesFor(c, "v1.2.0"), "a stable version needs its own section").toBeNull();
  });
  it("the changelog has notes for the version in package.json", () => {
    expect(notesFor(log, pkg.version), `CHANGELOG.md needs a section for ${pkg.version}`).toBeTruthy();
  });
});
