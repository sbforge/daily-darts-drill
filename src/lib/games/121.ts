import { num, t } from "../i18n/index.svelte";
import { playAttempts } from "./checkout";
import { routeFocus } from "./route-focus";
import { great, pct } from "./shared";
import type { GameDef, Moment } from "./types";

const DARTS_PER_ATTEMPT = 9;
const STAGES = DARTS_PER_ATTEMPT / 3;

/** How far a checkout with the given dart (1-9) raises the next one. */
const step = (dart: number, fastForward: boolean) => (fastForward ? STAGES + 1 - Math.ceil(dart / 3) : 1);

export const oneTwentyOne: GameDef = {
  id: "121",
  get name() {
    return t("121.name");
  },
  get blurb() {
    return t("121.blurb");
  },
  get classic() {
    return t("121.classic");
  },
  get goal() {
    return t("121.goal");
  },
  needsDarts: true,
  hasResult: true,
  defaultMinutes: 10,
  // Fast-forward on and no safehouse is how 121 was played before both became settings.
  defaultSettings: { start: 121, fastForward: "on", safehouse: "off" },
  fields: [
    {
      key: "start",
      get label() {
        return t("121.start");
      },
      get info() {
        return t("121.startInfo");
      },
      kind: "number",
      min: 2,
      max: 170,
    },
    {
      key: "fastForward",
      get label() {
        return t("121.fastForward");
      },
      get info() {
        return t("121.fastForwardInfo");
      },
      kind: "checkbox",
    },
    {
      key: "safehouse",
      get label() {
        return t("121.safehouse");
      },
      get info() {
        return t("121.safehouseInfo");
      },
      kind: "checkbox",
    },
  ],
  describe: (s) =>
    [
      t("121.describe", { n: s.start }),
      ...(s.fastForward !== "off" ? [t("121.fastForwardOn")] : []),
      ...(s.safehouse === "on" ? [t("121.safehouseOn")] : []),
    ].join(", "),
  summary: (v) =>
    t("121.summary", { best: v.highestCheckout || t("game.none"), checkouts: v.checkouts, fails: v.fails }),
  compute(turns, s, ctx) {
    const start = Math.min(170, Math.max(2, Number(s.start) || 121));
    // Results saved before these settings existed have neither key: they were played with fast-forward.
    const fastForward = s.fastForward !== "off";
    const useSafehouse = s.safehouse === "on";
    let safehouse = 0; // the highest checkout made with darts 1-3; a miss never drops below it

    const state = playAttempts(turns, ctx.open, {
      first: start,
      darts: DARTS_PER_ATTEMPT,
      next(a) {
        if (!a.ok) return Math.max(start, safehouse, a.target - 1); // a miss never drops below the start (nor the safehouse)
        if (useSafehouse && a.dart <= 3) safehouse = Math.max(safehouse, a.target);
        return Math.min(170, a.target + step(a.dart, fastForward));
      },
    });

    const checkouts = state.attempts.filter((a) => a.ok).length;
    const fails = state.attempts.length - checkouts;
    const best = Math.max(0, ...state.attempts.filter((a) => a.ok).map((a) => a.target));
    const moments: Moment[] = state.attempts.filter((a) => a.ok && a.dart <= 3).map((a) => great(a.turn, t("121.great")));
    const dartsLeft = Math.max(0, DARTS_PER_ATTEMPT - state.used);
    const attempts = checkouts + fails;
    const rate = pct(checkouts, attempts);
    const route = routeFocus(state.remaining, s);

    return {
      values: { highestCheckout: best, checkouts, fails, nextCheckout: state.target, successRate: rate },
      lines: [
        ...(useSafehouse
          ? [{ key: "safehouse", label: t("121.safehouse"), value: safehouse ? String(safehouse) : t("game.noneYet") }]
          : []),
        { key: "checkouts", label: t("121.checkouts"), value: String(checkouts) },
        { key: "fails", label: t("121.fails"), value: String(fails) },
        { key: "best", stored: "highestCheckout", label: t("121.best"), value: best ? String(best) : t("game.noneYet") },
        { key: "rate", stored: "successRate", label: t("game.successRate"), value: attempts ? `${num(rate)}%` : t("game.noneYet") },
      ],
      // The rest score is what to aim at right now; the checkout it belongs to is in the label.
      focus: { label: t("121.restOf", { n: state.target }), value: String(state.remaining), hint: route.hint },
      targets: route.targets,
      // Grouped into turns of three darts.
      darts: { label: t("121.dartsLeftN", { n: dartsLeft }), total: DARTS_PER_ATTEMPT, used: state.used, group: 3 },
      noScore: state.noScore,
      moments,
      done: false,
    };
  },
};
