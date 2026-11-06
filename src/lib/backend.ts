// Calls into the Rust side. Outside Tauri (the browser preview) they fall back to harmless defaults.
import { invoke } from "@tauri-apps/api/core";

export interface StartupReport {
  /** The folder of the backup taken because the app version changed. */
  updateBackup: string | null;
  /** Today's backup, if this start made it. */
  dailyBackup: string | null;
  /** The app did not close normally the last time. */
  crashedLastTime: boolean;
  /** Why a backup failed, if it did. */
  backupError: string | null;
  /** A backup was restored on this start: the folder with the data it replaced. */
  restored: string | null;
  /** Why a restore chosen in the last run couldn't be put in place. */
  restoreError: string | null;
}

const EMPTY: StartupReport = {
  updateBackup: null,
  dailyBackup: null,
  backupError: null,
  crashedLastTime: false,
  restored: null,
  restoreError: null,
};

export async function startupReport(): Promise<StartupReport> {
  try {
    return { ...EMPTY, ...(await invoke<StartupReport>("startup_report")) };
  } catch {
    return EMPTY;
  }
}

/** When the newest backup was made (ISO), or null. */
export async function lastBackup(): Promise<string | null> {
  try {
    return await invoke<string | null>("last_backup");
  } catch {
    return null;
  }
}

export type AppFolder = "backups" | "logs";

export async function openFolder(kind: AppFolder): Promise<void> {
  try {
    await invoke("open_folder", { kind });
  } catch {
    /* nothing to open in the browser preview */
  }
}

/** A database written by a newer D³ has migrations this version doesn't know. */
export function isNewerDatabase(message: string): boolean {
  return /previously applied but is missing|VersionMissing/i.test(message);
}

/** Asks where to save, returns null when cancelled. */
export async function chooseExportFile(): Promise<string | null> {
  const { save } = await import("@tauri-apps/plugin-dialog");
  return save({
    defaultPath: `d3-export-${new Date().toISOString().slice(0, 10)}.db`,
    filters: [{ name: "D³ data", extensions: ["db"] }],
  });
}

/** Where the copy right before "Erase all data" goes (the folder is made, the file is written by the caller). */
export async function prepareEraseBackup(): Promise<string> {
  return invoke<string>("prepare_erase_backup");
}


/** A backup that can be restored. */
export interface BackupEntry {
  kind: "daily" | "update" | "erase" | "restore";
  /** The folder name: a date, or a version and a date. */
  name: string;
  /** The database file. */
  path: string;
  /** When it was made (ISO). */
  made: string;
}

export async function listBackups(): Promise<BackupEntry[]> {
  try {
    return (await invoke<BackupEntry[] | null>("list_backups")) ?? [];
  } catch {
    return [];
  }
}

/** Why a file can't be restored. */
export type RestoreProblem = { kind: "notADatabase" | "notD3" | "newer" | "io"; detail: string };

export function restoreProblem(error: unknown): RestoreProblem {
  const msg = error instanceof Error ? error.message : String(error);
  const [kind, ...rest] = msg.split(":");
  const known = ["notADatabase", "notD3", "newer", "io"] as const;
  const k = known.find((x) => x === kind);
  return k ? { kind: k, detail: rest.join(":") } : { kind: "io", detail: msg };
}

/** Copies a backup or an export into place for the next start and checks it; throws a RestoreProblem message. */
export async function stageRestore(source: string): Promise<void> {
  await invoke("stage_restore", { source });
}

export async function discardRestore(): Promise<void> {
  try {
    await invoke("discard_restore");
  } catch {
    /* nothing staged in the browser preview */
  }
}

/** Asks for a database file to restore (an export), returns null when cancelled. */
export async function chooseRestoreFile(): Promise<string | null> {
  const { open } = await import("@tauri-apps/plugin-dialog");
  const picked = await open({ multiple: false, directory: false, filters: [{ name: "D³ data", extensions: ["db"] }] });
  return typeof picked === "string" ? picked : null;
}
