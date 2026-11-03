import { num, t } from "../i18n/index.svelte";
import { pct } from "./shared";
import type { GameDef } from "./types";

const DARTS_PER_ATTEMPT = 9;

export const oneTwentyOne: GameDef = {
  id: "121",
  name: "121",
  get blurb() {
    return t("121.blurb");
  },
  needsDarts: true,
  hasResult: true,
  defaultMinutes: 10,
  defaultSettings: { start: 121 },
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
  ],
  describe: (s) => t("121.describe", { n: s.start }),
  summary: (v) =>
    t("121.summary", { best: v.highestCheckout || t("game.none"), checkouts: v.checkouts, fails: v.fails }),
  compute(turns, s, ctx) {
    const start = Math.min(170, Math.max(2, Number(s.start) || 121));
    let target = start;
    let remaining = start;
    let slotBase = 0; // darts already used in this attempt (full turns)
    let checkouts = 0;
    let fails = 0;
    let best = 0;

    turns.forEach((turn, ti) => {
      const open = ctx.open && ti === turns.length - 1;
      const turnStart = remaining;
      let ended: "none" | "bust" | "out" = "none";
      let outSlot = 0;

      // A plain loop (not forEach) so TS sees the assignments to `ended`.
      for (let i = 0; i < turn.length; i++) {
        const d = turn[i];
        const rem = remaining - d.score;
        if (rem === 0 && (d.kind === "double" || d.kind === "bull")) {
          ended = "out";
          outSlot = slotBase + i + 1;
        } else if (rem <= 1) {
          ended = "bust";
          remaining = turnStart;
        } else {
          remaining = rem;
          continue;
        }
        break; // darts after a bust or checkout don't count
      }

      if (ended === "out") {
        checkouts++;
        best = Math.max(best, target);
        target = Math.min(170, target + (outSlot <= 3 ? 3 : outSlot <= 6 ? 2 : 1));
        remaining = target;
        slotBase = 0;
      } else if (!open) {
        slotBase += 3; // a finished turn uses all three darts, even if fewer were thrown
        if (slotBase >= DARTS_PER_ATTEMPT) {
          fails++;
          target = Math.max(2, target - 1);
          remaining = target;
          slotBase = 0;
        }
      }
    });

    const lastOpen = ctx.open && turns.length ? turns[turns.length - 1].length : 0;
    const dartsLeft = Math.max(0, DARTS_PER_ATTEMPT - slotBase - lastOpen);
    const attempts = checkouts + fails;
    const rate = pct(checkouts, attempts);

    return {
      values: { highestCheckout: best, checkouts, fails, nextCheckout: target, successRate: rate },
      lines: [
        { key: "remaining", label: t("121.remaining"), value: String(remaining) },
        { key: "dartsLeft", label: t("121.dartsLeft"), value: String(dartsLeft) },
        { key: "checkouts", label: t("121.checkouts"), value: String(checkouts) },
        { key: "fails", label: t("121.fails"), value: String(fails) },
        { key: "best", label: t("121.best"), value: best ? String(best) : t("game.noneYet") },
        { key: "rate", label: t("game.successRate"), value: attempts ? `${num(rate)}%` : t("game.noneYet") },
      ],
      focus: { label: t("121.checkout"), value: String(target) },
      done: false,
    };
  },
};
