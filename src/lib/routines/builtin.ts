// The routines D³ ships with. They are normal routines from the moment they are added (edit, reorder, delete),
// defined in code because their names are in the player's language and the games' settings live in TypeScript.
import { t, type Key } from "../i18n/index.svelte";
import { newItem, type Routine, type RoutineItem } from "../store";
import type { Settings } from "../games";

export const BUILTIN_PAUSE_SECONDS = 15;

const item = (gameId: string, minutes: number, settings: Settings = {}): RoutineItem => {
  const base = newItem(gameId);
  return { ...base, minutes, settings: { ...base.settings, ...settings } };
};

interface Builtin {
  /** Fixed, so a restore finds the routine again. */
  id: string;
  name: Key;
  description: Key;
  items: () => RoutineItem[];
}

export const BUILTIN_ROUTINES: Builtin[] = [
  {
    id: "builtin-everyday-drill",
    name: "builtin.everyday.name",
    description: "builtin.everyday.description",
    items: () => [
      item("warm-up", 5),
      item("around-the-clock", 10, { direction: "cw", zone: "outerSingle", finish: "anyBull" }),
      item("simple-doubles", 5, { double: 20 }),
      item("simple-doubles", 5, { double: 16 }),
      item("simple-doubles", 5, { double: 18 }),
      item("complex-doubles", 5, { double: 20 }),
      item("complex-doubles", 5, { double: 16 }),
      item("complex-doubles", 5, { double: 18 }),
      item("scoring", 10),
      item("121", 10, { start: 121, safehouse: "on", fastForward: "on" }),
      // No time cap: four legs, then the routine is over.
      item("solo-leg", 0, { start: 501, legs: 4 }),
    ],
  },
  {
    id: "builtin-intense-doubles",
    name: "builtin.doubles.name",
    description: "builtin.doubles.description",
    items: () => [
      item("warm-up", 5),
      item("bull-x", 10, { variant: "doubles", bullseyeOnly: "off" }),
      item("simple-doubles", 5, { double: 20 }),
      item("simple-doubles", 5, { double: 16 }),
      item("complex-doubles", 5, { double: 20 }),
      item("complex-doubles", 5, { double: 16 }),
      // No time cap: one round over all 21 targets, the score may go below zero.
      item("bobs-27", 0, { playOn: "on" }),
    ],
  },
];

/** A built-in routine as it is added: named in the language that is active now, with a 15 second break. */
export function makeBuiltin(b: Builtin, name = t(b.name)): Routine {
  return { id: b.id, name, description: t(b.description), pauseSeconds: BUILTIN_PAUSE_SECONDS, items: b.items() };
}

const sameItems = (a: RoutineItem[], b: RoutineItem[]) => JSON.stringify(a) === JSON.stringify(b);

/**
 * What "Restore built-in routines" adds: a missing routine comes back as it was; one that is there but changed
 * stays as it is and the original is added as a copy ("… (original)"), once. The player's edits are never overwritten.
 */
export function missingBuiltins(routines: Routine[]): Routine[] {
  const out: Routine[] = [];
  for (const b of BUILTIN_ROUTINES) {
    const have = routines.find((r) => r.id === b.id);
    if (!have) out.push(makeBuiltin(b));
    else if (!sameItems(have.items, b.items())) {
      const name = `${t(b.name)} ${t("builtin.originalSuffix")}`;
      if (!routines.some((r) => r.name === name)) out.push({ ...makeBuiltin(b, name), id: crypto.randomUUID() });
    }
  }
  return out;
}
