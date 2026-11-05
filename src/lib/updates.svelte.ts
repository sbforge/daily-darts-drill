// Finding out about, downloading and installing a newer D³ (Tauri updater). Releases are on GitHub; the app
// reads `latest.json` there. Outside Tauri (the browser preview) everything is a no-op.
//
// Two channels: "stable" (every player) asks the JS updater, which reads the address in tauri.conf.json, the latest
// stable release. "preview" (only with developer mode on) asks Rust, which reads the moving `preview` release that
// has the newest version, betas included. Download, signature check and backup are the same for both.
import { Channel, invoke } from "@tauri-apps/api/core";
import { log } from "./log";

export type UpdateChannel = "stable" | "preview";
export type UpdateStatus = "idle" | "checking" | "upToDate" | "available" | "downloading" | "installing" | "error";

export const RELEASES_URL = "https://github.com/sbforge/daily-darts-drill/releases/latest";
/** Where to read about and download the version on offer: the latest release, or a beta's own page. */
export const releasesUrl = () =>
  updates.channel === "preview" && updates.version
    ? `https://github.com/sbforge/daily-darts-drill/releases/tag/v${updates.version}`
    : RELEASES_URL;
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
  /** Developer mode: shows the Developer section in Settings. Turned on by tapping the version 7 times. */
  developer: false,
  /** Where updates come from; "preview" only while developer mode is on. */
  channel: "stable" as UpdateChannel,
});

/** What an install needs: the stable path keeps the JS updater's own object, the preview path asks Rust. */
type Found =
  | { channel: "stable"; update: import("@tauri-apps/plugin-updater").Update }
  | { channel: "preview"; version: string };

/** Progress of a download, the same shape for both paths. */
type ProgressEvent =
  | { event: "Started"; data: { contentLength?: number | null } }
  | { event: "Progress"; data: { chunkLength: number } }
  | { event: "Finished" };

let host: UpdateHost | null = null;
let found: Found | null = null;
let ready: Promise<void> = Promise.resolve();

/** The badge on the settings icon. */
export const updateAvailable = () => updates.status === "available" && !updates.skipped;

export function initUpdates(h: UpdateHost, currentVersion: string) {
  // The start's automatic check waits for this, so it already knows the channel.
  ready = load(h, currentVersion);
  return ready;
}

async function load(h: UpdateHost, currentVersion: string) {
  host = h;
  updates.autoCheck = (await h.get("updates.autoCheck")) !== "off";
  updates.developer = (await h.get("developer.enabled")) === "on";
  updates.channel = updates.developer && (await h.get("updates.channel")) === "preview" ? "preview" : "stable";
  const last = await h.get("app.lastRunVersion");
  if (last && last !== currentVersion) updates.updatedTo = currentVersion;
  await h.set("app.lastRunVersion", currentVersion);
  if (inTauri) updates.blocker = await invoke<string | null>("update_blocker").catch(() => null);
}

export async function setAutoCheck(on: boolean) {
  updates.autoCheck = on;
  await host?.set("updates.autoCheck", on ? "on" : "off");
}

/** Developer mode on or off. Off also sets the channel back to stable. */
export async function setDeveloper(on: boolean) {
  updates.developer = on;
  await host?.set("developer.enabled", on ? "on" : "off");
  if (!on) await setChannel("stable");
  log.info(`developer mode ${on ? "on" : "off"}`);
}

/**
 * Switches the update channel. What was found in the other channel is forgotten. Going back to stable doesn't go
 * back in version: a beta stays installed until a stable version is newer.
 */
export async function setChannel(channel: UpdateChannel) {
  if (channel === "preview" && !updates.developer) return;
  if (updates.status === "downloading" || updates.status === "installing") return;
  updates.channel = channel;
  await host?.set("updates.channel", channel);
  found = null;
  updates.status = "idle";
  updates.skipped = false;
  log.info(`update channel: ${channel}`);
}

/** Skipping is remembered per channel, so skipping a beta doesn't hide the stable version with the same number. */
const skippedKey = () => (updates.channel === "preview" ? "updates.skippedVersion.preview" : "updates.skippedVersion");

/** Asks the channel's address; null when there is nothing newer. */
async function find(channel: UpdateChannel): Promise<{ found: Found; version: string; body: string; date: string } | null> {
  if (channel === "preview") {
    const info = await invoke<{ version: string; body: string | null; date: string | null } | null>("preview_check");
    if (!info) return null;
    return { found: { channel, version: info.version }, version: info.version, body: info.body ?? "", date: info.date ?? "" };
  }
  const { check } = await import("@tauri-apps/plugin-updater");
  const update = await check({ timeout: CHECK_TIMEOUT_MS });
  if (!update) return null;
  return { found: { channel, update }, version: update.version, body: update.body ?? "", date: update.date ?? "" };
}

/**
 * Asks GitHub for a newer version. Automatic checks stay silent on errors, skip a version the player skipped,
 * and run on every start, in the background; a manual check always answers.
 */
export async function checkForUpdate({ manual }: { manual: boolean }) {
  await ready;
  if (!host || !inTauri) return;
  if (updates.status === "checking" || updates.status === "downloading" || updates.status === "installing") return;
  if (!manual && !updates.autoCheck) return;
  updates.status = "checking";
  updates.error = "";
  try {
    const channel = updates.channel;
    const update = await find(channel);
    await host.set("updates.lastCheck", new Date().toISOString());
    // Switched channel while asking: this answer belongs to the other one.
    if (channel !== updates.channel) return;
    if (!update) {
      found = null;
      updates.status = "upToDate";
      log.info(`update check (${channel}): up to date`);
      return;
    }
    found = update.found;
    updates.version = update.version;
    updates.notes = update.body;
    updates.date = update.date;
    updates.skipped = (await host.get(skippedKey())) === update.version;
    updates.status = "available";
    log.info(`update check (${channel}): ${update.version} is available${updates.skipped ? " (skipped)" : ""}`);
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
  await host?.set(skippedKey(), updates.version);
  updates.skipped = true;
}

export function later() {
  found = null;
  updates.status = "idle";
}

/** Backs up the database, downloads and installs the update, restarts. Never while a routine runs. */
export async function installUpdate() {
  const pending = found;
  if (!host || !pending || host.busy() || updates.blocker) return;
  updates.status = "downloading";
  updates.done = 0;
  updates.total = 0;
  updates.error = "";
  try {
    const path = await invoke<string>("prepare_update_backup");
    await host.backup(path);
    log.info(`update ${updates.version} (${pending.channel}): backup written, downloading`);
    // Installing closes the app without a normal exit (on Windows the installer ends it): that is no crash.
    await invoke("set_running_marker", { running: false }).catch(() => {});
    const onProgress = (ev: ProgressEvent) => {
      if (ev.event === "Started") updates.total = ev.data.contentLength ?? 0;
      else if (ev.event === "Progress") updates.done += ev.data.chunkLength;
      else if (ev.event === "Finished") updates.status = "installing";
    };
    if (pending.channel === "stable") {
      await pending.update.downloadAndInstall(onProgress);
    } else {
      const channel = new Channel<ProgressEvent>();
      channel.onmessage = onProgress;
      await invoke("preview_install", { onProgress: channel });
    }
    log.info(`update ${updates.version}: installed`);
    const { relaunch } = await import("@tauri-apps/plugin-process");
    await relaunch();
  } catch (e) {
    log.error(`update failed: ${e}`);
    await invoke("set_running_marker", { running: true }).catch(() => {});
    updates.status = "error";
    updates.error = String(e);
  }
}
