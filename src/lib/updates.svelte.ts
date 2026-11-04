// Finding out about, downloading and installing a newer D³ (Tauri updater). Releases are on GitHub; the app
// reads `latest.json` there. Outside Tauri (the browser preview) everything is a no-op.
import { invoke } from "@tauri-apps/api/core";
import { log } from "./log";

export type UpdateStatus = "idle" | "checking" | "upToDate" | "available" | "downloading" | "installing" | "error";

export const RELEASES_URL = "https://github.com/sbforge/daily-darts-drill/releases/latest";
/** An offline start must not wait long for an answer that won't come. */
const CHECK_TIMEOUT_MS = 10_000;
const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** What the app lends the updater: the settings store, whether a routine runs, and the pre-install backup. */
export interface UpdateHost {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  busy(): boolean;
  backup(path: string): Promise<void>;
}

export const updates = $state({
  status: "idle" as UpdateStatus,
  version: "",
  notes: "",
  date: "",
  done: 0,
  total: 0,
  error: "",
  autoCheck: true,
  /** Why updating in place isn't possible here (see `update_blocker` in Rust), or null. */
  blocker: null as string | null,
  /** The version this start just updated to, shown once. */
  updatedTo: "",
  /** An update was found, but the player skipped that version: no badge, the manual check still shows it. */
  skipped: false,
});

let host: UpdateHost | null = null;
let found: import("@tauri-apps/plugin-updater").Update | null = null;

/** The badge on the settings icon. */
export const updateAvailable = () => updates.status === "available" && !updates.skipped;

export async function initUpdates(h: UpdateHost, currentVersion: string) {
  host = h;
  updates.autoCheck = (await h.get("updates.autoCheck")) !== "off";
  const last = await h.get("app.lastRunVersion");
  if (last && last !== currentVersion) updates.updatedTo = currentVersion;
  await h.set("app.lastRunVersion", currentVersion);
  if (inTauri) updates.blocker = await invoke<string | null>("update_blocker").catch(() => null);
}

export async function setAutoCheck(on: boolean) {
  updates.autoCheck = on;
  await host?.set("updates.autoCheck", on ? "on" : "off");
}

/**
 * Asks GitHub for a newer version. Automatic checks stay silent on errors, skip a version the player skipped,
 * and run on every start, in the background; a manual check always answers.
 */
export async function checkForUpdate({ manual }: { manual: boolean }) {
  if (!host || !inTauri) return;
  if (updates.status === "checking" || updates.status === "downloading" || updates.status === "installing") return;
  if (!manual && !updates.autoCheck) return;
  updates.status = "checking";
  updates.error = "";
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check({ timeout: CHECK_TIMEOUT_MS });
    await host.set("updates.lastCheck", new Date().toISOString());
    if (!update) {
      found = null;
      updates.status = "upToDate";
      log.info("update check: up to date");
      return;
    }
    found = update;
    updates.version = update.version;
    updates.notes = update.body ?? "";
    updates.date = update.date ?? "";
    updates.skipped = (await host.get("updates.skippedVersion")) === update.version;
    updates.status = "available";
    log.info(`update check: ${update.version} is available${updates.skipped ? " (skipped)" : ""}`);
    if (!manual && updates.skipped) updates.status = "idle";
  } catch (e) {
    log.warn(`update check failed: ${e}`);
    // The automatic check is silent; only a manual one tells.
    updates.status = manual ? "error" : "idle";
    updates.error = String(e);
  }
}

export async function skipVersion() {
  if (!updates.version) return;
  await host?.set("updates.skippedVersion", updates.version);
  updates.skipped = true;
}

export function later() {
  found = null;
  updates.status = "idle";
}

/** Backs up the database, downloads and installs the update, restarts. Never while a routine runs. */
export async function installUpdate() {
  if (!host || !found || host.busy() || updates.blocker) return;
  updates.status = "downloading";
  updates.done = 0;
  updates.total = 0;
  updates.error = "";
  try {
    const path = await invoke<string>("prepare_update_backup");
    await host.backup(path);
    log.info(`update ${found.version}: backup written, downloading`);
    // Installing closes the app without a normal exit (on Windows the installer ends it): that is no crash.
    await invoke("set_running_marker", { running: false }).catch(() => {});
    await found.downloadAndInstall((ev) => {
      if (ev.event === "Started") updates.total = ev.data.contentLength ?? 0;
      else if (ev.event === "Progress") updates.done += ev.data.chunkLength;
      else if (ev.event === "Finished") updates.status = "installing";
    });
    log.info(`update ${found.version}: installed`);
    const { relaunch } = await import("@tauri-apps/plugin-process");
    await relaunch();
  } catch (e) {
    log.error(`update failed: ${e}`);
    await invoke("set_running_marker", { running: true }).catch(() => {});
    updates.status = "error";
    updates.error = String(e);
  }
}
