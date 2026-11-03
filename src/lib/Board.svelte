<script lang="ts">
  import type { Dart } from "./autodarts";
  import { dartLabel } from "./autodarts";
  import type { BoardField } from "./games";
  import { t } from "./i18n/index.svelte";

  let {
    turns,
    current,
    targets = [],
    picking = false,
    onpick,
  }: {
    turns: Dart[][];
    current: Dart[];
    /** The fields the game wants hit next, highlighted. */
    targets?: BoardField[];
    /** The board is clickable: a click sets the field hit, for a dart being corrected or the next one. */
    picking?: boolean;
    onpick?: (dart: Dart) => void;
  } = $props();

  // Segment order clockwise from the top. Radii are relative to the outer edge of the double ring.
  const ORDER = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
  const R = { dbl1: 1, dbl0: 0.953, tri1: 0.629, tri0: 0.582, ob: 0.0935, b: 0.0374 };

  function pt(r: number, deg: number): [number, number] {
    const t = (deg * Math.PI) / 180;
    return [r * Math.sin(t), -r * Math.cos(t)];
  }

  function sector(r0: number, r1: number, a0: number, a1: number): string {
    const [x0, y0] = pt(r1, a0);
    const [x1, y1] = pt(r1, a1);
    const [x2, y2] = pt(r0, a1);
    const [x3, y3] = pt(r0, a0);
    return `M${x0} ${y0} A${r1} ${r1} 0 0 1 ${x1} ${y1} L${x2} ${y2} A${r0} ${r0} 0 0 0 ${x3} ${y3} Z`;
  }

  /** A ring around the centre, or a disc when r0 is 0. */
  function annulus(r0: number, r1: number): string {
    const circle = (r: number, sweep: number) =>
      `M${r} 0 A${r} ${r} 0 1 ${sweep} ${-r} 0 A${r} ${r} 0 1 ${sweep} ${r} 0 Z`;
    return r0 ? `${circle(r1, 1)} ${circle(r0, 0)}` : circle(r1, 1);
  }

  /** The outline of a field, as an SVG path. */
  function fieldPath(f: BoardField): string {
    if (f.bed === "bull") return annulus(0, R.b);
    if (f.bed === "outerBull") return annulus(R.b, R.ob);
    const i = ORDER.indexOf(f.number ?? 0);
    const [r0, r1] = {
      innerSingle: [R.ob, R.tri0],
      triple: [R.tri0, R.tri1],
      outerSingle: [R.tri1, R.dbl0],
      double: [R.dbl0, R.dbl1],
    }[f.bed];
    return sector(r0, r1, i * 18 - 9, i * 18 + 9);
  }

  /** The field a dart is in; none for a miss. */
  function fieldOf(d: Dart): BoardField | null {
    switch (d.kind) {
      case "bull":
      case "outerBull":
        return { bed: d.kind };
      case "single":
        return { bed: d.zone === "inner" ? "innerSingle" : "outerSingle", number: d.number ?? 0 };
      case "double":
      case "triple":
        return { bed: d.kind, number: d.number ?? 0 };
      default:
        return null;
    }
  }

  const wedges = ORDER.map((n, i) => {
    const a0 = i * 18 - 9;
    const a1 = i * 18 + 9;
    const [lx, ly] = pt(1.085, i * 18);
    return {
      n,
      dark: i % 2 === 0,
      lx,
      ly,
      inner: sector(R.ob, R.tri0, a0, a1),
      triple: sector(R.tri0, R.tri1, a0, a1),
      outer: sector(R.tri1, R.dbl0, a0, a1),
      double: sector(R.dbl0, R.dbl1, a0, a1),
    };
  });

  // Draw misses at the edge of the view instead of off-screen.
  function place(d: Dart): [number, number] {
    const k = d.radius > 1.12 ? 1.12 / d.radius : 1;
    return [d.x * k, -d.y * k];
  }

  const past = $derived(turns.flat());

  let svg = $state<SVGSVGElement>();
  let hover = $state<Dart | null>(null);

  /** The dart that lands at a point of the board, in board units with +y down as in the SVG. */
  function dartAt(x: number, y: number): Dart {
    const radius = Math.hypot(x, y);
    const base = { x, y: -y, radius, zone: null, bouncer: false, failed: false, method: "manual" } as const;
    if (radius > R.dbl1) return { ...base, kind: "miss", number: null, score: 0 };
    if (radius <= R.b) return { ...base, kind: "bull", number: null, score: 50 };
    if (radius <= R.ob) return { ...base, kind: "outerBull", number: null, score: 25 };
    const deg = (Math.atan2(x, -y) * 180) / Math.PI;
    const n = ORDER[((Math.round(deg / 18) % 20) + 20) % 20];
    if (radius >= R.dbl0) return { ...base, kind: "double", number: n, score: n * 2 };
    if (radius >= R.tri0 && radius <= R.tri1) return { ...base, kind: "triple", number: n, score: n * 3 };
    return { ...base, kind: "single", number: n, zone: radius < R.tri0 ? "inner" : "outer", score: n };
  }

  function boardPoint(e: PointerEvent | MouseEvent): [number, number] | null {
    const m = svg?.getScreenCTM();
    if (!m) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return [p.x, p.y];
  }

  function pick(e: MouseEvent) {
    const p = picking && boardPoint(e);
    if (p) onpick?.(dartAt(...p));
  }

  function move(e: PointerEvent) {
    const p = picking && boardPoint(e);
    hover = p ? dartAt(...p) : null;
  }

  $effect(() => {
    if (!picking) hover = null;
  });
</script>

<!-- Picking is for the mouse or touch; the keyboard and screen readers keep the dart as it is (Escape cancels). -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<svg
  bind:this={svg}
  viewBox="-1.2 -1.2 2.4 2.4"
  role="img"
  aria-label={t("board.aria")}
  class:picking
  onclick={pick}
  onpointermove={move}
  onpointerleave={() => (hover = null)}
>
  <!-- Catches clicks next to the board, which count as a miss. -->
  <rect x="-1.2" y="-1.2" width="2.4" height="2.4" class="pad" />
  {#each wedges as w (w.n)}
    <path d={w.inner} class={w.dark ? "single dark" : "single light"} />
    <path d={w.outer} class={w.dark ? "single dark" : "single light"} />
    <path d={w.triple} class={w.dark ? "ring red" : "ring green"} />
    <path d={w.double} class={w.dark ? "ring red" : "ring green"} />
    <text x={w.lx} y={w.ly} class="num">{w.n}</text>
  {/each}
  <circle r={R.ob} class="ring green" />
  <circle r={R.b} class="ring red" />

  {#each targets as f (`${f.bed}${f.number ?? ""}`)}
    <path d={fieldPath(f)} class="target" />
  {/each}

  <!-- The field a click would set, drawn over the board. -->
  {#if hover}
    {@const f = fieldOf(hover)}
    {#if f}<path d={fieldPath(f)} class="hl" />{/if}
  {/if}

  {#each past as d, i (i)}
    {@const [x, y] = place(d)}
    <circle cx={x} cy={y} r="0.02" class="old" />
  {/each}
  {#each current as d, i (i)}
    {@const [x, y] = place(d)}
    <g>
      <circle cx={x} cy={y} r="0.034" class="now" />
      <text x={x} y={y - 0.055} class="tag">{dartLabel(d)}</text>
    </g>
  {/each}

  {#if hover}
    <text x={hover.x} y={-hover.y - 0.07} class="tag pick">{dartLabel(hover)}</text>
  {/if}
</svg>

<style>
  svg {
    width: 100%;
    height: auto;
    max-height: 100%;
    display: block;
  }
  .pad { fill: transparent; }
  .picking { cursor: crosshair; }
  /* Targets glow in the accent colour; the field under the pointer is a plain light wash on top. */
  .target {
    fill: var(--accent);
    fill-rule: evenodd;
    fill-opacity: 0.7;
    stroke: var(--accent-hi);
    stroke-width: 0.018;
    pointer-events: none;
    animation: target-pulse 1.6s ease-in-out infinite alternate;
  }
  @keyframes target-pulse {
    from { fill-opacity: 0.95; }
    to { fill-opacity: 0.5; }
  }
  .hl { fill: var(--chalk); fill-rule: evenodd; opacity: 0.45; stroke: var(--chalk); stroke-width: 0.008; pointer-events: none; }
  .old, .now, .tag, .num { pointer-events: none; }
  .tag.pick { fill: var(--chalk); font-size: 0.09px; }
  .single.dark { fill: var(--board-dark); }
  .single.light { fill: var(--board-light); }
  .ring.red { fill: var(--board-red); }
  .ring.green { fill: var(--board-green); }
  path, circle.ring { stroke: var(--board-wire); stroke-width: 0.004; }
  .num {
    fill: var(--dim);
    font-size: 0.085px;
    text-anchor: middle;
    dominant-baseline: central;
    font-weight: 600;
  }
  .old { fill: var(--chalk); opacity: 0.5; }
  .now { fill: var(--dart); stroke: var(--bg); stroke-width: 0.012; }
  .tag {
    fill: var(--chalk);
    font-size: 0.07px;
    text-anchor: middle;
    font-weight: 700;
    paint-order: stroke;
    stroke: var(--bg);
    stroke-width: 0.02;
  }
</style>
