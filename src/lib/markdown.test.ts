import { describe, expect, it } from "vitest";
import { parseMarkdown } from "./markdown";

describe("release notes markdown", () => {
  it("reads headings, bullets, bold, code and https links", () => {
    const b = parseMarkdown("## New\n\n- **Fast** start\n- see [docs](https://example.com/x) and `code`\n\nDone.");
    expect(b.map((x) => x.kind)).toEqual(["heading", "list", "paragraph"]);
    const list = b[1] as Extract<(typeof b)[number], { kind: "list" }>;
    expect(list.items[0][0]).toEqual({ text: "Fast", bold: true });
    expect(list.items[1].find((i) => i.href)).toEqual({ text: "docs", href: "https://example.com/x" });
    expect(list.items[1].find((i) => i.code)?.text).toBe("code");
  });
  it("never makes a link of anything but http(s)", () => {
    const b = parseMarkdown("[x](javascript:alert(1))");
    expect(JSON.stringify(b)).not.toContain("href");
  });
  it("keeps html as text", () => {
    const b = parseMarkdown("<img src=x onerror=alert(1)>");
    expect(b[0]).toMatchObject({ kind: "paragraph", inline: [{ text: "<img src=x onerror=alert(1)>" }] });
  });
});
