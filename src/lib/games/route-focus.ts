// What the checkout games show under the rest: the usual route, and the field to aim at next on the board.
import { routeFor } from "./routes";
import type { BoardField, Settings } from "./types";

/**
 * Routes are switched off: in a real match nobody can look up a finish, so training shouldn't show one either.
 * The code stays (routes.ts, the hint under the rest, the lit field); to bring it back, set this to true and add
 * a "Show route" setting again.
 */
export const ROUTES_ENABLED = false;

/** The route text for the rest and its first field, or nothing when the route is switched off or there is none. */
export function routeFocus(remaining: number, _s: Settings): { hint?: string; targets: BoardField[] } {
  if (!ROUTES_ENABLED) return { targets: [] };
  const r = routeFor(remaining);
  if (!r) return { targets: [] };
  return { hint: r.map((d) => d.label).join(" "), targets: [r[0].field] };
}
