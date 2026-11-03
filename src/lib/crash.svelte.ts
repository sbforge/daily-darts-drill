// Crash reports: every error nothing else caught shows a toast and is written to a file next to the log.
import { invoke } from "@tauri-apps/api/core";
import { ISSUES_URL } from "./links";
import { log } from "./log";

/** Where the app was when it happened. Filled in by the app, read only when an error occurs. */
export interface CrashContext {
  screen: string;
  phase?: string;
  routine?: string;
  game?: { id: string; settings: unknown };
  turns?: number;
  connection?: string;
  board?: string;
  animations?: boolean;
  language?: string;
}

export interface CrashToast {
  id: number;
  message: string;
  count: number;
  /** The file the report was written to, once it is. */
  file: string | null;
  report: string;
  githubUrl: string;
}

const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
/** The same error again within this long is one toast with a count. */
const SAME_ERROR_MS = 60_000;

let provider: () => CrashContext = () => ({ screen: "unknown" });
let nextId = 1;
const lastSeen = new Map<string, { at: number; id: number }>();

export const crash = $state<{ toasts: CrashToast[] }>({ toasts: [] });

export function setCrashContext(fn: () => CrashContext) {
  provider = fn;
}

export function dismissCrash(id: number) {
  crash.toasts = crash.toasts.filter((t) => t.id !== id);
}

function describe(error: unknown): { message: string; stack: string; type: string } {
  if (error instanceof Error) return { message: error.message || String(error), stack: error.stack ?? "", type: error.name };
  return { message: typeof error === "string" ? error : JSON.stringify(error) ?? String(error), stack: "", type: typeof error };
}

async function tail(): Promise<string[]> {
  if (!inTauri) return [];
  try {
    return await invoke<string[]>("log_tail", { lines: 50 });
  } catch {
    return [];
  }
}

/** Shows the toast right away, then writes the report; the toast gets its file name when that is done. */
export async function reportCrash(error: unknown, source = "unhandled") {
  const e = describe(error);
  log.error(`${source}: ${e.type}: ${e.message}`);
  const key = `${e.type}:${e.message}`;
  const seen = lastSeen.get(key);
  const now = Date.now();
  if (seen && now - seen.at < SAME_ERROR_MS) {
    const t = crash.toasts.find((x) => x.id === seen.id);
    if (t) {
      t.count++;
      lastSeen.set(key, { at: now, id: seen.id });
      return;
    }
  }

  const id = nextId++;
  lastSeen.set(key, { at: now, id });
  let context: CrashContext;
  try {
    context = provider();
  } catch {
    context = { screen: "unknown" };
  }
  const version = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev";
  const data = {
    time: new Date(now).toISOString(),
    version,
    source,
    userAgent: navigator.userAgent,
    language: navigator.language,
    error: e,
    context,
    log: await tail(),
  };
  const report = JSON.stringify(data, null, 2);
  const body = [
    `**D³ ${version}** · ${navigator.userAgent}`,
    "",
    `Something went wrong: \`${e.message}\``,
    "",
    "Where: " + JSON.stringify(context),
    "",
    "```",
    e.stack.split("\n").slice(0, 8).join("\n"),
    "```",
    "",
    "Please attach `d3.log` and the `crash-….json` file from the log folder (About → Open log folder).",
  ].join("\n");
  const githubUrl = `${ISSUES_URL}/new?title=${encodeURIComponent(`Crash: ${e.message}`.slice(0, 120))}&body=${encodeURIComponent(body.slice(0, 1800))}`;
  crash.toasts = [...crash.toasts, { id, message: e.message, count: 1, file: null, report, githubUrl }];

  if (inTauri) {
    try {
      const file = await invoke<string>("save_crash_report", { json: report });
      const t = crash.toasts.find((x) => x.id === id);
      if (t) t.file = file;
    } catch (err) {
      log.warn(`crash report not written: ${err}`);
    }
  }
}

/** Catches what nothing else caught. A crash during a game doesn't stop the game. */
export function installCrashHandlers() {
  window.addEventListener("error", (ev) => {
    // Resource load errors (images) have no error object and are not crashes.
    // WebKit and Chromium report a harmless "ResizeObserver loop" as a window error; it is not a crash.
    if (/ResizeObserver loop/i.test(ev.message)) return;
    if (ev.error || ev.message) reportCrash(ev.error ?? ev.message, "window.onerror");
  });
  window.addEventListener("unhandledrejection", (ev) => reportCrash(ev.reason, "unhandledrejection"));
}
