// A simulated player for the fake board: plays routines and quick games through the app's own UI, so everything it
// leaves behind (history, DPI, precision) comes from the real code paths. Used by tools/screenshot/readme.mjs.
import { gauss } from "../preview/fake-board.mjs";

/** Treble 20, where a player aims when the game names no target. */
const T20 = { x: 0, y: 0.6055 };

/**
 * The centre of the first highlighted target on the board, in board units (+y up), or null when there is none.
 * The board's SVG uses board units with y down; the centre is taken from points along the field's outline.
 */
export function targetOf(page) {
  return page.evaluate(() => {
    const t = document.querySelector("path.target");
    if (!t) return null;
    const len = t.getTotalLength();
    let x = 0;
    let y = 0;
    const n = 48;
    for (let i = 0; i < n; i++) {
      const p = t.getPointAtLength((len * i) / n);
      x += p.x;
      y += p.y;
    }
    return { x: x / n, y: -y / n };
  });
}

/** What the screen shows: "pick", "countdown", "break", "ready", "running" or "summary". */
export function phaseOf(page) {
  return page.evaluate(() => {
    for (const [sel, name] of [
      ["section.stage", "running"],
      ["section.countdown", "countdown"],
      ["section.break", "break"],
      ["section.summary", "summary"],
      ["section.pick", "pick"],
      ["section.narrow", "ready"],
    ])
      if (document.querySelector(sel)) return name;
    return "other";
  });
}

/** Games where the rest counts down to a double: the player finds its own checkout there (the app shows no route). */
const CHECKOUT_GAMES = /Solo Leg|Big Fish|Checkout Ladder|Catch 40|Wild Card/;

const score = (raw) => raw.multiplier * (raw.segmentNumber ?? 0);

/**
 * skill: { sigma, bias: { x, y } } in board units (0.1 is 17 mm). rand: the random source of the scatter.
 * pace: ms between darts, so the app keeps up. checkout: { routeFor, fieldCenter } from src/lib (loaded through
 * Vite), for the checkout games.
 */
export function makePlayer(page, board, { skill, rand = Math.random, pace = 35, log, checkout }) {
  const progress = () => page.locator("section.stage .panel .progress").first().innerText().catch(() => "");
  const shownRest = async () => {
    const v = await page.locator("section.stage .focus .big").first().innerText().catch(() => "");
    return /^\d+$/.test(v.trim()) ? Number(v) : null;
  };

  /** One dart. `rest`: the rest before it in a checkout game, to aim at the first dart of the usual route. */
  async function dart(rest = null) {
    let aim = await targetOf(page);
    if (!aim && rest !== null && checkout) {
      const route = rest <= 170 ? checkout.routeFor(rest) : null;
      if (route) aim = checkout.fieldCenter(route[0].field);
    }
    aim ??= T20;
    const raw = board.throwAt(aim.x + skill.bias.x + gauss(rand) * skill.sigma, aim.y + skill.bias.y + gauss(rand) * skill.sigma);
    await page.waitForTimeout(pace);
    return raw;
  }

  /**
   * One visit: three darts, then the takeout (darts after a checkout or bust simply don't count).
   * takeout false leaves the darts in the board, e.g. to show the Game shot.
   */
  async function visit(takeout = true) {
    let rest = CHECKOUT_GAMES.test(await progress()) ? await shownRest() : null;
    for (let i = 0; i < 3; i++) {
      const raw = await dart(rest);
      if (rest !== null) {
        rest -= score(raw);
        if (rest <= 1) break; // checked out or bust: the turn is over
      }
    }
    if (!takeout) return;
    board.takeout();
    await page.waitForTimeout(pace);
  }

  /**
   * Plays what was started until the summary shows. A game with a time cap gets `dartsPerMinute` darts for each
   * minute, then its clock is moved to the end; one without plays until it ends by itself (at most `maxDarts`).
   */
  async function playThrough({ dartsPerMinute = 9, maxDarts = 600 } = {}) {
    for (let guard = 0; guard < 400; guard++) {
      const phase = await phaseOf(page);
      if (phase === "summary") return;
      if (phase === "countdown" || phase === "break") {
        await page.clock.fastForward(20_000);
        await page.waitForTimeout(80);
        continue;
      }
      if (phase !== "running") {
        await page.waitForTimeout(100);
        continue;
      }
      const game = await progress();
      // A capped game shows the time left ("9:58"), one without the time played, from "0:00".
      const clock = await page.locator("section.stage .clock").innerText();
      const timed = !clock.startsWith("0:0");
      const budget = timed ? Math.round(Math.ceil(Number(clock.split(":")[0]) + 0.1) * dartsPerMinute) : maxDarts;
      let thrown = 0;
      const started = Date.now();
      while (thrown < budget && (await phaseOf(page)) === "running" && (await progress()) === game) {
        await visit();
        thrown += 3;
        // A game without a time cap takes as long as its darts: about 25 seconds a visit.
        if (!timed) await page.clock.fastForward(25_000);
      }
      log?.(`${game}: ${thrown} darts, ${timed ? "time cap" : "to the end"}, ${((Date.now() - started) / 1000).toFixed(1)} s`);
      if (!timed && (await phaseOf(page)) === "running" && (await progress()) === game)
        throw new Error(`${game} didn't end after ${thrown} darts`);
      // Time is up for a capped game: move its clock to the end.
      while ((await phaseOf(page)) === "running" && (await progress()) === game) {
        await page.clock.fastForward(5 * 60_000);
        await page.waitForTimeout(80);
      }
    }
    throw new Error("the run didn't reach its summary");
  }

  return { dart, visit, playThrough };
}
