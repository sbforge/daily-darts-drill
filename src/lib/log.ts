// A thin layer over tauri-plugin-log, so the code doesn't import the plugin everywhere and the
// browser preview falls back to the console. Short lines, no personal data beyond the Autodarts host.
import { debug as pDebug, error as pError, info as pInfo, warn as pWarn } from "@tauri-apps/plugin-log";

const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

function write(level: "debug" | "info" | "warn" | "error", plugin: (m: string) => Promise<void>, msg: string) {
  console[level](`[d3] ${msg}`);
  if (inTauri) plugin(msg).catch(() => {});
}

export const log = {
  debug: (msg: string) => write("debug", pDebug, msg),
  info: (msg: string) => write("info", pInfo, msg),
  warn: (msg: string) => write("warn", pWarn, msg),
  error: (msg: string) => write("error", pError, msg),
};
