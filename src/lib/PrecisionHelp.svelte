<script lang="ts" module>
  // The examples are drawn from fixed made-up darts, so they look the same every time.
  function cloud(n: number, seed: number, sx: number, sy: number, mx: number, my: number): { x: number; y: number }[] {
    let s = seed;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const gauss = () => Math.sqrt(-2 * Math.log(rnd() || 1e-9)) * Math.cos(2 * Math.PI * rnd());
    return Array.from({ length: n }, () => ({ x: mx + gauss() * sx, y: my + gauss() * sy }));
  }
  const mean = (ps: { x: number; y: number }[]) => ({
    x: ps.reduce((a, p) => a + p.x, 0) / ps.length,
    y: ps.reduce((a, p) => a + p.y, 0) / ps.length,
  });
  /** A cloud whose average point is exactly where the example says. */
  function centred(ps: { x: number; y: number }[], mx: number, my: number) {
    const m = mean(ps);
    return ps.map((p) => ({ x: p.x - m.x + mx, y: p.y - m.y + my }));
  }
  // SVG coordinates, mm, +y down.
  const AIM_OFF = centred(cloud(24, 11, 3, 3, 0, 0), 9, 7);
  const REPEAT = centred(cloud(24, 23, 10, 10, 0, 0), 0.6, -0.4);
  const INSIDE = centred(cloud(18, 5, 7, 3.2, 0, 0), 0, 4.5);
  const OUTSIDE = centred(cloud(18, 5, 7, 3.2, 0, 0), 0, -4.5);
  const SAMPLES = [10, 30, 100].map((n, i) => ({ n, pts: cloud(n, 31 + i, 15, 15, 0, 0) }));
</script>

<script lang="ts">
  import { num, t } from "./i18n/index.svelte";
  import { MM, R } from "./precision";

  let dialog = $state<HTMLDialogElement>();
  export function open() {
    dialog?.showModal();
    // The focus goes to the button at the end; the text still starts at the top.
    if (dialog) dialog.scrollTop = 0;
  }

  // The top of D20 for the doubles example: the double ring with the single below and the edge of the board above.
  const D = (MM * (R.dbl0 + R.dbl1)) / 2;
  function arc(r0: number, r1: number): string {
    const p = (r: number, deg: number) => {
      const a = (deg * Math.PI) / 180;
      return `${r * Math.sin(a)} ${-r * Math.cos(a)}`;
    };
    return `M${p(r1, -9)} A${r1} ${r1} 0 0 1 ${p(r1, 9)} L${p(r0, 9)} A${r0} ${r0} 0 0 0 ${p(r0, -9)} Z`;
  }
  const single = arc(MM * R.tri1, MM * R.dbl0);
  const double = arc(MM * R.dbl0, MM * R.dbl1);
</script>

{#snippet target(pts: { x: number; y: number }[], half = 30, ring = 0)}
  {@const m = mean(pts)}
  <svg viewBox={`${-half} ${-half} ${2 * half} ${2 * half}`} aria-hidden="true">
    <rect x={-half} y={-half} width={2 * half} height={2 * half} rx="4" class="bg" />
    {#each [10, 20] as r (r)}<circle {r} class="grid" />{/each}
    <line x1={-half} y1="0" x2={half} y2="0" class="grid" />
    <line x1="0" y1={-half} x2="0" y2={half} class="grid" />
    {#each pts as p, i (i)}<circle cx={p.x} cy={p.y} r="1.3" class="dot" />{/each}
    <path d="M-3 0h6M0 -3v6" class="aim" />
    {#if ring}<circle cx={m.x} cy={m.y} r={ring} class="unsure" />{/if}
    {#if Math.hypot(m.x, m.y) > 1}<line x1="0" y1="0" x2={m.x} y2={m.y} class="bias" />{/if}
    <circle cx={m.x} cy={m.y} r="2.2" class="mean" />
  </svg>
{/snippet}

{#snippet doubleRing(pts: { x: number; y: number }[])}
  {@const m = mean(pts)}
  <svg viewBox={`-22 ${-D - 16} 44 32`} aria-hidden="true">
    <rect x="-22" y={-D - 16} width="44" height="32" rx="4" class="bg" />
    <path d={single} class="board-single" />
    <path d={double} class="board-double" />
    <text x="-20" y={-D - 11} class="zone">{t("precision.help.offBoard")}</text>
    <text x="-20" y={-D + 13} class="zone">{t("precision.help.single")}</text>
    {#each pts as p, i (i)}<circle cx={p.x} cy={p.y - D} r="0.9" class="dot" />{/each}
    <path d={`M-2 ${-D}h4M0 ${-D - 2}v4`} class="aim" />
    <circle cx={m.x} cy={m.y - D} r="1.4" class="mean" />
  </svg>
{/snippet}

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<dialog
  class="confirm precision-help"
  bind:this={dialog}
  aria-labelledby="precision-help-title"
  onclick={(e) => {
    if (e.target === dialog) dialog?.close();
  }}
>
  <h3 id="precision-help-title">{t("precision.help.title")}</h3>
  <p>{t("precision.help.intro")}</p>

  <h4>{t("precision.help.drawingTitle")}</h4>
  <ul class="legend">
    <li><i class="sw aim"></i>{t("precision.help.drawingAim")}</li>
    <li><i class="sw dot"></i>{t("precision.help.drawingDarts")}</li>
    <li><i class="sw mean"></i>{t("precision.help.drawingMean")}</li>
    <li><i class="sw scatter"></i>{t("precision.help.drawingScatter")}</li>
  </ul>

  <h4>{t("precision.help.twoTitle")}</h4>
  <p>{t("precision.help.two")}</p>
  <div class="examples two">
    <figure>
      {@render target(AIM_OFF)}
      <figcaption><strong>{t("precision.help.aimTitle")}</strong>{t("precision.help.aim")}</figcaption>
    </figure>
    <figure>
      {@render target(REPEAT)}
      <figcaption><strong>{t("precision.help.repeatTitle")}</strong>{t("precision.help.repeat")}</figcaption>
    </figure>
  </div>
  <p>{t("precision.help.rule")}</p>

  <h4>{t("precision.help.patternsTitle")}</h4>
  <p>{t("precision.help.patterns")}</p>

  <h4>{t("precision.help.doublesTitle")}</h4>
  <p>{t("precision.help.doubles")}</p>
  <div class="examples two">
    <figure>
      {@render doubleRing(INSIDE)}
      <figcaption><strong>{t("precision.help.insideTitle")}</strong>{t("precision.help.inside")}</figcaption>
    </figure>
    <figure>
      {@render doubleRing(OUTSIDE)}
      <figcaption><strong>{t("precision.help.outsideTitle")}</strong>{t("precision.help.outside")}</figcaption>
    </figure>
  </div>
  <p>{t("precision.help.doublesYours")}</p>

  <h4>{t("precision.help.howManyTitle")}</h4>
  <p>{t("precision.help.howMany")}</p>
  <div class="examples three">
    {#each SAMPLES as s (s.n)}
      <figure>
        {@render target(s.pts, 30, 15 / Math.sqrt(s.n))}
        <figcaption><strong>{t("precision.help.sample", { n: s.n })}</strong>± {num(15 / Math.sqrt(s.n), 1)} mm</figcaption>
      </figure>
    {/each}
  </div>
  <p>{t("precision.help.howManyRule")}</p>

  <h4>{t("precision.help.countsTitle")}</h4>
  <p>{t("precision.help.counts")}</p>

  <h4>{t("precision.help.compareTitle")}</h4>
  <p>{t("precision.help.compare")}</p>

  <div class="foot">
    <button class="primary" onclick={() => dialog?.close()}>{t("dpi.helpClose")}</button>
  </div>
</dialog>

<style>
  .precision-help { width: min(40rem, calc(100vw - 2rem)); max-height: calc(100vh - 4rem); overflow-y: auto; line-height: 1.5; }
  h4 { margin: 1.3rem 0 0.3rem; }
  p { margin: 0.3rem 0; color: var(--dim); }
  .foot { margin-top: 1.25rem; }
  .legend { margin: 0.3rem 0; padding: 0; list-style: none; color: var(--dim); display: grid; gap: 0.3rem; }
  .legend li { display: flex; align-items: center; gap: 0.55rem; }
  .sw { flex: none; display: inline-block; width: 0.8rem; height: 0.8rem; border-radius: 50%; }
  .sw.aim { border-radius: 0; background: linear-gradient(var(--chalk), var(--chalk)) center / 100% 2px no-repeat, linear-gradient(var(--chalk), var(--chalk)) center / 2px 100% no-repeat; }
  .sw.dot { background: linear-gradient(90deg, var(--ok) 50%, var(--dart) 50%); }
  .sw.mean { background: var(--accent); }
  .sw.scatter { border: 1.5px dashed var(--accent-hi); }
  .examples { display: grid; gap: 1rem; margin: 0.75rem 0; }
  .examples.two { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .examples.three { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  figure { margin: 0; }
  figure svg { display: block; width: 100%; height: auto; }
  figcaption { margin-top: 0.4rem; font-size: 0.85rem; color: var(--dim); line-height: 1.4; }
  figcaption strong { display: block; color: var(--chalk); }
  .bg { fill: #020507; }
  .grid { fill: none; stroke: var(--line); stroke-width: 0.4; }
  .dot { fill: var(--dart); fill-opacity: 0.75; }
  .aim { stroke: var(--chalk); stroke-width: 0.6; fill: none; }
  .bias { stroke: var(--accent-hi); stroke-width: 0.9; stroke-linecap: round; }
  .mean { fill: var(--accent); stroke: #020507; stroke-width: 0.4; }
  .unsure { fill: rgb(34 211 238 / 0.12); stroke: var(--accent-hi); stroke-width: 0.5; stroke-dasharray: 1.4 1; }
  /* The single is drawn light here so it stands apart from the edge of the board. */
  .board-single { fill: var(--board-light); fill-opacity: 0.35; stroke: var(--board-wire); stroke-width: 0.3; }
  .zone { fill: var(--dim); font-size: 2.6px; font-weight: 600; }
  .board-double { fill: var(--board-red); stroke: var(--board-wire); stroke-width: 0.3; }
  @media (max-width: 520px) {
    .examples.three { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
</style>
