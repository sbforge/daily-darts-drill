<script lang="ts" module>
  import type { AimedDart } from "./precision";
  // A stored game never changes, so its measured darts are kept while the app runs: switching views or periods
  // only replays the games not seen yet.
  const measured = new Map<string, AimedDart[]>();
</script>

<script lang="ts">
  import * as db from "./db";
  import type { BoardField } from "./games";
  import { GAMES, gameById } from "./games";
  import { date, num, t } from "./i18n/index.svelte";
  import { log } from "./log";
  import {
    byField,
    changeNoise,
    fieldFromKey,
    GROUPS,
    groupOf,
    inScope,
    measureGame,
    radialBias,
    readSpread,
    spreadOf,
    uncertainty,
    UNSURE_MM,
    type Group,
    type Scope,
    type Spread,
  } from "./precision";
  import PrecisionHelp from "./PrecisionHelp.svelte";
  import SegmentZoom from "./SegmentZoom.svelte";
  import Select from "./Select.svelte";

  const FIXED = GAMES.filter((g) => g.fixedTargets);

  function dayInput(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  function daysAgo(n: number): Date {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d;
  }
  /** From the start of the first day to the end of the last one, local time; null for a date that isn't one. */
  function span(from: string, to: string): { from: string; to: string } | null {
    const a = new Date(`${from}T00:00`);
    const b = new Date(`${to}T00:00`);
    if (isNaN(a.getTime()) || isNaN(b.getTime())) return null;
    b.setDate(b.getDate() + 1);
    return { from: a.toISOString(), to: b.toISOString() };
  }

  // The period, by default the last 30 days; the comparison by default the 30 days before.
  let fromA = $state(dayInput(daysAgo(29)));
  let toA = $state(dayInput(new Date()));
  let compare = $state(false);
  let fromB = $state(dayInput(daysAgo(59)));
  let toB = $state(dayInput(daysAgo(30)));
  let scopeValue = $state("all");

  let darts = $state<AimedDart[]>([]);
  let loading = $state(true);
  let error = $state("");

  const spanA = $derived(span(fromA, toA));
  const spanB = $derived(compare ? span(fromB, toB) : null);
  const within = (s: { from: string; to: string } | null) => (d: AimedDart) => !!s && d.startedAt >= s.from && d.startedAt < s.to;
  const dartsA = $derived(darts.filter(within(spanA)));
  const dartsB = $derived(spanB ? darts.filter(within(spanB)) : []);

  /** Loads the darts of both periods at once; games measured before come from memory. */
  async function load() {
    const spans = [spanA, spanB].filter((s): s is { from: string; to: string } => !!s);
    if (!spans.length) return;
    const from = spans.map((s) => s.from).sort()[0];
    const to = spans.map((s) => s.to).sort().at(-1)!;
    loading = true;
    error = "";
    try {
      const games = await db.loadGameList(FIXED.map((g) => g.id), from, to);
      const missing = games.filter((g) => !measured.has(g.id));
      const turns = await db.loadTurns(missing.map((g) => g.id));
      for (const g of missing) measured.set(g.id, measureGame(gameById(g.gameId), { ...g, turns: turns.get(g.id) ?? [] }));
      darts = games.flatMap((g) => measured.get(g.id) ?? []);
    } catch (e) {
      log.error(`precision: loading failed: ${e}`);
      error = t("precision.failed", { msg: e instanceof Error ? e.message : String(e) });
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    // Reads the periods, so it loads again when one changes.
    void spanA;
    void spanB;
    load();
  });

  function fieldLabel(f: BoardField): string {
    switch (f.bed) {
      case "bull":
        return t("dart.bull");
      case "outerBull":
        return t("precision.outerBull");
      case "double":
        return `D${f.number}`;
      case "triple":
        return `T${f.number}`;
      case "outerSingle":
        return t("precision.fieldOuter", { n: f.number ?? 0 });
      case "innerSingle":
        return t("precision.fieldInner", { n: f.number ?? 0 });
    }
  }

  function scopeOf(v: string): Scope {
    if (v.startsWith("group:")) return { kind: "group", group: v.slice(6) as Group };
    if (v.startsWith("field:")) return { kind: "field", key: v.slice(6) };
    return { kind: "all" };
  }
  const scope = $derived(scopeOf(scopeValue));

  // Every field and kind of field thrown at in either period; the picked one stays even without darts.
  const fieldsA = $derived(byField(dartsA));
  const fieldsB = $derived(byField(dartsB));
  const allFields = $derived(byField([...dartsA, ...dartsB]));
  const groups = $derived(GROUPS.filter((g) => allFields.some((f) => groupOf(f.field) === g)));
  const options = $derived([
    { value: "all", label: t("precision.all") },
    ...groups.filter((g) => g !== "bull").map((g) => ({ value: `group:${g}`, label: t(`precision.group.${g}`) })),
    ...allFields.map((f) => ({ value: `field:${f.key}`, label: fieldLabel(f.field) })),
    ...(scope.kind !== "all" && ![...groups.map((g) => `group:${g}`), ...allFields.map((f) => `field:${f.key}`)].includes(scopeValue)
      ? [{ value: scopeValue, label: scope.kind === "field" ? fieldLabel(fieldFromKey(scope.key) ?? { bed: "bull" }) : t(`precision.group.${scope.group}`) }]
      : []),
  ]);

  const inA = $derived(dartsA.filter((d) => inScope(d, scope)));
  const inB = $derived(dartsB.filter((d) => inScope(d, scope)));
  const spreadA = $derived(spreadOf(inA));
  const spreadB = $derived(spreadOf(inB));
  const gamesA = $derived(new Set(inA.map((d) => d.gameResultId)).size);
  const gamesB = $derived(new Set(inB.map((d) => d.gameResultId)).size);

  /** The field the zoom draws: the picked one, a kind of field at the top of the board, or none for everything. */
  // On doubles the side of a clear tendency is named: toward the single or off the board.
  const doubles = $derived(
    (scope.kind === "group" && scope.group === "double") || (scope.kind === "field" && scope.key.startsWith("double:")),
  );
  let help = $state<PrecisionHelp>();

  const zoomField = $derived<BoardField | null>(
    scope.kind === "field"
      ? fieldFromKey(scope.key)
      : scope.kind === "group"
        ? scope.group === "bull"
          ? { bed: "bull" }
          : { bed: scope.group, number: 20 }
        : null,
  );
  // Without a board both sides use the same scale: wide enough for nine darts in ten.
  const range = $derived.by(() => {
    const d = [...inA, ...inB].map((x) => x.dist).sort((a, b) => a - b);
    const p90 = d.length ? d[Math.floor(d.length * 0.9)] : 30;
    return Math.min(120, Math.max(30, Math.ceil((p90 * 1.1) / 10) * 10));
  });
  const note = $derived(t(scope.kind === "all" ? "precision.allNote" : scope.kind === "group" && scope.group !== "bull" ? "precision.genericNote" : "precision.fieldNote"));

  const mm = (n: number) => t("precision.mm", { n: num(n, 1) });
  /** The bias in words: up to two directions, the bigger first; under 0.5 mm it is centred. */
  function biasText(s: Spread): string {
    const parts: [number, string][] = [];
    if (Math.abs(s.biasY) >= 0.5) parts.push([Math.abs(s.biasY), s.biasY > 0 ? "precision.high" : "precision.low"]);
    if (Math.abs(s.biasX) >= 0.5) parts.push([Math.abs(s.biasX), s.biasX > 0 ? "precision.right" : "precision.left"]);
    if (!parts.length) return t("precision.centred");
    return parts
      .sort((a, b) => b[0] - a[0])
      .map(([n, k]) => t(k as "precision.high", { n: num(n, 1) }))
      .join(" · ");
  }
  /** The bias as an angle for the arrow, degrees clockwise from up. */
  const biasAngle = (s: Spread) => (Math.atan2(s.biasX, s.biasY) * 180) / Math.PI;
  const periodLabel = (from: string, to: string) => `${date(`${from}T00:00`)} – ${date(`${to}T00:00`)}`;

  function pick(key: string) {
    scopeValue = `field:${key}`;
    document.querySelector(".precision")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
</script>

{#snippet arrow(s: Spread)}
  {#if Math.abs(s.biasX) >= 0.5 || Math.abs(s.biasY) >= 0.5}
    <svg class="dir" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" style={`transform: rotate(${biasAngle(s)}deg)`}>
      <path d="M8 13V3M4 7l4-4 4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  {:else}
    <svg class="dir" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><circle cx="8" cy="8" r="2.5" fill="currentColor" /></svg>
  {/if}
{/snippet}

<!-- A change smaller than chance alone could make stays grey: it says nothing yet. -->
{#snippet change(now: number, before: number, lowerIsBetter: boolean, unit: "mm" | "%", noise: number)}
  {@const diff = now - before}
  {@const good = lowerIsBetter ? diff < 0 : diff > 0}
  {@const real = Math.abs(diff) >= noise && Math.abs(diff) >= 0.05}
  <span
    class="delta"
    class:good={real && good}
    class:bad={real && !good}
    title={real ? undefined : t("precision.withinChance", { n: num(noise, 1), unit: unit === "mm" ? "mm" : "%" })}
  >
    {Math.abs(diff) < 0.05 ? "±0" : `${diff > 0 ? "+" : "−"}${num(Math.abs(diff), 1)}${unit === "mm" ? " mm" : " %"}`}{real ? "" : " ~"}
  </span>
{/snippet}

{#snippet panel(title: string, sub: string, ds: AimedDart[], s: Spread | null, games: number, other: Spread | null)}
  {@const r = s ? readSpread(s, radialBias(ds), doubles) : null}
  {@const noise = s && other ? changeNoise(s, other) : null}
  <div class="side">
    <div class="side-head">
      <strong>{title}</strong>
      <span class="plan-meta">{sub}{s ? ` · ${t("precision.games", { n: games })}` : ""}</span>
    </div>
    <SegmentZoom field={zoomField} generic={scope.kind === "group"} darts={ds} spread={s} {range} />
    {#if s && r}
      <dl class="figures">
        <div>
          <dt>{t("precision.meanDist")}</dt>
          <dd class="hero">{mm(s.meanDist)} {#if other && noise}{@render change(s.meanDist, other.meanDist, true, "mm", noise.mm)}{/if}</dd>
        </div>
        <div>
          <dt>{t("precision.bias")}</dt>
          <dd class="nowrap">{@render arrow(s)}<span>{biasText(s)}</span></dd>
          <dd class="read" data-tone={r.bias === "clear" ? "act" : r.bias === "unsure" ? "unsure" : "ok"}>
            {t(r.doubles ? `precision.read.bias.doubles.${r.doubles}` : `precision.read.bias.${r.bias}`, { n: num(uncertainty(s), 1) })}
          </dd>
        </div>
        <div>
          <dt>{t("precision.scatter")}</dt>
          <dd>{mm(s.scatter)} {#if other && noise}{@render change(s.scatter, other.scatter, true, "mm", noise.mm)}{/if}</dd>
          <dd class="read" data-tone={r.scatterRules && r.bias !== "unsure" ? "act" : "ok"}>
            {t(r.scatterRules ? "precision.read.scatter.rules" : "precision.read.scatter.minor")}
          </dd>
        </div>
        <div>
          <dt>{t("precision.hitRate")}</dt>
          <dd>{num(s.hitRate, 1)}% {#if other && noise}{@render change(s.hitRate, other.hitRate, false, "%", noise.pct)}{/if}</dd>
        </div>
        <div>
          <dt>{t("precision.darts")}</dt>
          <dd>{num(s.darts)}</dd>
        </div>
      </dl>
      <div class="verdict" data-verdict={r.verdict}>
        <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true">
          <circle cx="8" cy="8" r="6.6" fill="none" stroke="currentColor" stroke-width="1.4" />
          <circle cx="8" cy="8" r="2.4" fill="currentColor" />
        </svg>
        <p>
          <strong>{t(`precision.verdict.${r.verdict}.title`)}</strong>
          {t(`precision.verdict.${r.verdict}`, { n: num(uncertainty(s), 1) })}
        </p>
      </div>
    {:else}
      <p class="hint">{t("precision.noneInPeriod")}</p>
    {/if}
  </div>
{/snippet}

<section class="precision">
  <h2>
    {t("precision.title")}
    <button class="info" aria-label={t("precision.helpOpen")} title={t("precision.helpOpen")} onclick={() => help?.open()}>
      <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true">
        <circle cx="8" cy="8" r="6.6" fill="none" stroke="currentColor" stroke-width="1.4" />
        <circle cx="8" cy="4.9" r="0.95" fill="currentColor" />
        <path d="M8 7.3v4.4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
      </svg>
    </button>
  </h2>
  <p class="lede">{t("precision.lede", { games: FIXED.map((g) => g.name).join(", ") })}</p>

  <div class="filters">
    <fieldset>
      <legend>{t("precision.period")}</legend>
      <label>{t("history.from")} <input type="date" bind:value={fromA} max={toA} /></label>
      <label>{t("history.to")} <input type="date" bind:value={toA} min={fromA} /></label>
    </fieldset>
    {#if compare}
      <fieldset>
        <legend>{t("precision.comparePeriod")}</legend>
        <label>{t("history.from")} <input type="date" bind:value={fromB} max={toB} /></label>
        <label>{t("history.to")} <input type="date" bind:value={toB} min={fromB} /></label>
      </fieldset>
    {/if}
    <label class="check"><input type="checkbox" bind:checked={compare} /> {t("precision.compare")}</label>
    <div class="field-pick">
      <span>{t("precision.field")}</span>
      <Select label={t("precision.field")} bind:value={scopeValue} {options} />
    </div>
  </div>

  {#if error}
    <p class="error">{error}</p>
  {:else if loading && !darts.length}
    <p class="hint">{t("precision.loading")}</p>
  {:else if !dartsA.length && !dartsB.length}
    <p class="hint">{t("precision.empty")}</p>
  {:else}
    <div class="dpi">
      <p class="hint note">{note}</p>
      <div class="sides" class:two={compare}>
        {#if compare}
          {@render panel(t("precision.comparePeriod"), periodLabel(fromB, toB), inB, spreadB, gamesB, null)}
        {/if}
        {@render panel(t("precision.period"), periodLabel(fromA, toA), inA, spreadA, gamesA, compare ? spreadB : null)}
      </div>
    </div>

    <div class="dpi fields">
      <h3>{t("precision.fields")}</h3>
      <p class="hint">{t("precision.fieldsHint")}</p>
      <table>
        <thead>
          <tr>
            <th>{t("precision.field")}</th>
            <th class="n">{t("precision.darts")}</th>
            <th class="n">{t("precision.meanDist")}</th>
            <th>{t("precision.bias")}</th>
            <th class="n">{t("precision.hitRate")}</th>
            {#if compare}<th class="n">{t("precision.change")}</th>{/if}
          </tr>
        </thead>
        <tbody>
          {#each allFields as f (f.key)}
            {@const a = spreadOf(fieldsA.find((x) => x.key === f.key)?.darts ?? [])}
            {@const b = spreadOf(fieldsB.find((x) => x.key === f.key)?.darts ?? [])}
            <tr class:picked={scopeValue === `field:${f.key}`} onclick={() => pick(f.key)}>
              <td><button class="link" onclick={(e) => { e.stopPropagation(); pick(f.key); }}>{fieldLabel(f.field)}</button></td>
              <td class="n">{a ? num(a.darts) : "–"}</td>
              <td class="n">{a ? mm(a.meanDist) : "–"}</td>
              <td>
                {#if a}
                  {@const unsure = uncertainty(a) > UNSURE_MM}
                  <span class="bias-cell" class:unsure title={unsure ? t("precision.read.bias.unsure", { n: num(uncertainty(a), 1) }) : undefined}>
                    {@render arrow(a)} {biasText(a)}{unsure ? " ?" : ""}
                  </span>
                {:else}–{/if}
              </td>
              <td class="n">{a ? `${num(a.hitRate, 1)}%` : "–"}</td>
              {#if compare}
                <td class="n">{#if a && b}{@render change(a.meanDist, b.meanDist, true, "mm", changeNoise(a, b).mm)}{:else}–{/if}</td>
              {/if}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</section>

<PrecisionHelp bind:this={help} />

<style>
  .precision h2 { margin-top: 0; display: flex; align-items: center; gap: 0.4rem; }
  .info { display: grid; place-items: center; padding: 0.2rem; border: 0; border-radius: 50%; background: none; color: var(--dim); cursor: pointer; }
  .info:hover { color: var(--accent); }
  /* What a figure means: a short line under it, coloured by whether it calls for something. */
  .figures dd.nowrap { flex-wrap: nowrap; align-items: flex-start; }
  .figures dd.nowrap .dir { margin-top: 0.15rem; }
  .figures dd.read { margin-top: 0.3rem; font-size: 0.85rem; line-height: 1.35; color: var(--dim); }
  .figures dd.read[data-tone="act"] { color: var(--accent-hi); }
  .figures dd.read[data-tone="unsure"] { color: var(--dart); }
  .verdict { display: flex; gap: 0.6rem; align-items: flex-start; margin-top: 1rem; padding: 0.7rem 0.9rem; border-left: 3px solid var(--accent); border-radius: 0 8px 8px 0; background: rgb(34 211 238 / 0.08); }
  .verdict[data-verdict="unsure"] { border-color: var(--dart); background: rgb(242 193 78 / 0.08); }
  .verdict[data-verdict="unsure"] svg { color: var(--dart); }
  .verdict svg { flex: none; margin-top: 0.1rem; color: var(--accent); }
  .verdict p { margin: 0; line-height: 1.45; color: var(--dim); font-size: 0.92rem; }
  .verdict strong { display: block; color: var(--chalk); margin-bottom: 0.1rem; }
  .filters { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 0.75rem 1.25rem; margin-bottom: 1.5rem; }
  fieldset { display: flex; gap: 0.75rem; margin: 0; padding: 0.35rem 0.75rem 0.75rem; border: 1px solid var(--line); border-radius: 10px; }
  legend { padding: 0 0.35rem; color: var(--dim); font-size: 0.85rem; }
  .filters label { margin: 0; }
  label.check { flex-direction: row; align-items: center; gap: 0.5rem; padding-bottom: 0.6rem; cursor: pointer; }
  label.check input { width: 1.1rem; height: 1.1rem; accent-color: var(--accent); }
  .field-pick { display: flex; flex-direction: column; gap: 0.35rem; min-width: 14rem; font-size: 0.95rem; }
  .dpi { padding: 1.25rem 1.5rem; border: 1px solid var(--line); border-radius: 12px; background: var(--panel); margin-bottom: 1.5rem; }
  .dpi h3 { margin: 0 0 0.25rem; }
  .note { margin: 0 0 1rem; }
  .sides { display: grid; gap: 1.5rem 2rem; grid-template-columns: minmax(0, 30rem); }
  .sides.two { grid-template-columns: repeat(2, minmax(0, 30rem)); }
  @media (max-width: 720px) {
    .sides.two { grid-template-columns: minmax(0, 1fr); }
  }
  .side-head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 0.25rem 1rem; margin-bottom: 0.6rem; }
  .figures { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.75rem 1.25rem; margin: 1rem 0 0; }
  .figures div:first-child { grid-column: 1 / -1; }
  .figures dt { color: var(--dim); font-size: 0.85rem; margin-bottom: 0.15rem; }
  .figures dd { margin: 0; display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; font-variant-numeric: tabular-nums; }
  .figures dd.hero { font-size: 1.8rem; font-weight: 700; color: var(--accent); }
  .dir { flex: none; color: var(--accent-hi); }
  .delta { font-size: 0.85rem; font-weight: 600; color: var(--dim); padding: 0.05rem 0.45rem; border: 1px solid var(--line); border-radius: 999px; }
  .delta.good { color: var(--ok); border-color: rgb(74 222 128 / 0.5); }
  .delta.bad { color: #ff9b8f; border-color: rgb(255 155 143 / 0.5); }
  table { width: 100%; border-collapse: collapse; margin-top: 0.75rem; font-variant-numeric: tabular-nums; }
  th { text-align: left; color: var(--dim); font-weight: 600; font-size: 0.85rem; padding: 0.4rem 0.6rem; border-bottom: 1px solid var(--line); }
  td { padding: 0.45rem 0.6rem; border-bottom: 1px solid var(--line); }
  .n { text-align: right; }
  tbody tr { cursor: pointer; }
  tbody tr:hover { background: rgb(34 211 238 / 0.06); }
  tr.picked { background: rgb(34 211 238 / 0.12); box-shadow: inset 3px 0 0 var(--accent); }
  .bias-cell { display: inline-flex; align-items: center; gap: 0.35rem; }
  /* Too few darts to read a tendency from: shown, but marked. */
  .bias-cell.unsure { color: var(--dart); cursor: help; }
  .bias-cell.unsure .dir { color: var(--dart); }
  button.link { padding: 0; border: 0; background: none; color: var(--chalk); font: inherit; font-weight: 700; cursor: pointer; }
  button.link:hover { color: var(--accent-hi); }
</style>
