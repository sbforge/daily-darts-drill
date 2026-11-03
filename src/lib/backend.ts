// Calls into the Rust side. Outside Tauri (the browser preview) they fall back to harmless defaults.
import { invoke } from "@tauri-apps/api/core";

export interface StartupReport {
  /** The folder of the backup taken because the app version changed. */
  updateBackup: string | null;
  /** Why a backup failed, if it did. */
  backupError: string | null;
}

const EMPTY: StartupReport = { updateBackup: null, backupError: null };

export async function startupReport(): Promise<StartupReport> {
  try {
    return { ...EMPTY, ...(await invoke<StartupReport>("startup_report")) };
  } catch {
    return EMPTY;
  }
}

export type AppFolder = "backups";

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
