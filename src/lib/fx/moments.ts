// Which moments of a game play: what the game describes, plus a 180 and No Score for every game.
import type { Dart } from "../autodarts";
import { t } from "../i18n/index.svelte";
import type { GameResult, Moment } from "../games/types";

export const is180 = (turn: Dart[]) => turn.length === 3 && turn.every((d) => d.kind === "triple" && d.number === 20);

/**
 * One stamp per turn: the highest priority plays, the others count as played (`skip`).
 * A bust is never great, so No Score beats a 180 thrown past the rest.
 */
export function pickMoments(result: Pick<GameResult, "moments" | "noScore">, turns: Dart[][]): { play: Moment[]; skip: Moment[] } {
  const moments: Moment[] = [...(result.moments ?? [])];
  const bust = result.noScore;
  if (bust) moments.push({ key: `noscore:${bust.turn}`, turn: bust.turn, effect: "stamp", text: t("run.noScore"), tone: "bad", priority: 4 });
  turns.forEach((turn, i) => {
    if (is180(turn)) moments.push({ key: `180:${i}`, turn: i, effect: "stamp", text: "180", tone: "great", priority: 3 });
  });
  const top = new Map<number, Moment>();
  for (const m of moments) if ((m.priority ?? 0) > (top.get(m.turn)?.priority ?? -1)) top.set(m.turn, m);
  return { play: [...top.values()], skip: moments.filter((m) => top.get(m.turn) !== m) };
}
