// The animation module: one place any part of the app plays an effect through.
//
// Overlay effects (a stamp over the screen) are queued and shown one at a time by FxLayer.
// Element effects (a pulse, a count-up) run on one element through the `fx` action in actions.ts.
// Timings, tones and sizes live here and in the effects, so callers only name what they want.
import { EFFECTS, type EffectName } from "./effects";

export type Tone = "great" | "bad" | "info";
export type Size = "big" | "normal";

export interface FxOptions {
  text?: string;
  tone?: Tone;
  size?: Size;
  /** The same key never plays twice: games recompute on every dart and correction. */
  key?: string;
  /** A higher one replaces a running lower one; otherwise effects queue. */
  priority?: number;
}

export interface Playing {
  id: number;
  effect: EffectName;
  opts: FxOptions;
  ms: number;
}

export interface FxHandle {
  /** Resolves when the effect is over, played, replaced or cancelled. */
  done: Promise<void>;
  cancel(): void;
}

interface Entry extends Playing {
  resolve: () => void;
}

class Fx {
  /**
   * Animations on: off shows overlays static for their normal time, and element effects at their end state.
   * Until the setting is read, the system's "reduce motion" decides.
   */
  enabled = $state(typeof matchMedia !== "function" || !matchMedia("(prefers-reduced-motion: reduce)").matches);
  current = $state<Playing | null>(null);
  #running: Entry | null = null;
  #queue: Entry[] = [];
  #seen = new Set<string>();
  #timer: ReturnType<typeof setTimeout> | undefined;
  #next = 0;

  play(effect: EffectName, opts: FxOptions = {}): FxHandle {
    if (opts.key !== undefined) {
      if (this.#seen.has(opts.key)) return { done: Promise.resolve(), cancel: () => {} };
      this.#seen.add(opts.key);
    }
    let resolve!: () => void;
    const done = new Promise<void>((r) => (resolve = r));
    const entry: Entry = { id: ++this.#next, effect, opts, ms: EFFECTS[effect].ms, resolve };
    const running = this.#running;
    if (running && (opts.priority ?? 0) > (running.opts.priority ?? 0)) this.#end(running);
    if (this.#running) this.#queue.push(entry);
    else this.#start(entry);
    return { done, cancel: () => this.#cancel(entry) };
  }

  /** Marks a key as played without playing it, e.g. a moment that lost against a bigger one in the same turn. */
  skip(key: string) {
    this.#seen.add(key);
  }

  /** Drops what waits in the queue; what is playing plays to its end. */
  dropQueued() {
    this.#queue.splice(0).forEach((e) => e.resolve());
  }

  /** Stops what is playing and drops the queue. */
  clear() {
    this.dropQueued();
    if (this.#running) this.#end(this.#running);
  }

  #start(e: Entry) {
    this.#running = e;
    this.current = { id: e.id, effect: e.effect, opts: e.opts, ms: e.ms };
    this.#timer = setTimeout(() => this.#end(e), e.ms);
  }

  #end(e: Entry) {
    if (this.#running !== e) return;
    clearTimeout(this.#timer);
    this.#running = null;
    this.current = null;
    e.resolve();
    const next = this.#queue.shift();
    if (next) this.#start(next);
  }

  #cancel(e: Entry) {
    if (this.#running === e) this.#end(e);
    else {
      this.#queue = this.#queue.filter((q) => q !== e);
      e.resolve();
    }
  }
}

export const fx = new Fx();
