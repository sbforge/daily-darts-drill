import { num, t } from "../i18n/index.svelte";
import { routeFocus, showRouteField } from "./route-focus";
import { great, opt, pct } from "./shared";
import type { GameDef, Moment } from "./types";
import { average, playLegs } from "./x01";

const STARTS = [301, 501, 701];

/** The "legs" setting: 0 plays until the time is up, 1-9 plays that many legs. */
export const legsField = (key: string) => ({
  key,
  get label() {
    return t("x01.legs");
  },
  get info() {
    return t("x01.legsInfo");
  },
  kind: "select" as const,
  options: [opt(0, () => t("x01.legsTime")), ...Array.from({ length: 9 }, (_, i) => opt(i + 1, () => String(i + 1)))],
});

/** A 501 leg in 15 darts or fewer is a "15-darter"; the other starts scale with it. */
export const niceLegDarts = (start: number) => Math.round((start / 501) * 15);

export const soloLeg: GameDef = {
  id: "solo-leg",
  get name() {
    return t("solo.name");
  },
  get blurb() {
    return t("solo.blurb");
  },
  get classic() {
    return t("solo.classic");
  },
  get goal() {
    return t("solo.goal");
  },
  needsDarts: true,
  hasResult: true,
  defaultMinutes: 10,
  defaultSettings: { start: 501, legs: 0, showRoute: "on" },
  fields: [
    {
      key: "start",
      get label() {
        return t("solo.start");
      },
      get info() {
        return t("solo.startInfo");
      },
      kind: "select",
      options: STARTS.map((n) => opt(n, () => String(n))),
    },
    legsField("legs"),
    showRouteField,
  ],
  canEnd: (s) => Number(s.legs) > 0,
  // About three minutes for a 501 leg.
  estimateMinutes: (s) => Math.max(1, Math.ceil((Number(s.legs) || 1) * 3 * (Number(s.start) || 501) / 501)),
  describe: (s) =>
    Number(s.legs) > 0 ? t("solo.describeLegs", { n: s.start, legs: s.legs }) : t("solo.describe", { n: s.start }),
  summary: (v) => t("solo.summary", { average: num(v.average, 1), legs: v.legs, darts: num(v.dartsPerLeg, 1) }),
  compute(turns, s, ctx) {
    const start = STARTS.includes(Number(s.start)) ? Number(s.start) : 501;
    const x = playLegs(turns, ctx.open, { start, legs: Math.max(0, Math.min(9, Number(s.legs) || 0)), giveUpAfter: 0 });
    const won = x.legs.filter((l) => l.ok);
    const avg = average(x.points, x.darts);
    const first9 = average(
      x.first9 + x.legs.reduce((n, l) => n + l.first9, 0),
      x.first9Darts + x.legs.reduce((n, l) => n + l.first9Darts, 0),
    );
    const dartsPerLeg = won.length ? won.reduce((n, l) => n + l.darts, 0) / won.length : 0;
    const bestLeg = won.length ? Math.min(...won.map((l) => l.darts)) : 0;
    const highest = Math.max(0, ...won.map((l) => l.checkout));
    // Checkout rate: legs checked out per dart thrown at a double.
    const checkoutRate = pct(won.length, x.dartsAtDouble);
    const route = routeFocus(x.rest, s);
    const nice = niceLegDarts(start);

    const moments: Moment[] = [];
    for (const l of won) {
      if (l.checkout >= 100) moments.push(great(l.turn, t("solo.tonOut")));
      else if (l.darts <= nice) moments.push(great(l.turn, t("solo.niceLeg", { n: nice })));
    }

    const legsGoal = Number(s.legs) > 0 ? Number(s.legs) : 0;
    return {
      values: {
        average: avg,
        first9,
        legs: won.length,
        dartsPerLeg,
        bestLeg,
        checkoutRate,
        highestCheckout: highest,
        tons: x.tons,
        ton40s: x.ton40s,
        oneEighties: x.oneEighties,
        darts: x.darts,
        dartsAtDouble: x.dartsAtDouble,
      },
      lines: [
        { key: "average", label: t("solo.average"), value: num(avg, 1), hero: true },
        { key: "first9", label: t("solo.first9"), value: x.darts ? num(first9, 1) : t("game.noneYet") },
        { key: "legs", label: t("solo.legs"), value: legsGoal ? t("game.xOfY", { n: won.length, total: legsGoal }) : String(won.length) },
        { key: "dartsPerLeg", label: t("solo.dartsPerLeg"), value: won.length ? num(dartsPerLeg, 1) : t("game.noneYet") },
        { key: "bestLeg", label: t("solo.bestLeg"), value: bestLeg ? String(bestLeg) : t("game.noneYet") },
        { key: "checkoutRate", label: t("solo.checkoutRate"), value: x.dartsAtDouble ? `${num(checkoutRate, 1)}%` : t("game.noneYet") },
        { key: "highestCheckout", label: t("121.best"), value: highest ? String(highest) : t("game.noneYet") },
        { key: "tons", label: t("solo.tons"), value: String(x.tons) },
        { key: "ton40s", label: t("solo.ton40s"), value: String(x.ton40s) },
        { key: "oneEighties", label: "180", value: String(x.oneEighties) },
      ],
      focus: x.over
        ? { label: t("atc.complete"), value: t("game.xOfY", { n: legsGoal, total: legsGoal }) }
        : {
            label: t(legsGoal ? "solo.legOf" : "solo.leg", { n: x.legs.length + 1, total: legsGoal }),
            value: String(x.rest),
            hint: route.hint,
          },
      targets: x.over ? [] : route.targets,
      noScore: x.noScore,
      moments,
      done: x.over,
    };
  },
};
