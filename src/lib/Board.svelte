<script lang="ts">
  import type { Dart } from "./autodarts";
  import { dartLabel } from "./autodarts";

  let { turns, current }: { turns: Dart[][]; current: Dart[] } = $props();

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
</script>

<svg viewBox="-1.2 -1.2 2.4 2.4" role="img" aria-label="Dartboard with the darts you have thrown">
  {#each wedges as w (w.n)}
    <path d={w.inner} class={w.dark ? "single dark" : "single light"} />
    <path d={w.outer} class={w.dark ? "single dark" : "single light"} />
    <path d={w.triple} class={w.dark ? "ring red" : "ring green"} />
    <path d={w.double} class={w.dark ? "ring red" : "ring green"} />
    <text x={w.lx} y={w.ly} class="num">{w.n}</text>
  {/each}
  <circle r={R.ob} class="ring green" />
  <circle r={R.b} class="ring red" />

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
</svg>

<style>
  svg {
    width: 100%;
    height: auto;
    max-height: 100%;
    display: block;
  }
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
