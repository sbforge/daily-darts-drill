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
export const DEFAULT_PAUSE_SECONDS = 15;

export function newItem(gameId: string): RoutineItem {
  const g = gameById(gameId);
  return { gameId: g.id, minutes: g.noTimeCap ? 0 : g.defaultMinutes, settings: { ...g.defaultSettings } };
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

/** A game without a time cap counts with an estimate from the game (3 minutes per 501 leg, ...). */
export function itemMinutes(i: RoutineItem): number {
  const m = Number(i.minutes) || 0;
  return m > 0 ? m : (gameById(i.gameId).estimateMinutes?.(i.settings) ?? gameById(i.gameId).defaultMinutes);
}

/** True when the routine has a game without a time cap, so its length is an estimate. */
export const hasEstimate = (r: Routine) => r.items.some((i) => !(Number(i.minutes) > 0));

/** The longest a routine can take: every game's time cap plus the breaks between games. */
export function totalSeconds(r: Routine): number {
  const games = r.items.reduce((sum, i) => sum + itemMinutes(i) * 60, 0);
  return Math.round(games + Math.max(0, r.items.length - 1) * pauseSeconds(r));
}

/** Drops games that no longer exist and fills in settings added in newer versions. */
export function cleanItems(items: RoutineItem[]): RoutineItem[] {
  return items
    .filter((i) => GAMES.some((g) => g.id === i.gameId))
    .map((i) => {
      const g = gameById(i.gameId);
      const settings = { ...g.defaultSettings, ...i.settings };
      // Only a game that ends by itself can run without a time cap.
      // A game that is always played to the end never has one.
      const minutes = g.noTimeCap ? 0 : Number(i.minutes) > 0 || g.canEnd?.(settings) ? i.minutes : g.defaultMinutes;
      return { ...i, minutes, settings };
    });
}
