// Element effects: `use:fx={...}` on one element. With animations off they show their end state.
import type { Action } from "svelte/action";
import { fx as state } from "./fx.svelte";

export type ElementFx =
  /** Beats once a second while active. */
  | { effect: "pulse"; active: boolean }
  /** Fades and slides in, `delay` ms after it appears (for a stagger). */
  | { effect: "in"; delay?: number }
  /** Counts up to `value` from 0 when it appears, and from the old value when it changes. Leave the element empty. */
  | { effect: "countUp"; value: number; format: (n: number) => string; ms?: number };

const COUNT_MS = 700;
const easeOut = (x: number) => 1 - (1 - x) ** 3;

export const fx: Action<HTMLElement, ElementFx> = (node, params) => {
  let frame = 0;
  let shown = 0;

  function count(to: number, format: (n: number) => string, ms: number) {
    cancelAnimationFrame(frame);
    if (!state.enabled || !Number.isFinite(to)) {
      shown = to;
      node.textContent = format(to);
      return;
    }
    const from = shown;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / ms);
      shown = from + (to - from) * easeOut(p);
      node.textContent = format(p < 1 ? shown : to);
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    node.textContent = format(from);
    frame = requestAnimationFrame(tick);
  }

  function apply(p: ElementFx) {
    if (p.effect === "pulse") node.classList.toggle("fx-pulse", p.active && state.enabled);
    else if (p.effect === "in") {
      node.classList.add("fx-in");
      node.style.setProperty("--fx-delay", `${p.delay ?? 0}ms`);
    } else count(p.value, p.format, p.ms ?? COUNT_MS);
  }

  apply(params);
  return {
    update: apply,
    destroy: () => cancelAnimationFrame(frame),
  };
};
