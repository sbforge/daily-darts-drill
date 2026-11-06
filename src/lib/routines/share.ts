// Routines as files, to pass on to other players: one routine per file, JSON. Only what the player made goes in
// (name, description, break, games with their settings), never an id or results.
import { cleanItems, MAX_PAUSE_SECONDS, type Routine, type RoutineItem } from "../store";

export const SHARE_FORMAT = "d3-routine";
/** The format version. A newer file is refused, an older one is read. */
export const SHARE_VERSION = 1;
export const SHARE_EXTENSION = "d3-routine.json";
const MAX_NAME = 80;
const MAX_DESCRIPTION = 160;
const MAX_ITEMS = 50;

interface ShareFile {
  format: typeof SHARE_FORMAT;
  version: number;
  /** The D³ version that wrote it, for the player's information only. */
  app: string;
  routine: { name: string; description: string; pauseSeconds: number; items: RoutineItem[] };
}

export function toShareFile(r: Routine, app: string): string {
  const file: ShareFile = {
    format: SHARE_FORMAT,
    version: SHARE_VERSION,
    app,
    routine: {
      name: r.name,
      description: r.description,
      pauseSeconds: r.pauseSeconds,
      items: r.items.map((i) => ({ gameId: i.gameId, minutes: i.minutes, settings: { ...i.settings } })),
    },
  };
  return JSON.stringify(file, null, 2) + "\n";
}

/** A file name from the routine's name: letters, digits, spaces and dashes are kept. */
export function shareFileName(name: string): string {
  const base = name.replace(/[^\p{L}\p{N} _-]+/gu, "").trim().replace(/\s+/g, " ") || "routine";
  return `${base.slice(0, 60)}.${SHARE_EXTENSION}`;
}

export type ImportProblem = "notRoutine" | "newer" | "noGames";

export class ImportError extends Error {
  constructor(readonly problem: ImportProblem) {
    super(problem);
  }
}

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

/**
 * Reads a routine file into a new routine (a new id). Games this version doesn't know are left out and counted;
 * settings are filled up and checked like those of a stored routine. Throws an ImportError.
 */
export function parseShareFile(text: string): { routine: Routine; dropped: number } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ImportError("notRoutine");
  }
  if (!isObject(data) || data.format !== SHARE_FORMAT || !isObject(data.routine)) throw new ImportError("notRoutine");
  if (typeof data.version !== "number" || data.version > SHARE_VERSION) throw new ImportError("newer");
  const r = data.routine;
  const raw = Array.isArray(r.items) ? r.items.slice(0, MAX_ITEMS) : [];
  const items: RoutineItem[] = raw.filter(isObject).map((i) => ({
    gameId: String(i.gameId ?? ""),
    minutes: Math.max(0, Math.min(120, Math.round(Number(i.minutes) || 0))),
    settings: isObject(i.settings)
      ? Object.fromEntries(Object.entries(i.settings).filter(([, v]) => typeof v === "string" || typeof v === "number"))
      : {},
  })) as RoutineItem[];
  const kept = cleanItems(items);
  if (!kept.length) throw new ImportError("noGames");
  const pause = Math.round(Number(r.pauseSeconds));
  return {
    routine: {
      id: crypto.randomUUID(),
      name: (typeof r.name === "string" ? r.name.trim() : "").slice(0, MAX_NAME),
      description: (typeof r.description === "string" ? r.description.trim() : "").slice(0, MAX_DESCRIPTION),
      pauseSeconds: Number.isFinite(pause) ? Math.max(0, Math.min(MAX_PAUSE_SECONDS, pause)) : 15,
      items: kept,
    },
    dropped: raw.length - kept.length,
  };
}
