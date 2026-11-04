import { num, t } from "../i18n/index.svelte";
import { routeFocus } from "./route-focus";
import { legsField } from "./solo-leg";
import { great, opt } from "./shared";
import type { GameDef, Moment } from "./types";
import { average, playLegs } from "./x01";

const START = 170;
const GIVE_UP = [0, 9, 12, 15];

export const bigFish: GameDef = {
  id: "big-fish",
  get name() {
    return t("fish.name");
  },
  get blurb() {
    return t("fish.blurb");
  },
  get classic() {
    return t("fish.classic");
  },
  get goal() {
    return t("fish.goal");
  },
  needsDarts: true,
  hasResult: true,
  defaultMinutes: 5,
  defaultSettings: { legs: 0, giveUp: 0 },
  fields: [
    legsField("legs"),
    {
      key: "giveUp",
      get label() {
        return t("fish.giveUp");
      },
      get info() {
        return t("fish.giveUpInfo");
      },
      kind: "select",
      options: GIVE_UP.map((n) => opt(n, () => (n ? t("fish.giveUpAfter", { n }) : t("fish.giveUpOff")))),
    },
  ],
  describe: (s) => (Number(s.legs) > 0 ? t("fish.describeLegs", { legs: s.legs }) : t("fish.describe")),
  summary: (v) => t("fish.summary", { legs: v.checkouts, darts: num(v.dartsPerLeg, 1), best: v.bestLeg || t("game.none") }),
  compute(turns, s, ctx) {
    const legsGoal = Math.max(0, Math.min(9, Number(s.legs) || 0));
    const giveUp = GIVE_UP.includes(Number(s.giveUp)) ? Number(s.giveUp) : 0;
    const x = playLegs(turns, ctx.open, { start: START, legs: legsGoal, giveUpAfter: giveUp });
    const won = x.legs.filter((l) => l.ok);
    const darts = x.legs.reduce((n, l) => n + l.darts, 0);
    const dartsPerLeg = x.legs.length ? darts / x.legs.length : 0;
    const bestLeg = won.length ? Math.min(...won.map((l) => l.darts)) : 0;
    const bigFish = won.filter((l) => l.darts === 3).length;
    const avg = average(x.points, x.darts);
    const route = routeFocus(x.rest, s);

    const moments: Moment[] = [];
    for (const l of won) {
      // The 170 in three darts is a 180 of its own: it goes above one.
      if (l.darts === 3) moments.push({ ...great(l.turn, t("fish.great")), priority: 3.5 });
      else if (l.darts <= 6) moments.push(great(l.turn, t("fish.quick")));
    }

    return {
      values: { legs: x.legs.length, checkouts: won.length, darts, dartsPerLeg, bestLeg, bigFish, average: avg },
      lines: [
        { key: "dartsPerLeg", label: t("solo.dartsPerLeg"), value: x.legs.length ? num(dartsPerLeg, 1) : t("game.noneYet"), hero: true },
        { key: "legs", label: t("solo.legs"), value: legsGoal ? t("game.xOfY", { n: x.legs.length, total: legsGoal }) : String(x.legs.length) },
        { key: "bestLeg", label: t("solo.bestLeg"), value: bestLeg ? String(bestLeg) : t("game.noneYet") },
        { key: "bigFish", label: t("fish.bigFish"), value: String(bigFish) },
        { key: "average", label: t("solo.average"), value: x.darts ? num(avg, 1) : t("game.noneYet") },
      ],
      focus: x.over
        ? { label: t("atc.complete"), value: t("game.xOfY", { n: legsGoal, total: legsGoal }) }
        : { label: t(legsGoal ? "solo.legOf" : "solo.leg", { n: x.legs.length + 1, total: legsGoal }), value: String(x.rest), hint: route.hint },
      targets: x.over ? [] : route.targets,
      noScore: x.noScore,
      moments,
      done: x.over,
    };
  },
};
