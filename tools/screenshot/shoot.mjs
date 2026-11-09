// Screenshots of the main screens, with the fake backend from d3mock.mjs. Starts its own Vite dev server.
//
//   node tools/screenshot/shoot.mjs [out dir] [--lang de-DE] [--scale 2] [--db file.db]
//
// Writes <out dir>/<screen>.png (default out dir: screenshots/, which git ignores) and lists the commands the app
// called that the fake backend doesn't know, in case a screen looks empty because of one of them.
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { openApp, REPO } from "./d3mock.mjs";

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i < 0 ? undefined : args.splice(i, 2)[1];
};
const lang = flag("--lang") ?? "en-US";
const scale = Number(flag("--scale") ?? 1);
const dbFile = flag("--db");
const out = resolve(args[0] ?? join(REPO, "screenshots"));
mkdirSync(out, { recursive: true });

const { createServer } = createRequire(join(REPO, "package.json"))("vite");
const server = await createServer({ root: REPO, logLevel: "error", server: { port: 5199, strictPort: false } });
await server.listen();
const url = server.resolvedUrls.local[0];

try {
  const app = await openApp(url, { lang, scale, dbFile, log: false });
  const tabs = app.page.locator("header nav button.tab");
  const names = (await tabs.allInnerTexts()).map((s) => s.trim()).filter(Boolean);
  for (const [i, name] of names.entries()) {
    await tabs.nth(i).click();
    await app.page.waitForTimeout(600);
    const file = join(out, `${i + 1}-${name.toLowerCase().replace(/[^a-z0-9äöüß]+/g, "-")}.png`);
    await app.page.screenshot({ path: file });
    console.log(file);
  }
  if (app.unknown.size) console.log("commands answered with null:", [...app.unknown].join(", "));
  await app.close();
} finally {
  await server.close();
}
