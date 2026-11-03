// What the checkout games show under the rest: the usual route, and the field to aim at next on the board.
import { t } from "../i18n/index.svelte";
import { opt } from "./shared";
import { routeFor } from "./routes";
import type { BoardField, Field, Settings } from "./types";

/** The "Show route" setting every checkout game has. On unless it says otherwise. */
export const showRouteField: Field = {
  key: "showRoute",
  get label() {
    return t("game.showRoute");
  },
  get info() {
    return t("game.showRouteInfo");
  },
  kind: "select",
  options: [opt("on", () => t("game.showRouteOn")), opt("off", () => t("game.showRouteOff"))],
};

export const showsRoute = (s: Settings) => s.showRoute !== "off";

/** The route text for the rest and its first field, or nothing when the route is switched off or there is none. */
export function routeFocus(remaining: number, s: Settings): { hint?: string; targets: BoardField[] } {
  if (!showsRoute(s)) return { targets: [] };
  const r = routeFor(remaining);
  if (!r) return { targets: [] };
  return { hint: r.map((d) => d.label).join(" "), targets: [r[0].field] };
}
