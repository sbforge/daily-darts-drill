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
}

const EMPTY: StartupReport = { updateBackup: null, dailyBackup: null, backupError: null, crashedLastTime: false };

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
