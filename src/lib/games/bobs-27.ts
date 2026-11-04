import { num, t } from "../i18n/index.svelte";
import { doubleField, great, pct } from "./shared";
import type { GameDef, Moment } from "./types";
import type { Dart } from "../autodarts";

const START = 27;
/** D1-D20, then the bull. */
const TARGETS = 21;
const targetValue = (i: number) => (i === 20 ? 50 : 2 * (i + 1));
const targetLabel = (i: number) => (i === 20 ? t("dart.bull") : `D${i + 1}`);
const hitsTarget = (d: Dart, i: number) => (i === 20 ? d.kind === "bull" : d.kind === "double" && d.number === i + 1);

export const bobs27: GameDef = {
  id: "bobs-27",
  get name() {
    return t("bob.name");
  },
  get blurb() {
    return t("bob.blurb");
  },
  get classic() {
    return t("bob.name");
  },
  get goal() {
    return t("bob.goal");
  },
  needsDarts: true,
  hasResult: true,
  defaultMinutes: 10,
  defaultSettings: { playOn: "off" },
  fields: [
    {
      key: "playOn",
      get label() {
        return t("bob.playOn");
      },
      get info() {
        return t("bob.playOnInfo");
      },
      kind: "checkbox",
    },
  ],
  canEnd: () => true,
  estimateMinutes: (s) => (s.playOn === "on" ? 8 : 5),
  describe: (s) => (s.playOn === "on" ? t("bob.describePlayOn") : t("bob.describe")),
  summary: (v) => t("bob.summary", { score: v.score, reached: v.reached, rate: num(v.hitRate, 1) }),
  compute(turns, s, ctx) {
    const playOn = s.playOn === "on";
    let score = START;
    let idx = 0; // the target of the next turn
    let games = 0;
    let best = 0;
    let darts = 0;
    let hits = 0;
    let played = 0; // turns over all games
    let over = false;
    const moments: Moment[] = [];

    for (let ti = 0; ti < turns.length && !over; ti++) {
      const open = ctx.open && ti === turns.length - 1;
      const thrown = turns[ti].slice(0, 3);
      const h = thrown.filter((d) => hitsTarget(d, idx)).length;
      darts += thrown.length;
      hits += h;
      score += h * targetValue(idx);
      if (open) break; // the turn on the board: hits count, a miss isn't one until the darts are taken out
      if (!h) score -= targetValue(idx);
      if (thrown.length === 3 && h === 3) moments.push(great(ti, t("bob.great")));
      played++;
      idx++;

      const ended = idx >= TARGETS || (score <= 0 && !playOn);
      if (!ended) continue;
      games++;
      best = Math.max(best, score);
      if (score > START) moments.push(great(ti, t("bob.survived")));
      if (ctx.repeat) {
        score = START;
        idx = 0;
      } else over = true;
    }

    const reached = over ? Math.min(idx, TARGETS) : idx;
    const rate = pct(hits, darts);
    const shownScore = over || games ? score : score;
    const current = Math.min(idx, TARGETS - 1);
    return {
      values: { score: shownScore, reached, darts, hits, hitRate: rate, games, bestScore: Math.max(best, shownScore), targets: played },
      lines: [
        { key: "score", label: t("bob.score"), value: String(shownScore), hero: true },
        { key: "reached", label: t("bob.reached"), value: t("game.xOfY", { n: over ? Math.min(idx, TARGETS) : idx, total: TARGETS }) },
        { key: "rate", stored: "hitRate", label: t("bob.hitRate"), value: darts ? `${num(rate, 1)}%` : t("game.noneYet") },
        { key: "hits", label: t("game.hits"), value: String(hits) },
        ...(games > 0 && ctx.repeat ? [{ key: "games", label: t("bob.games"), value: String(games) }] : []),
      ],
      focus: over
        ? { label: t("atc.complete"), value: String(score) }
        : { label: t("bob.target", { score: score }), value: targetLabel(current) },
      targets: over ? [] : [doubleField(current === 20 ? 25 : current + 1)],
      moments,
      done: over,
    };
  },
};
