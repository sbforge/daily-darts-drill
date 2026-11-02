// Data shapes and defaults. Everything is persisted in SQLite, see db.ts.
import { GAMES, gameById, type Settings } from "./games";

export interface Config {
  host: string;
  port: number;
}

export interface RoutineItem {
  gameId: string;
  minutes: number;
  settings: Settings;
}

export interface Routine {
  id: string;
  name: string;
  items: RoutineItem[];
}

export const DEFAULT_CONFIG: Config = { host: "localhost", port: 3180 };

export function newItem(gameId: string): RoutineItem {
  const g = gameById(gameId);
  return { gameId: g.id, minutes: g.defaultMinutes, settings: { ...g.defaultSettings } };
}

export function newRoutine(name = "New routine"): Routine {
  return { id: crypto.randomUUID(), name, items: [] };
}

export function starterRoutine(): Routine {
  const r = newRoutine("Everyday session");
  r.items = GAMES.map((g) => newItem(g.id));
  return r;
}

/** Drops games that no longer exist and fills in settings added in newer versions. */
export function cleanItems(items: RoutineItem[]): RoutineItem[] {
  return items
    .filter((i) => GAMES.some((g) => g.id === i.gameId))
    .map((i) => ({
      ...i,
      settings: { ...gameById(i.gameId).defaultSettings, ...i.settings },
    }));
}
