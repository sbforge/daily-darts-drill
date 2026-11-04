// A small Markdown reader for release notes: headings, bullet lists, paragraphs, **bold**, `code` and [links](https://…).
// It returns plain data and never HTML, so the text of a release can't inject anything into the page.

export type Inline = { text: string; bold?: boolean; code?: boolean; href?: string };
export type Block =
  | { kind: "heading"; level: 1 | 2 | 3; inline: Inline[] }
  | { kind: "list"; items: Inline[][] }
  | { kind: "paragraph"; inline: Inline[] };

const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^\s)]+\))/g;

export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  for (const part of src.split(INLINE)) {
    if (!part) continue;
    const link = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(part);
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) out.push({ text: part.slice(2, -2), bold: true });
    else if (part.startsWith("`") && part.endsWith("`") && part.length > 2) out.push({ text: part.slice(1, -1), code: true });
    else if (link) out.push({ text: link[1], href: link[2] });
    else out.push({ text: part });
  }
  return out;
}

export function parseMarkdown(src: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  let list: Inline[][] | null = null;
  const flush = () => {
    if (para.length) blocks.push({ kind: "paragraph", inline: parseInline(para.join(" ")) });
    if (list) blocks.push({ kind: "list", items: list });
    para = [];
    list = null;
  };
  for (const raw of src.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    const item = /^[-*+]\s+(.*)$/.exec(line);
    if (!line) flush();
    else if (heading) {
      flush();
      blocks.push({ kind: "heading", level: Math.min(3, heading[1].length) as 1 | 2 | 3, inline: parseInline(heading[2]) });
    } else if (item) {
      if (para.length) flush();
      (list ??= []).push(parseInline(item[1]));
    } else if (list && /^\s/.test(raw)) {
      // A wrapped line of the last bullet.
      list[list.length - 1].push(...parseInline(" " + line));
    } else {
      if (list) flush();
      para.push(line);
    }
  }
  flush();
  return blocks;
}
