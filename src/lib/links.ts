// External links and how to open them. Inside Tauri they open in the system browser.
import { openUrl } from "@tauri-apps/plugin-opener";

export const GITHUB_URL = "https://github.com/steffen-brauer/adx-autodarts-training-experience";
// TODO: replace with the real Buy me a coffee page.
export const COFFEE_URL = "https://www.buymeacoffee.com/";

export function openExternal(ev: MouseEvent, url: string) {
  ev.preventDefault();
  openUrl(url).catch(() => window.open(url, "_blank", "noopener"));
}
