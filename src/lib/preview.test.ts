import { describe, expect, it } from "vitest";
// @ts-expect-error a plain JS script, shared with the release workflow
import { compare, feedFor, stale } from "../../scripts/preview.js";

describe("preview channel helpers", () => {
  it("orders versions the way the updater does", () => {
    const order = ["0.9.6", "0.9.7-beta.1", "0.9.7-beta.2", "0.9.7-beta.10", "0.9.7-rc.1", "0.9.7", "0.10.0-beta.1", "1.0.0"];
    for (let i = 1; i < order.length; i++) expect(compare(order[i - 1], order[i]), `${order[i - 1]} < ${order[i]}`).toBeLessThan(0);
    expect(compare("v1.2.3", "1.2.3")).toBe(0);
  });

  it("points every URL at the tag's own release", () => {
    const latest = {
      version: "0.9.7-beta.1",
      platforms: {
        "darwin-aarch64": { signature: "s", url: "https://github.com/o/r/releases/latest/download/D_aarch64.app.tar.gz" },
        "windows-x86_64": { signature: "s", url: "https://github.com/o/r/releases/download/v0.9.6/D_0.9.7-beta.1_x64-setup.exe" },
      },
    };
    const feed = feedFor(latest, "v0.9.7-beta.1");
    expect(feed.platforms["darwin-aarch64"].url).toBe("https://github.com/o/r/releases/download/v0.9.7-beta.1/D_aarch64.app.tar.gz");
    expect(feed.platforms["windows-x86_64"].url).toBe("https://github.com/o/r/releases/download/v0.9.7-beta.1/D_0.9.7-beta.1_x64-setup.exe");
    expect(latest.platforms["darwin-aarch64"].url, "the input stays as it was").toContain("/latest/download/");
  });

  it("finds the betas a stable version makes obsolete, and nothing else", () => {
    const tags = ["v1.2.0", "v1.2.1-beta.1", "v1.3.0-beta.1", "v1.3.0-beta.2", "v1.3.0", "v1.4.0-beta.1", "preview", "v1.3.0-rc.1"];
    expect(stale(tags, "v1.3.0")).toEqual(["v1.2.1-beta.1", "v1.3.0-beta.1", "v1.3.0-beta.2", "v1.3.0-rc.1"]);
    expect(() => stale(tags, "v1.3.0-beta.1")).toThrow();
  });
});
