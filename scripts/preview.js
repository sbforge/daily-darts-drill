// The preview channel's helpers for the release workflow (docs/preview-channel-plan.md).
//
//   node scripts/preview.js feed <latest.json> <tag> [current.json]
//       Prints the latest.json for the moving `preview` release: the same file with every URL naming this
//       release's tag (releases/download/<tag>/…) instead of releases/latest/download/…, which would point a beta's
//       app at the stable release's files. Exits with 3, printing nothing, when the version in current.json
//       (the preview release's file now) is the same or newer: the preview channel never goes backwards.
//
//   node scripts/preview.js stale <stable tag>
//       Reads tag names on stdin and prints those of pre-releases the stable tag makes obsolete: every v*-* tag
//       whose version is at most the stable one. Stable tags and other names (like `preview`) are never printed.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SEMVER = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

/** Parses "1.2.3" or "v1.2.3-beta.4"; null for anything else. */
export function parse(v) {
  const m = SEMVER.exec(v.trim());
  if (!m) return null;
  return { core: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4] ? m[4].split(".") : [] };
}

/** Semantic version order: <0 when a is older, 0 when equal, >0 when newer. A pre-release is older than its version. */
export function compare(a, b) {
  const x = parse(a);
  const y = parse(b);
  if (!x || !y) throw new Error(`not a version: ${!x ? a : b}`);
  for (let i = 0; i < 3; i++) if (x.core[i] !== y.core[i]) return x.core[i] - y.core[i];
  if (!x.pre.length || !y.pre.length) return y.pre.length - x.pre.length;
  for (let i = 0; i < Math.min(x.pre.length, y.pre.length); i++) {
    const [p, q] = [x.pre[i], y.pre[i]];
    if (p === q) continue;
    const [pn, qn] = [/^\d+$/.test(p), /^\d+$/.test(q)];
    if (pn && qn) return Number(p) - Number(q);
    if (pn !== qn) return pn ? -1 : 1;
    return p < q ? -1 : 1;
  }
  return x.pre.length - y.pre.length;
}

/** latest.json with every platform URL pointing into `tag`'s own release. */
export function feedFor(latest, tag) {
  const out = structuredClone(latest);
  for (const p of Object.values(out.platforms ?? {})) {
    const file = p.url.split("/").pop();
    p.url = p.url.replace(/\/releases\/(latest\/download|download\/[^/]+)\/[^/]+$/, `/releases/download/${tag}/${file}`);
  }
  return out;
}

/** The pre-release tags a stable `tag` makes obsolete. */
export function stale(tags, stable) {
  if (parse(stable)?.pre.length !== 0) throw new Error(`not a stable version: ${stable}`);
  return tags.filter((t) => t.startsWith("v") && parse(t)?.pre.length && compare(t, stable) <= 0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [cmd, ...args] = process.argv.slice(2);
  if (cmd === "feed" && args.length >= 2) {
    const latest = JSON.parse(readFileSync(args[0], "utf8"));
    if (args[2]) {
      const current = JSON.parse(readFileSync(args[2], "utf8"));
      if (current.version && compare(latest.version, current.version) <= 0) {
        console.error(`preview already has ${current.version}, not older than ${latest.version}: left as it is`);
        process.exit(3);
      }
    }
    process.stdout.write(JSON.stringify(feedFor(latest, args[1]), null, 2) + "\n");
  } else if (cmd === "stale" && args.length === 1) {
    const tags = readFileSync(0, "utf8").split(/\s+/).filter(Boolean);
    for (const t of stale(tags, args[0])) console.log(t);
  } else {
    console.error("Usage: node scripts/preview.js feed <latest.json> <tag> [current.json] | stale <stable tag>");
    process.exit(2);
  }
}
