// Runs the D³ frontend in headless Chromium with a fake Tauri backend, for screenshots without the real app
// (e.g. in a cloud session with no access to a desktop). See "Screenshots without the app" in DEVELOPMENT.md.
//
// `invoke` is answered from Node: the SQL plugin by sql.js, with the real migrations from src-tauri/migrations, so
// db.ts runs unchanged; the app's own commands by DEFAULT_COMMANDS below (anything else resolves to null).
// Not covered: the Autodarts websocket (the status stays on "Connecting…") and WebKitGTK's own rendering.
import { createRequire } from "node:module";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { defaultCommands, sqlCommand } from "../preview/commands.js";

export const REPO = fileURLToPath(new URL("../..", import.meta.url));

// Playwright is not a dependency of the app: scripts/setup-dev.sh installs it next to its browser.
const PW_HOME = process.env.D3_PLAYWRIGHT ?? join(homedir(), ".local/d3-playwright");
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && existsSync(join(PW_HOME, "browsers")))
  process.env.PLAYWRIGHT_BROWSERS_PATH = join(PW_HOME, "browsers");

function load(name) {
  for (const base of [REPO, PW_HOME]) {
    try {
      return createRequire(join(base, "package.json"))(name);
    } catch {}
  }
  throw new Error(`${name} not found: run scripts/setup-dev.sh (or npm i ${name} in ${PW_HOME})`);
}
const { chromium } = load("playwright");
const initSqlJs = load("sql.js");

const DEFAULT_COMMANDS = defaultCommands(JSON.parse(readFileSync(join(REPO, "package.json"), "utf8")).version);

/** A database with every migration applied, or a copy of a saved SQLite file (e.g. a backup of real data). */
export async function openDb(file) {
  const SQL = await initSqlJs();
  if (file) return new SQL.Database(readFileSync(file));
  const db = new SQL.Database();
  const dir = join(REPO, "src-tauri/migrations");
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) db.exec(readFileSync(join(dir, f), "utf8"));
  return db;
}

/**
 * Opens the app at `url` and waits until the loading screen is gone. Returns { page, db, browser, unknown, close }.
 * opts: viewport, scale (deviceScaleFactor), lang ("en-US", "de-DE"), dbFile (start from a saved SQLite file),
 *       seed(db) (fill the fresh database), commands ({ name: (args) => result }), log (false: stay quiet),
 *       time (a Date the app's clock starts at), hosts ({ name: ip } for the browser's name lookup).
 */
export async function openApp(url, opts = {}) {
  const db = await openDb(opts.dbFile);
  if (opts.seed) await opts.seed(db);
  const commands = { ...DEFAULT_COMMANDS, ...opts.commands };
  const unknown = new Set();

  // `hosts`: { "autodarts.local": "127.0.0.1" }, so the app can show a realistic board address.
  const rules = Object.entries(opts.hosts ?? {}).map(([from, to]) => `MAP ${from} ${to}`);
  const browser = await chromium.launch({ args: rules.length ? [`--host-resolver-rules=${rules.join(",")}`] : [] });
  const page = await browser.newPage({
    viewport: opts.viewport ?? { width: 1280, height: 800 },
    deviceScaleFactor: opts.scale ?? 1,
    locale: opts.lang ?? "en-US",
  });
  if (opts.log !== false) {
    page.on("pageerror", (e) => console.error("[page error]", e.message));
    page.on("console", (m) => m.type() === "error" && console.error("[console]", m.text()));
  }

  await page.exposeFunction("__d3MockInvoke", (cmd, args) => {
    try {
      const sql = sqlCommand(db, cmd, args);
      if (sql !== undefined) return { ok: sql };
      if (cmd in commands) return { ok: commands[cmd](args) ?? null };
      unknown.add(cmd);
      return { ok: null };
    } catch (e) {
      return { err: String(e?.message ?? e) };
    }
  });

  await page.addInitScript(() => {
    let next = 1;
    const callbacks = {};
    window.__TAURI_INTERNALS__ = {
      metadata: { currentWindow: { label: "main" }, currentWebview: { windowLabel: "main", label: "main" } },
      plugins: { path: { sep: "/", delimiter: ":" } },
      callbacks,
      transformCallback(cb, once) {
        const id = next++;
        callbacks[id] = (data) => {
          if (once) delete callbacks[id];
          return cb && cb(data);
        };
        return id;
      },
      unregisterCallback(id) {
        delete callbacks[id];
      },
      runCallback(id, data) {
        callbacks[id]?.(data);
      },
      convertFileSrc: (p) => p,
      async invoke(cmd, args) {
        const r = await window.__d3MockInvoke(cmd, args ?? {});
        if ("err" in r) throw r.err;
        return r.ok;
      },
    };
  });

  // `time`: the app's clock starts there (Playwright's fake clock, moved on with page.clock.fastForward/setSystemTime).
  if (opts.time) await page.clock.install({ time: opts.time });
  await page.goto(url);
  // `waitReady: false` returns while the loading screen is still up.
  if (opts.waitReady !== false) await page.waitForSelector(".splash", { state: "detached", timeout: 20000 });
  return { page, db, browser, unknown, close: () => browser.close() };
}
