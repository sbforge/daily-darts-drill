<script lang="ts">
  // A zoomed-in piece of the board: the aimed field with the segments next to it, the darts thrown at it, and
  // where they land on average. Drawn in mm from the board's centre, +y down as in the SVG.
  // - one field: as it hangs on the board, so "low" is low, with the numbers of its neighbours
  // - a kind of field (all doubles, ...): drawn at the top of the board (D20, T20, ...) without numbers; every dart
  //   keeps its real offset from the centre of its own field, so the drawing shows where the darts go
  // - everything: no board, rings every 10 mm around the centre of whatever field was aimed at
  import type { BoardField } from "./games";
  import { num, t } from "./i18n/index.svelte";
  import { bedRadii, fieldCenter, MM, ORDER, R, segmentAngle, type Spread } from "./precision";

  let {
    field,
    generic = false,
    darts,
    spread,
    range = 40,
  }: {
    /** The field to draw; null for everything, with rings instead of a board. */
    field: BoardField | null;
    /** A kind of field: drawn at the top, without numbers. */
    generic?: boolean;
    /** Offsets from the aimed field's centre, mm, +y up. */
    darts: { dx: number; dy: number; hit: boolean }[];
    spread: Spread | null;
    /** Half the width of the view without a board, mm (the same for both sides of a comparison). */
    range?: number;
  } = $props();

  /** Half the width of the view, mm, by the field: enough for the segments next to it. */
  const HALF: Record<BoardField["bed"], number> = { double: 45, outerSingle: 45, triple: 35, innerSingle: 52, bull: 30, outerBull: 30 };

  const shown = $derived<BoardField | null>(field ? (generic && field.number ? { ...field, number: 20 } : field) : null);
  const half = $derived(shown ? HALF[shown.bed] : range);
  const c = $derived(shown ? fieldCenter(shown) : { x: 0, y: 0 });
  // The view's centre, SVG units.
  const cx = $derived(c.x * MM);
  const cy = $derived(-c.y * MM);

  function pt(r: number, deg: number): [number, number] {
    const a = (deg * Math.PI) / 180;
    return [r * MM * Math.sin(a), -r * MM * Math.cos(a)];
  }

  function sector(r0: number, r1: number, a0: number, a1: number): string {
    const [x0, y0] = pt(r1, a0);
    const [x1, y1] = pt(r1, a1);
    const [x2, y2] = pt(r0, a1);
    const [x3, y3] = pt(r0, a0);
    const R1 = r1 * MM;
    const R0 = r0 * MM;
    return `M${x0} ${y0} A${R1} ${R1} 0 0 1 ${x1} ${y1} L${x2} ${y2} A${R0} ${R0} 0 0 0 ${x3} ${y3} Z`;
  }

  function ring(r0: number, r1: number): string {
    const circle = (r: number, sweep: number) => `M${r} 0 A${r} ${r} 0 1 ${sweep} ${-r} 0 A${r} ${r} 0 1 ${sweep} ${r} 0 Z`;
    return r0 ? `${circle(r1 * MM, 1)} ${circle(r0 * MM, 0)}` : circle(r1 * MM, 1);
  }

  function fieldPath(f: BoardField): string {
    if (f.bed === "bull" || f.bed === "outerBull") return ring(...bedRadii(f.bed));
    const a = segmentAngle(f.number);
    return sector(...bedRadii(f.bed), a - 9, a + 9);
  }

  /** The segments to draw: the field's and one on each side; around the bull all of them. */
  const wedges = $derived.by(() => {
    if (!shown) return [];
    const bull = shown.bed === "bull" || shown.bed === "outerBull";
    const i = ORDER.indexOf(shown.number ?? 20);
    const idx = bull ? ORDER.map((_, k) => k) : [i - 1, i, i + 1].map((k) => (k + 20) % 20);
    // A number sits in its segment as far out as the view still shows it: the field's own in the middle, a
    // neighbour's next to the wire. Fields at an angle cut the view differently, so the spot is searched for.
    const rc = Math.hypot(c.x, c.y) * MM;
    const inView = ([x, y]: [number, number]) => Math.abs(x - c.x * MM) < half * 0.82 && Math.abs(y + c.y * MM) < half * 0.82;
    function labelAt(a: number, own: boolean): [number, number] {
      for (let r = rc + half * 0.8; r > rc - half * 0.9; r -= half / 20) {
        for (const off of own ? [0] : [12, 14, 16]) {
          const p = pt(r / MM, i * 18 + Math.sign(a) * off);
          if (inView(p)) return p;
        }
      }
      return [NaN, NaN];
    }
    return idx.map((k, j) => {
      const a = k * 18;
      const n = ORDER[k];
      const [lx, ly] = labelAt(j - 1, j === 1);
      return {
        n,
        dark: k % 2 === 0,
        own: n === shown.number,
        lx,
        ly,
        inner: sector(R.ob, R.tri0, a - 9, a + 9),
        triple: sector(R.tri0, R.tri1, a - 9, a + 9),
        outer: sector(R.tri1, R.dbl0, a - 9, a + 9),
        double: sector(R.dbl0, R.dbl1, a - 9, a + 9),
      };
    });
  });
  const showBulls = $derived(!!shown && Math.hypot(cx, cy) - half * Math.SQRT2 < R.ob * MM);

  // Darts are drawn where they landed relative to the drawn field's centre.
  const points = $derived(darts.map((d) => ({ x: cx + d.dx, y: cy - d.dy, hit: d.hit })));
  const outside = $derived(points.filter((p) => Math.abs(p.x - cx) > half || Math.abs(p.y - cy) > half).length);
  const mean = $derived(spread ? { x: cx + spread.biasX, y: cy - spread.biasY } : null);
  const tick = $derived(half / 40);
  // Dots get smaller the more darts there are, so a cloud of hundreds still shows where it is dense.
  const dot = $derived((half / 40) * Math.min(1, Math.max(0.3, Math.sqrt(40 / Math.max(1, darts.length)))));
  const meanDot = $derived(half / 28);
  const rings = $derived(Array.from({ length: Math.floor(half / 10) }, (_, i) => (i + 1) * 10));
</script>

<figure class="zoom">
  <svg viewBox={`${cx - half} ${cy - half} ${2 * half} ${2 * half}`} role="img" aria-label={t("precision.zoomAria")}>
    <defs>
      <clipPath id="zoom-clip-{cx.toFixed(1)}-{cy.toFixed(1)}-{half}">
        <rect x={cx - half} y={cy - half} width={2 * half} height={2 * half} rx={half / 14} />
      </clipPath>
    </defs>
    <g clip-path="url(#zoom-clip-{cx.toFixed(1)}-{cy.toFixed(1)}-{half})">
      <rect x={cx - half} y={cy - half} width={2 * half} height={2 * half} class="bg" />
      {#if shown}
        {#each wedges as w (w.n)}
          <g class:other={!w.own && shown.bed !== "bull" && shown.bed !== "outerBull"}>
            <path d={w.inner} class={w.dark ? "single dark" : "single light"} />
            <path d={w.outer} class={w.dark ? "single dark" : "single light"} />
            <path d={w.triple} class={w.dark ? "ring red" : "ring green"} />
            <path d={w.double} class={w.dark ? "ring red" : "ring green"} />
          </g>
        {/each}
        {#if showBulls}
          <path d={ring(R.b, R.ob)} class="ring green" />
          <path d={ring(0, R.b)} class="ring red" />
        {/if}
        <path d={fieldPath(shown)} class="target" />
        {#if !generic && shown.bed !== "bull" && shown.bed !== "outerBull"}
          {#each wedges.filter((w) => !isNaN(w.lx)) as w (w.n)}
            <text x={w.lx} y={w.ly} class="num" class:own={w.own} font-size={half / 7}>{w.n}</text>
          {/each}
        {/if}
      {:else}
        {#each rings as r (r)}
          <circle cx={cx} cy={cy} r={r} class="grid" stroke-width={half / 200} />
        {/each}
        <line x1={cx - half} y1={cy} x2={cx + half} y2={cy} class="grid" stroke-width={half / 200} />
        <line x1={cx} y1={cy - half} x2={cx} y2={cy + half} class="grid" stroke-width={half / 200} />
      {/if}

      {#each points as p, i (i)}
        <circle cx={p.x} cy={p.y} r={dot} class="dart" class:hit={p.hit} />
      {/each}

      <!-- The centre of the field: the point aimed at. -->
      <g class="aim" stroke-width={half / 110}>
        <line x1={cx - tick * 2} y1={cy} x2={cx + tick * 2} y2={cy} />
        <line x1={cx} y1={cy - tick * 2} x2={cx} y2={cy + tick * 2} />
      </g>

      {#if spread && mean}
        <circle cx={mean.x} cy={mean.y} r={spread.scatter} class="scatter" stroke-width={half / 110} stroke-dasharray={`${half / 30} ${half / 45}`} />
        {#if spread.bias > 0.5}
          <line x1={cx} y1={cy} x2={mean.x} y2={mean.y} class="bias" stroke-width={half / 70} />
        {/if}
        <circle cx={mean.x} cy={mean.y} r={meanDot} class="mean" stroke-width={half / 140} />
      {/if}
    </g>
  </svg>
  <figcaption>
    <span class="key"><i class="sw dart"></i>{t("precision.legendDart")}</span>
    <span class="key"><i class="sw mean"></i>{t("precision.legendMean")}</span>
    <span class="key"><i class="sw scatter"></i>{t("precision.legendScatter")}</span>
    {#if outside}<span class="key out">{t("precision.outside", { n: num(outside) })}</span>{/if}
  </figcaption>
</figure>

<style>
  .zoom { margin: 0; }
  svg { display: block; width: 100%; height: auto; aspect-ratio: 1; border-radius: 12px; }
  /* Off the drawn segments: darker than the board's black fields, so those still show. */
  .bg { fill: #020507; }
  .single.dark { fill: var(--board-dark); }
  .single.light { fill: var(--board-light); }
  .ring.red { fill: var(--board-red); }
  .ring.green { fill: var(--board-green); }
  path { stroke: var(--board-wire); stroke-width: 0.5; fill-rule: evenodd; }
  .other { opacity: 0.7; }
  .target { fill: var(--accent); fill-opacity: 0.18; stroke: var(--accent-hi); stroke-width: 0.6; }
  .num { fill: var(--chalk); opacity: 0.6; text-anchor: middle; dominant-baseline: central; font-weight: 700; paint-order: stroke; stroke: #0a141a; stroke-width: 0.8; }
  .num.own { opacity: 1; fill: var(--accent-hi); }
  .grid { fill: none; stroke: var(--line); }
  .dart { fill: var(--dart); fill-opacity: 0.6; }
  .dart.hit { fill: var(--ok); }
  .aim line { stroke: var(--chalk); }
  .scatter { fill: rgb(34 211 238 / 0.08); stroke: var(--accent-hi); }
  .bias { stroke: var(--accent-hi); stroke-linecap: round; }
  .mean { fill: var(--accent); stroke: #0a141a; }
  figcaption { display: flex; flex-wrap: wrap; gap: 0.35rem 1rem; margin-top: 0.5rem; color: var(--dim); font-size: 0.85rem; }
  .key { display: inline-flex; align-items: center; gap: 0.35rem; }
  .sw { display: inline-block; width: 0.7rem; height: 0.7rem; border-radius: 50%; }
  .sw.dart { background: linear-gradient(90deg, var(--ok) 50%, var(--dart) 50%); }
  .sw.mean { background: var(--accent); }
  .sw.scatter { border: 1.5px dashed var(--accent-hi); }
  .out { color: var(--dart); }
</style>
