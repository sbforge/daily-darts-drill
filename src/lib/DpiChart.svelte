<script lang="ts">
  // A value over time, the performance index or a game's measured values: one dot per session (or game),
  // and a line for the current level, the average of the latest results up to each point.
  // The index has a fixed 0-100 scale, so its charts compare; other values get a scale that fits them.
  // Hover or the arrow keys pick a point.
  import type { DpiPoint } from "./dpi";
  import { date, dateTime, num, t } from "./i18n/index.svelte";

  let {
    points,
    pointLabel,
    window,
    max,
    format = (n: number) => num(n),
  }: {
    points: DpiPoint[];
    pointLabel: string;
    window: number;
    /** The top of the scale; without it the scale fits the values. */
    max?: number;
    /** How a value reads in the tooltip and at the end of the line. */
    format?: (n: number) => string;
  } = $props();

  const HEIGHT = 240;
  const PAD = { top: 14, right: 48, bottom: 28, left: 38 };

  /** A round step near `raw`: 1, 2, 2.5 or 5 times a power of ten. */
  function niceStep(raw: number): number {
    const p = 10 ** Math.floor(Math.log10(raw));
    return ([1, 2, 2.5, 5, 10].find((f) => f * p >= raw) ?? 10) * p;
  }

  // Four steps from 0 to a round top that leaves a little room above the highest value.
  const scale = $derived.by(() => {
    if (max) return { top: max, step: max / 4 };
    const high = Math.max(1, ...points.map((p) => Math.max(p.value, p.level))) * 1.05;
    const step = niceStep(high / 4);
    return { top: Math.ceil(high / step) * step, step };
  });
  const ticks = $derived(Array.from({ length: Math.round(scale.top / scale.step) + 1 }, (_, i) => i * scale.step));

  let width = $state(0);
  let active = $state<number | null>(null);

  const plotW = $derived(Math.max(0, width - PAD.left - PAD.right));
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (points.length < 2 ? plotW / 2 : (i * plotW) / (points.length - 1));
  const y = (v: number) => PAD.top + (1 - Math.min(v, scale.top) / scale.top) * plotH;
  const levelPath = $derived(points.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.level)}`).join(""));
  const last = $derived(points[points.length - 1]);
  const shown = $derived(active === null ? null : points[active]);
  // What a screen reader says for the picked point (or the latest before one is picked).
  const focusText = $derived.by(() => {
    const p = shown ?? last;
    return p ? `${dateTime(p.at)}: ${pointLabel} ${format(p.value)}, ${t("dpi.levelLine", { n: window })} ${format(p.level)}` : "";
  });

  /** The point nearest to the pointer; readers aim at a time, never at the line. */
  function pick(ev: PointerEvent) {
    const rect = (ev.currentTarget as SVGElement).getBoundingClientRect();
    const px = ev.clientX - rect.left - PAD.left;
    active = points.length < 2 ? 0 : Math.max(0, Math.min(points.length - 1, Math.round((px / plotW) * (points.length - 1))));
  }

  function keys(ev: KeyboardEvent) {
    const n = points.length;
    if (!n) return;
    const at = active ?? n - 1;
    const next =
      ev.key === "ArrowLeft" ? at - 1 : ev.key === "ArrowRight" ? at + 1 : ev.key === "Home" ? 0 : ev.key === "End" ? n - 1 : null;
    if (next === null) return;
    ev.preventDefault();
    active = Math.max(0, Math.min(n - 1, next));
  }
</script>

<div class="chart">
  <div class="legend">
    <span><span class="key dot" aria-hidden="true"></span>{pointLabel}</span>
    <span><span class="key line" aria-hidden="true"></span>{t("dpi.levelLine", { n: window })}</span>
  </div>

  <div class="plot" bind:clientWidth={width}>
    {#if width}
      <svg
        width={width}
        height={HEIGHT}
        role="slider"
        tabindex="0"
        aria-label={t("dpi.chartAria", { n: points.length, level: last ? format(last.level) : "–" })}
        aria-valuemin={1}
        aria-valuemax={points.length}
        aria-valuenow={(active ?? points.length - 1) + 1}
        aria-valuetext={focusText}
        onpointermove={pick}
        onpointerleave={() => (active = null)}
        onfocus={() => (active ??= points.length - 1)}
        onblur={() => (active = null)}
        onkeydown={keys}
      >
        {#each ticks as v (v)}
          <line class="grid" x1={PAD.left} x2={PAD.left + plotW} y1={y(v)} y2={y(v)} />
          <text class="tick" x={PAD.left - 8} y={y(v)} text-anchor="end" dominant-baseline="middle">{num(v)}</text>
        {/each}
        {#if points.length}
          <text class="tick" x={x(0)} y={HEIGHT - 8} text-anchor={points.length < 2 ? "middle" : "start"}>{date(points[0].at)}</text>
          {#if points.length > 1}
            <text class="tick" x={x(points.length - 1)} y={HEIGHT - 8} text-anchor="end">{date(last.at)}</text>
          {/if}
        {/if}

        {#if shown}
          <line class="cross" x1={x(active!)} x2={x(active!)} y1={PAD.top} y2={PAD.top + plotH} />
        {/if}
        {#each points as p, i (i)}
          <circle class="point" class:on={i === active} cx={x(i)} cy={y(p.value)} r={i === active ? 5 : 4} />
        {/each}
        <path class="level" d={levelPath} />
        {#if last}
          <circle class="end" cx={x(points.length - 1)} cy={y(last.level)} r="4" />
          <text class="end-label" x={x(points.length - 1) + 8} y={y(last.level)} dominant-baseline="middle">{format(last.level)}</text>
        {/if}
      </svg>

      {#if shown}
        <div class="tip" style:left="{Math.min(Math.max(x(active!), 90), width - 90)}px" style:top="{PAD.top}px" class:low={Math.max(shown.value, shown.level) > 55} aria-hidden="true">
          <div class="tip-date">{dateTime(shown.at)}</div>
          <div class="tip-row"><span class="key dot"></span><strong>{format(shown.value)}</strong> {pointLabel}</div>
          <div class="tip-row"><span class="key line"></span><strong>{format(shown.level)}</strong> {t("dpi.levelLine", { n: window })}</div>
        </div>
      {/if}
    {/if}
  </div>

</div>

<style>
  .chart { --point: #6b828c; }
  .legend { display: flex; gap: 1.25rem; flex-wrap: wrap; margin-bottom: 0.5rem; color: var(--dim); font-size: 0.9rem; }
  .legend > span { display: inline-flex; align-items: center; gap: 0.4rem; }
  .key { display: inline-block; flex: none; }
  .key.dot { width: 8px; height: 8px; border-radius: 50%; background: var(--point); }
  .key.line { width: 14px; height: 2px; border-radius: 1px; background: var(--accent); }
  .plot { position: relative; }
  svg { display: block; overflow: visible; touch-action: none; }
  svg:focus-visible { outline: 2px solid var(--accent); outline-offset: 4px; border-radius: 4px; }
  .grid { stroke: var(--line); stroke-width: 1; }
  .tick { fill: var(--dim); font-size: 11px; font-variant-numeric: tabular-nums; }
  .cross { stroke: var(--dim); stroke-width: 1; }
  .point { fill: var(--point); stroke: var(--panel); stroke-width: 2; }
  .point.on { fill: var(--chalk); }
  .level { fill: none; stroke: var(--accent); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
  .end { fill: var(--accent); stroke: var(--panel); stroke-width: 2; }
  .end-label { fill: var(--chalk); font-size: 12px; font-weight: 600; }
  .tip {
    position: absolute;
    transform: translateX(-50%);
    min-width: 11rem;
    padding: 0.5rem 0.7rem;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--bg);
    color: var(--dim);
    font-size: 0.85rem;
    pointer-events: none;
    box-shadow: 0 6px 18px rgb(0 0 0 / 0.4);
  }
  /* A high point would sit under the tooltip, so it moves down to the bottom of the plot. */
  .tip.low { top: auto !important; bottom: 34px; }
  .tip-date { margin-bottom: 0.25rem; }
  .tip-row { display: flex; align-items: center; gap: 0.4rem; white-space: nowrap; }
  .tip-row strong { color: var(--chalk); font-variant-numeric: tabular-nums; }
</style>
