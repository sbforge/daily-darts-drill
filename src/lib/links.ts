// External links and how to open them. Inside Tauri they open in the system browser.
import { openUrl } from "@tauri-apps/plugin-opener";

export const GITHUB_URL = "https://github.com/sbforge/daily-darts-drill";
export const ISSUES_URL = `${GITHUB_URL}/issues`;
export const LICENSE_URL = `${GITHUB_URL}/blob/main/LICENSE`;
export const AUTODARTS_URL = "https://autodarts.io";
// TODO: replace with the real Buy me a coffee page.
export const COFFEE_URL = "https://www.buymeacoffee.com/";

export function openExternal(ev: MouseEvent, url: string) {
  ev.preventDefault();
  openUrl(url).catch(() => window.open(url, "_blank", "noopener"));
}
