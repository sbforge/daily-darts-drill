import type { Dart } from "../autodarts";
import { num, t } from "../i18n/index.svelte";
import { doubleField, doubleOptions, great, pct } from "./shared";
import type { BoardField, GameDef, GameResult, Moment } from "./types";

interface Round {
  outcome: "success" | "fail" | "pending";
  at: number; // dart number that decided the round
  remaining: number;
  bust?: boolean; // went past the rest or left 1: no score
}

/**
 * One round is one turn. It is a three-dart checkout of 2 x the target double:
 * - dart 1 hits the target double: success
 * - otherwise the remaining score gets checked off; with an even remainder the
 *   next dart must hit the double of half of it
 * - with an odd remainder after dart 2 no double can finish, so the bull is the target
 * - going to 1 or below is a bust and the round is lost
 * Once a round succeeded, the rest of that turn is a free start-over and does not count.
 */
function evalRound(turn: Dart[], target: number): Round {
  let rem = 2 * target;
  for (let i = 0; i < Math.min(3, turn.length); i++) {
    const d = turn[i];
    const isDouble = (n: number) => d.kind === "double" && d.number === n;
    let hit = false;
    if (i === 0) hit = isDouble(target);
    else if (rem % 2 === 0 && rem >= 2 && rem <= 40) hit = isDouble(rem / 2);
    else if (i === 2 && rem % 2 === 1 && rem > 1) hit = d.kind === "bull";
    if (hit) return { outcome: "success", at: i + 1, remaining: 0 };
    rem -= d.score;
    if (rem <= 1) return { outcome: "fail", at: i + 1, remaining: rem, bust: true };
  }
  return { outcome: turn.length >= 3 ? "fail" : "pending", at: turn.length, remaining: rem };
}

export const complexDoubles: GameDef = {
  // Shown as "Plan B". The id keeps the working name: saved routines and results refer to it.
  id: "complex-doubles",
  get name() {
    return t("complexDoubles.name");
  },
  get blurb() {
    return t("complexDoubles.blurb");
  },
  get classic() {
    return t("complexDoubles.classic");
  },
  get goal() {
    return t("complexDoubles.goal");
  },
  needsDarts: true,
  hasResult: true,
  defaultMinutes: 5,
  defaultSettings: { double: 20 },
  fields: [
    {
      key: "double",
      get label() {
        return t("game.double");
      },
      get info() {
        return t("complexDoubles.doubleInfo");
      },
      kind: "select",
      options: doubleOptions.filter((o) => o.value !== 25),
    },
  ],
  describe: (s) => t("complexDoubles.describe", { n: s.double }),
  summary: (v) =>
    t("complexDoubles.summary", { rate: num(v.successRate, 1), successes: v.successes, rounds: v.rounds }),
  compute(turns, s, ctx) {
    const target = Number(s.double);
    let rounds = 0;
    let successes = 0;
    let noScore: GameResult["noScore"];
    const moments: Moment[] = [];
    const by = [0, 0, 0];

    turns.forEach((turn, ti) => {
      const open = ctx.open && ti === turns.length - 1;
      const r = evalRound(turn, target);
      if (r.bust && ti === turns.length - 1) noScore = { turn: ti, darts: r.at };
      if (r.outcome === "success") {
        rounds++;
        successes++;
        by[r.at - 1]++;
        if (r.at === 1) moments.push(great(ti, t("complexDoubles.great")));
      } else if (r.outcome === "fail" || !open) {
        rounds++; // a failed round, or a turn that ended early without success
      }
    });

    let focus = { label: t("game.target"), value: `D${target}` };
    // Setting up and a decided round have nothing in particular to aim at.
    let targets: BoardField[] = [doubleField(target)];
    if (ctx.open && turns.length) {
      const last = turns[turns.length - 1];
      const r = evalRound(last, target);
      const left = t("complexDoubles.remaining", { n: r.remaining });
      targets = [];
      if (r.outcome === "success") focus = { label: t("complexDoubles.thisRound"), value: t("complexDoubles.success") };
      else if (r.outcome === "fail") focus = { label: t("complexDoubles.thisRound"), value: t("complexDoubles.missed") };
      else if (r.remaining % 2 === 0 && r.remaining >= 2) {
        focus = { label: left, value: `D${r.remaining / 2}` };
        targets = [doubleField(r.remaining / 2)];
      } else if (last.length === 1) focus = { label: left, value: t("complexDoubles.setUp") };
      else {
        focus = { label: left, value: t("dart.bull") };
        targets = [{ bed: "bull" }];
      }
    }

    const rate = pct(successes, rounds);
    return {
      values: { successRate: rate, rounds, successes, firstDart: by[0], secondDart: by[1], thirdDart: by[2] },
      lines: [
        { key: "rate", stored: "successRate", label: t("game.successRate"), value: `${num(rate, 1)}%`, hero: true },
        { key: "rounds", label: t("complexDoubles.rounds"), value: String(rounds) },
        { key: "successes", label: t("complexDoubles.successes"), value: String(successes) },
      ],
      focus,
      targets,
      noScore,
      moments,
      done: false,
    };
  },
};
