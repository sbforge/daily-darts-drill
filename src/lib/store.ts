// Data shapes and defaults. Everything is persisted in SQLite, see db.ts.
import { GAMES, gameById, type Settings } from "./games";
import { t } from "./i18n/index.svelte";

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
  /** Short text shown on the routine card. */
  description: string;
  /** Break before each game after the first, in seconds. 0 goes straight on. */
  pauseSeconds: number;
  items: RoutineItem[];
}

export const DEFAULT_CONFIG: Config = { host: "localhost", port: 3180 };
export const DEFAULT_PAUSE_SECONDS = 60;

export function newItem(gameId: string): RoutineItem {
  const g = gameById(gameId);
  return { gameId: g.id, minutes: g.defaultMinutes, settings: { ...g.defaultSettings } };
}

/** Default names are filled in in the language selected when the routine is made. */
export function newRoutine(name = t("routines.new"), description = ""): Routine {
  return { id: crypto.randomUUID(), name, description, pauseSeconds: DEFAULT_PAUSE_SECONDS, items: [] };
}

export const MAX_PAUSE_SECONDS = 600;

/** The number field can be empty or out of range while it is being edited. */
export function pauseSeconds(r: Routine): number {
  const n = Math.round(Number(r.pauseSeconds));
  return Number.isFinite(n) ? Math.max(0, Math.min(MAX_PAUSE_SECONDS, n)) : 0;
}

/** The longest a routine can take: every game's time cap plus the breaks between games. */
export function totalSeconds(r: Routine): number {
  const games = r.items.reduce((sum, i) => sum + (Number(i.minutes) || 0) * 60, 0);
  return Math.round(games + Math.max(0, r.items.length - 1) * pauseSeconds(r));
}

export function starterRoutine(): Routine {
  const r = newRoutine(t("routines.starter"), t("routines.starterDescription"));
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
