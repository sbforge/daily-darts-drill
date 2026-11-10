// The README screenshots, made from a training history the simulated player builds through the app itself.
//
//   node tools/screenshot/readme.mjs generate   six weeks of training into screenshots/demo.db (a few minutes)
//   node tools/screenshot/readme.mjs shoot      the screenshots into docs/screenshots, from that database
//
// Both start a Vite dev server and the fake board (port 3180). The player aims at what the app highlights, finds its
// own checkouts, scatters around the aim and throws a little low and left, and gets better over the weeks; the clock
// is Playwright's, so a routine of 80 minutes plays in a minute and each session lands on its own day.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { seeded, startFakeBoard } from "../preview/fake-board.mjs";
import { openApp, REPO } from "./d3mock.mjs";
import { makePlayer, phaseOf } from "./player.mjs";

const OUT_DB = join(REPO, "screenshots/demo.db");
const SHOTS = join(REPO, "docs/screenshots");
/** The day the screenshots are taken; the history leads up to it. */
const TODAY = new Date("2026-11-10T19:30:00");
const VIEWPORT = { width: 1920, height: 1200 };
const HOST = "192.168.1.40";

const days = (n) => n * 86_400_000;

/** Six weeks up to the day before TODAY: what was played on which day, and at what time. */
function schedule() {
  const plan = [];
  const first = new Date(TODAY.getTime() - days(42));
  const rand = seeded(7);
  for (let d = 0; d < 42; d++) {
    const day = new Date(first.getTime() + days(d));
    const wd = day.getDay(); // 0 Sunday
    const at = (h) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, Math.floor(rand() * 50));
    if (wd === 1 || wd === 5) plan.push({ at: at(18), routine: "Everyday Drill" });
    if (wd === 3) plan.push({ at: at(19), routine: "Intense Doubles" });
    if (wd === 6) plan.push({ at: at(11), routine: d % 14 < 7 ? "Everyday Drill" : "Intense Doubles" });
    if (wd === 2 && d % 14 < 7) plan.push({ at: at(20), quick: "Solo Leg" });
    if (wd === 2 && d % 14 >= 7) plan.push({ at: at(20), quick: "JDC Challenge" });
    if (wd === 0 && d % 14 < 7) plan.push({ at: at(17), quick: "Bob's 27" });
  }
  // The last day before TODAY: a routine, so the carousel says "Yesterday".
  plan.push({ at: new Date(TODAY.getTime() - days(1) - 3_600_000), routine: "Everyday Drill" });
  return plan;
}

async function setup({ version, ...opts }) {
  const { createServer } = createRequire(join(REPO, "package.json"))("vite");
  const server = await createServer({
    root: REPO,
    logLevel: "error",
    server: { port: 5199, strictPort: false },
    // The version the screenshots show, e.g. the one about to be released (package.json is bumped only then).
    ...(version ? { define: { __APP_VERSION__: JSON.stringify(version) } } : {}),
  });
  await server.listen();
  const board = await startFakeBoard({ rand: seeded(1) });
  const app = await openApp(server.resolvedUrls.local[0], {
    viewport: VIEWPORT,
    hosts: { [HOST]: "127.0.0.1" },
    log: false,
    ...opts,
  });
  const { routeFor } = await server.ssrLoadModule("/src/lib/games/routes.ts");
  const { fieldCenter } = await server.ssrLoadModule("/src/lib/precision.ts");
  const close = async () => {
    await app.close();
    await board.close();
    await server.close();
  };
  return { app, board, page: app.page, checkout: { routeFor, fieldCenter }, close };
}

async function startRoutine(page, name) {
  const card = page.locator("[aria-roledescription=carousel] .card", { hasText: name }).first();
  // With two routines the arrow at the end is disabled, so go the other way there.
  for (let i = 0; i < 6 && (await card.getAttribute("aria-current")) !== "true"; i++) {
    const next = page.getByRole("button", { name: "Next routine" });
    await ((await next.isEnabled()) ? next : page.getByRole("button", { name: "Previous routine" })).click();
    await page.waitForTimeout(600);
  }
  await card.getByRole("button", { name: "Start routine" }).click();
}

async function startQuick(page, game) {
  await page.getByRole("button", { name: "Quick game" }).click();
  await page.locator("dialog label.game", { hasText: game }).click();
  await page.locator("dialog[open] button[type=submit]").click();
}

async function generate() {
  const plan = schedule();
  const env = await setup({
    time: plan[0].at,
    seed: (db) =>
      db.run(
        `INSERT INTO settings (key, value) VALUES ('autodarts_host', '${HOST}'), ('autodarts_port', '3180'), ('animations', 'off')`,
      ),
  });
  const { page, board } = env;
  await page.waitForTimeout(1500);
  const rand = seeded(42);
  const t0 = Date.now();
  for (const [i, s] of plan.entries()) {
    await page.clock.setSystemTime(s.at);
    // Better over the weeks: from about 18 mm scatter to 14 mm, a bit low and left, a little different every day.
    const f = i / (plan.length - 1);
    const sigma = 0.105 - 0.025 * f + (rand() - 0.5) * 0.012;
    const skill = { sigma, bias: { x: -0.012 + 0.004 * f, y: -0.02 + 0.006 * f } };
    const player = makePlayer(page, board, { skill, rand, checkout: env.checkout });
    if (s.routine) await startRoutine(page, s.routine);
    else await startQuick(page, s.quick);
    await player.playThrough({ dartsPerMinute: 9 });
    await page.getByRole("button", { name: "Done" }).click();
    await page.waitForTimeout(300);
    console.log(`${s.at.toISOString().slice(0, 16)} ${s.routine ?? s.quick} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  }
  await page.waitForTimeout(1000); // the last results are written
  await page.evaluate(() => window.__TAURI_INTERNALS__.invoke("plugin:sql|execute", { db: "", query: "UPDATE settings SET value = 'on' WHERE key = 'animations'", values: [] }));
  mkdirSync(join(REPO, "screenshots"), { recursive: true });
  writeFileSync(OUT_DB, env.app.db.export());
  console.log(`${plan.length} sessions written to ${OUT_DB}`);
  await env.close();
}

const cmd = process.argv[2];
if (cmd === "generate") await generate();
else if (cmd === "shoot") await (await import("./readme-shots.mjs")).shoot({ setup, TODAY, OUT_DB, SHOTS, startQuick, phaseOf, makePlayer, readFileSync });
else console.log("usage: node tools/screenshot/readme.mjs generate | shoot");
