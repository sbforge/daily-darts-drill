import { num, t } from "../i18n/index.svelte";
import { opt, pct } from "./shared";
import type { GameDef, GameResult } from "./types";

const DARTS_PER_ATTEMPT = 9;
const STAGES = DARTS_PER_ATTEMPT / 3;

/** How far a checkout with the given dart (1-9) raises the next one. */
const step = (dart: number, fastForward: boolean) => (fastForward ? STAGES + 1 - Math.ceil(dart / 3) : 1);

export const oneTwentyOne: GameDef = {
  id: "121",
  name: "121",
  get blurb() {
    return t("121.blurb");
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
      kind: "select",
      options: [opt("on", () => t("121.fastForwardOn")), opt("off", () => t("121.fastForwardOff"))],
    },
    {
      key: "safehouse",
      get label() {
        return t("121.safehouse");
      },
      get info() {
        return t("121.safehouseInfo");
      },
      kind: "select",
      options: [opt("on", () => t("121.safehouseOn")), opt("off", () => t("121.safehouseOff"))],
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
    let target = start;
    let remaining = start;
    let slotBase = 0; // darts already used in this attempt (full turns)
    let checkouts = 0;
    let fails = 0;
    let best = 0;
    let safehouse = 0; // the highest checkout made with darts 1-3; a miss never drops below it
    let openUsed = 0; // darts of the turn still on the board that count in this attempt
    let noScore: GameResult["noScore"];

    turns.forEach((turn, ti) => {
      const open = ctx.open && ti === turns.length - 1;
      const turnStart = remaining;
      let ended: "none" | "bust" | "out" = "none";
      let outSlot = 0;
      let bustAt = 0;

      // A plain loop (not forEach) so TS sees the assignments to `ended`.
      for (let i = 0; i < turn.length; i++) {
        const d = turn[i];
        const rem = remaining - d.score;
        if (rem === 0 && (d.kind === "double" || d.kind === "bull")) {
          ended = "out";
          outSlot = slotBase + i + 1;
        } else if (rem <= 1) {
          // Past the rest, a rest of 1, or 0 without a double: no double can finish from there.
          ended = "bust";
          bustAt = i + 1;
          remaining = turnStart;
        } else {
          remaining = rem;
          continue;
        }
        break; // darts after a bust or checkout don't count
      }

      // A bust is no score: the rest goes back to the start of the turn, which ends right there.
      if (ended === "bust" && ti === turns.length - 1) noScore = { turn: ti, darts: bustAt };
      if (ended === "out") {
        checkouts++;
        best = Math.max(best, target);
        if (useSafehouse && outSlot <= 3) safehouse = Math.max(safehouse, target);
        target = Math.min(170, target + step(outSlot, fastForward));
        remaining = target;
        slotBase = 0;
      } else if (open && ended === "none") {
        openUsed = turn.length;
      } else {
        slotBase += 3; // a finished or busted turn uses all three darts, even if fewer were thrown
        if (slotBase >= DARTS_PER_ATTEMPT) {
          fails++;
          // A miss never drops below the starting checkout (nor the safehouse).
          target = Math.max(start, safehouse, target - 1);
          remaining = target;
          slotBase = 0;
        }
      }
    });

    const used = slotBase + openUsed;
    const dartsLeft = Math.max(0, DARTS_PER_ATTEMPT - used);
    const attempts = checkouts + fails;
    const rate = pct(checkouts, attempts);

    return {
      values: { highestCheckout: best, checkouts, fails, nextCheckout: target, successRate: rate },
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
      focus: { label: t("121.restOf", { n: target }), value: String(remaining) },
      // Grouped into turns of three darts.
      darts: { label: t("121.dartsLeftN", { n: dartsLeft }), total: DARTS_PER_ATTEMPT, used, group: 3 },
      noScore,
      done: false,
    };
  },
};
