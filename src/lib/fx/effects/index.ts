// The overlay effects by name. A new effect is one component in this folder plus a line here.
import type { Component } from "svelte";
import Stamp from "./Stamp.svelte";
import type { Size, Tone } from "../fx.svelte";

export interface EffectProps {
  text?: string;
  tone: Tone;
  size: Size;
  /** How long it is shown; the effect fits its motion into this time. */
  ms: number;
}

export const EFFECTS = {
  stamp: { component: Stamp, ms: 2000 },
} satisfies Record<string, { component: Component<EffectProps>; ms: number }>;

export type EffectName = keyof typeof EFFECTS;
