// Real fullscreen for the app window: no title bar, no taskbar. Maximising the window (what Windows offers in the
// title bar) keeps both. Inside Tauri the native window goes fullscreen; in the browser preview the page does.
import { getCurrentWindow } from "@tauri-apps/api/window";

const inTauri = "__TAURI_INTERNALS__" in window;

export const fullscreen = $state({ on: false });

async function read(): Promise<boolean> {
  if (inTauri) return getCurrentWindow().isFullscreen();
  return !!document.fullscreenElement;
}

async function write(on: boolean) {
  if (inTauri) await getCurrentWindow().setFullscreen(on);
  else if (on) await document.documentElement.requestFullscreen();
  else await document.exitFullscreen();
}

export async function setFullscreen(on: boolean) {
  try {
    await write(on);
    fullscreen.on = await read();
  } catch (e) {
    console.warn("Fullscreen failed", e);
  }
}

export const toggleFullscreen = () => setFullscreen(!fullscreen.on);

/** Keeps `fullscreen.on` in step when the window leaves fullscreen by other means (e.g. the OS). */
export function watchFullscreen(): () => void {
  const sync = () => read().then((on) => (fullscreen.on = on)).catch(() => {});
  sync();
  if (inTauri) {
    const off = getCurrentWindow().onResized(sync);
    return () => void off.then((f) => f());
  }
  document.addEventListener("fullscreenchange", sync);
  return () => document.removeEventListener("fullscreenchange", sync);
}

/** F11 toggles fullscreen; Escape leaves it unless something else (a dialog, a correction) used the key. */
export function fullscreenKeys(e: KeyboardEvent) {
  if (e.key === "F11") {
    e.preventDefault();
    toggleFullscreen();
  } else if (e.key === "Escape" && fullscreen.on && !e.defaultPrevented && !document.querySelector("dialog[open]")) {
    setFullscreen(false);
  }
}
