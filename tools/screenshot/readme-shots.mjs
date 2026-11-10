// The screenshots for the README, taken from the database `readme.mjs generate` wrote. See readme.mjs.
import { join } from "node:path";

export async function shoot({ setup, TODAY, OUT_DB, SHOTS, startQuick, makePlayer }) {
  const version = process.env.D3_VERSION;
  const env = await setup({
    time: TODAY,
    dbFile: OUT_DB,
    waitReady: false,
    version,
    // No "D³ was updated" banner: the last run already was this version.
    seed: (db) => version && db.run("UPDATE settings SET value = $v WHERE key = 'app.lastRunVersion'", { $v: version }),
  });
  /** Scrolls the page's scrolling area, e.g. to show the figures under the Precision chart. */
  const scrollBy = (px) =>
    page.evaluate((px) => {
      const el = [...document.querySelectorAll("main, section, div")].find(
        (e) => e.scrollHeight > e.clientHeight + 20 && /auto|scroll/.test(getComputedStyle(e).overflowY),
      );
      (el ?? document.scrollingElement).scrollBy(0, px);
    }, px);
  const { page, board } = env;
  const shot = async (name) => {
    await page.waitForTimeout(700);
    await page.screenshot({ path: join(SHOTS, `${name}.png`) });
    console.log(`${name}.png`);
  };
  const tab = async (name) => {
    await page.locator("header nav button.tab", { hasText: name }).click();
    await page.waitForTimeout(900);
  };

  // The loading screen, halfway.
  await page.waitForSelector(".splash");
  await page.waitForTimeout(900);
  await page.screenshot({ path: join(SHOTS, "loading.png") });
  console.log("loading.png");
  await page.waitForSelector(".splash", { state: "detached", timeout: 20000 });

  // Picking a routine.
  await page.waitForTimeout(1500);
  await shot("training");

  // History, and the games of the latest session.
  await tab("History");
  await shot("history");
  await page.getByRole("button", { name: "Details" }).first().click();
  await shot("history-details");
  await page.keyboard.press("Escape");

  // Performance: the overall index and the index per game.
  await tab("Performance");
  await page.waitForTimeout(1500); // the chart draws in
  await shot("performance");
  await page.getByRole("tab", { name: "Game index" }).click();
  await page.waitForTimeout(1500);
  await shot("performance-game");

  // Precision: every field, then one double.
  // Scrolled down past the intro, so the figures under the chart show too.
  await tab("Precision");
  await scrollBy(330);
  await shot("precision");
  await page.locator("table button.link", { hasText: /^D16$/ }).first().click();
  await page.waitForTimeout(600);
  await scrollBy(-2000);
  await scrollBy(330);
  await shot("precision-field");

  // Settings, from the top (the scrolling area keeps its place between screens).
  await scrollBy(-5000);
  await page.locator("header button[aria-label]").filter({ has: page.locator("svg") }).nth(1).click();
  await page.waitForTimeout(300);
  await scrollBy(-5000);
  await shot("settings");

  // A quick game of Solo Leg: the dialog, a leg under way, a dart being corrected, and a game shot.
  await tab("Train");
  await page.getByRole("button", { name: "Quick game" }).click();
  await page.locator("dialog label.game", { hasText: "Solo Leg" }).click();
  await shot("quick-game");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);

  const player = makePlayer(page, board, {
    skill: { sigma: 0.07, bias: { x: -0.006, y: -0.01 } },
    rand: (await import("../preview/fake-board.mjs")).seeded(3),
    checkout: env.checkout,
    pace: 120,
  });
  await startQuick(page, "Solo Leg");
  await page.waitForSelector("section.stage", { timeout: 20000 });
  // Into the second leg: play visits until the leg counter says "Leg 2" and the rest is under 400.
  const leg = () => page.locator("section.stage .focus .cap").first().innerText().catch(() => "");
  const rest = async () => Number(await page.locator("section.stage .focus .big").first().innerText().catch(() => "0"));
  for (let i = 0; i < 80 && !((await leg()).includes("2") && (await rest()) < 400); i++) {
    await player.visit();
    if (await page.locator(".shot").count()) await page.waitForTimeout(400);
  }
  // Two darts of the next visit on the board.
  await player.dart();
  await player.dart();
  await shot("game");

  // Correcting the second dart: the fields next to it, and the miss ring on the board.
  await page.locator("button.dart-box.filled").nth(1).click();
  await page.waitForTimeout(500);
  await shot("correct");
  await page.locator("button.dart-box.filled").nth(1).click(); // closes the correction again
  board.takeout();
  await page.waitForTimeout(300);

  // Visits until a checkout: the Game shot lies over the board.
  for (let i = 0; i < 60; i++) {
    await player.visit(false);
    await page.waitForTimeout(300);
    if (await page.locator(".shot").count()) break;
    board.takeout();
    await page.waitForTimeout(150);
  }
  await shot("game-shot");

  await env.close();
}
