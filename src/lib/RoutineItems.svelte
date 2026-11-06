<script lang="ts">
  // The game list of the routine editor. Each game folds down to its name and time cap,
  // and the games are put in order by dragging their handle (or with the arrow keys on it).
  // Dragging uses pointer events rather than HTML drag and drop, which Tauri takes over for file drops.
  import { tick } from "svelte";
  import { flip } from "svelte/animate";
  import { SvelteSet } from "svelte/reactivity";
  import AddGameDialog from "./AddGameDialog.svelte";
  import GameField from "./GameField.svelte";
  import { gameById, type GameDef } from "./games";
  import { t } from "./i18n/index.svelte";
  import type { RoutineItem } from "./store";

  let { items, totalSeconds }: { items: RoutineItem[]; totalSeconds: number } = $props();

  const total = $derived.by(() => {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return s ? t("routines.durationSeconds", { m, s }) : t("routines.duration", { m });
  });

  const open = new SvelteSet<RoutineItem>();
  const allOpen = $derived(items.length > 0 && items.every((it) => open.has(it)));

  let list = $state<HTMLElement>();
  let addDialog = $state<AddGameDialog>();

  /** Its settings were made in the dialog, so the new game joins folded, scrolled into view. */
  async function addGame(item: RoutineItem) {
    items.push(item);
    await tick();
    list?.lastElementChild?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  function remove(i: number) {
    open.delete(items[i]);
    items.splice(i, 1);
  }

  function toggle(it: RoutineItem) {
    if (open.has(it)) open.delete(it);
    else open.add(it);
  }

  function toggleAll() {
    if (allOpen) open.clear();
    else items.forEach((it) => open.add(it));
  }

  /** The settings in one line, shown while a game is folded. */
  function summary(g: GameDef, it: RoutineItem): string {
    return g.fields
      .map((f) => {
        const v = it.settings[f.key];
        if (f.kind === "select") return f.options?.find((o) => o.value === v)?.label ?? String(v);
        // A checkbox shows up only when it is on.
        if (f.kind === "checkbox") return v === "on" ? f.label : "";
        return `${f.label} ${v}`;
      })
      .filter(Boolean)
      .join(" · ");
  }

  function moveTo(from: number, to: number) {
    const [it] = items.splice(from, 1);
    items.splice(to, 0, it);
  }

  // ---- dragging

  let drag = $state<{ item: RoutineItem; dy: number } | null>(null);
  let index = 0;
  let startY = 0;
  let pointerY = 0;
  let scroller: HTMLElement | null = null;
  let startScroll = 0;
  let frame = 0;
  // Card heights in list order and the space between cards, measured when a drag starts.
  let heights: number[] = [];
  let gap = 0;

  function startDrag(e: PointerEvent, i: number) {
    if (e.button !== 0) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    index = i;
    startY = pointerY = e.clientY;
    scroller = list?.closest("main") ?? null;
    startScroll = scroller?.scrollTop ?? 0;
    const els = [...(list?.children ?? [])] as HTMLElement[];
    heights = els.map((el) => el.offsetHeight);
    gap = els.length > 1 ? els[1].offsetTop - els[0].offsetTop - els[0].offsetHeight : 0;
    drag = { item: items[i], dy: 0 };
    frame = requestAnimationFrame(step);
  }

  function moveDrag(e: PointerEvent) {
    if (!drag) return;
    pointerY = e.clientY;
    follow();
  }

  function endDrag() {
    if (!drag) return;
    cancelAnimationFrame(frame);
    follow();
    drag = null;
  }

  /** Runs every frame while dragging, so holding the pointer near an edge keeps scrolling. */
  function step() {
    if (!drag) return;
    if (scroller) {
      const r = scroller.getBoundingClientRect();
      const edge = 48;
      if (pointerY < r.top + edge) scroller.scrollTop -= Math.ceil((r.top + edge - pointerY) / 4);
      else if (pointerY > r.bottom - edge) scroller.scrollTop += Math.ceil((pointerY - r.bottom + edge) / 4);
    }
    follow();
    frame = requestAnimationFrame(step);
  }

  /** Moves the dragged game past every neighbour it is more than halfway over. */
  function follow() {
    if (!drag) return;
    let dy = pointerY - startY + (scroller?.scrollTop ?? 0) - startScroll;
    for (;;) {
      const to = dy > 0 ? index + 1 : index - 1;
      const h = heights[to];
      // Half of the distance the swap moves the card, so a swap never undoes itself on the next pass.
      if (h === undefined || !(Math.abs(dy) > (h + gap) / 2)) break;
      const shift = Math.sign(dy) * (h + gap);
      moveTo(index, to);
      [heights[index], heights[to]] = [heights[to], heights[index]];
      index = to;
      startY += shift;
      dy -= shift;
    }
    drag.dy = dy;
  }

  async function handleKey(e: KeyboardEvent, i: number) {
    const to = e.key === "ArrowUp" ? i - 1 : e.key === "ArrowDown" ? i + 1 : -1;
    if (to < 0 || to >= items.length) return;
    e.preventDefault();
    const handle = e.currentTarget as HTMLElement;
    moveTo(i, to);
    await tick();
    handle.focus();
  }

  // A game that can't end by itself (e.g. Solo Leg set back to "until the time is up") needs its time cap again.
  $effect(() => {
    for (const it of items) {
      const g = gameById(it.gameId);
      if (g.noTimeCap) {
        if (it.minutes !== 0) it.minutes = 0;
      } else if (!(it.minutes > 0) && !g.canEnd?.(it.settings)) it.minutes = g.defaultMinutes;
    }
  });
</script>

<div class="list-head">
  <span class="hint">
    {#if items.length}
      {t("routines.gamesCount", { n: items.length })} · <span class="total" title={t("routines.totalHint")}>{total}</span>
    {:else}
      {t("routines.empty")}
    {/if}
  </span>
  <button class="ghost small add" onclick={() => addDialog?.open()} aria-label={t("routines.addGame")} title={t("routines.addGame")}>
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
    </svg>
  </button>
  {#if items.length > 1}
    <button class="ghost small" onclick={toggleAll}>{allOpen ? t("routines.collapseAll") : t("routines.expandAll")}</button>
  {/if}
</div>

<ol class="items" bind:this={list}>
  {#each items as it, i (it)}
    {@const g = gameById(it.gameId)}
    {@const isOpen = open.has(it)}
    {@const dragging = drag?.item === it}
    <li
      class="item"
      class:dragging
      style:transform={dragging ? `translateY(${drag?.dy}px)` : undefined}
      animate:flip={{ duration: dragging ? 0 : 160 }}
    >
      <div class="item-head">
        <button
          class="handle"
          aria-label={t("routines.reorder", { name: g.name })}
          title={t("routines.reorderHint")}
          onpointerdown={(e) => startDrag(e, i)}
          onpointermove={moveDrag}
          onpointerup={endDrag}
          onpointercancel={endDrag}
          onkeydown={(e) => handleKey(e, i)}
        >
          <svg viewBox="0 0 10 16" width="10" height="16" aria-hidden="true">
            {#each [3, 8, 13] as y (y)}
              <circle cx="2.5" cy={y} r="1.4" /><circle cx="7.5" cy={y} r="1.4" />
            {/each}
          </svg>
        </button>
        <button class="toggle" aria-expanded={isOpen} onclick={() => toggle(it)}>
          <svg class="chevron" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
            <path d="M4 2.5 7.5 6 4 9.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
          </svg>
          <span class="pos">{i + 1}</span>
          <strong>{g.name}</strong>
          {#if !isOpen && g.fields.length}
            <span class="summary">{summary(g, it)}</span>
          {/if}
        </button>
        {#if g.noTimeCap}
          <span class="minutes" title={t("routines.toTheEndInfo")}>{t("routines.untilDone")}</span>
        {:else if g.canEnd?.(it.settings)}
          <label class="nocap" title={t("routines.noCapInfo")}>
            <input type="checkbox" checked={!(it.minutes > 0)} onchange={(e) => (it.minutes = e.currentTarget.checked ? 0 : g.defaultMinutes)} />
            <span>{t("routines.noCap")}</span>
          </label>
        {/if}
        {#if !g.noTimeCap && (it.minutes > 0 || !g.canEnd?.(it.settings))}
          <label class="minutes">
            <input type="number" min="1" max="120" bind:value={it.minutes} aria-label={t("routines.timeCap")} />
            <span>{t("routines.minutesUnit")}</span>
          </label>
        {/if}
      </div>
      {#if isOpen}
        <div class="body">
          {#if g.fields.length}
            <div class="fields">
              {#each g.fields as f (f.key)}
                <GameField field={f} bind:value={it.settings[f.key]} />
              {/each}
            </div>
          {:else}
            <p class="hint">{t("routines.noSettings")}</p>
          {/if}
          <div class="body-foot">
            <button class="ghost small danger" onclick={() => remove(i)}>{t("routines.remove")}</button>
          </div>
        </div>
      {/if}
    </li>
  {/each}
</ol>

<AddGameDialog bind:this={addDialog} onadd={addGame} />

<style>
  .list-head { display: flex; align-items: center; gap: 0.5rem; margin: 0 0 0.6rem; }
  .list-head .hint { margin: 0; }
  .total { color: var(--chalk); font-variant-numeric: tabular-nums; }
  .add { display: grid; place-items: center; margin-right: auto; padding: 0.3rem 0.45rem; color: var(--accent); }
  .items { list-style: none; padding: 0; margin: 0; }
  .item {
    position: relative;
    border: 1px solid var(--line);
    border-radius: 8px;
    margin-bottom: 0.5rem;
    background: var(--panel);
    /* Lets a dropped card settle into its place instead of jumping. */
    transition: transform 0.15s, box-shadow 0.15s;
  }
  .item.dragging {
    z-index: 2;
    transition: none;
    border-color: var(--accent);
    box-shadow: 0 10px 28px rgb(0 0 0 / 0.45);
  }
  .item-head { display: flex; align-items: center; gap: 0.25rem; padding: 0.35rem 0.6rem 0.35rem 0.25rem; }

  .handle {
    flex: none;
    display: grid;
    place-items: center;
    width: 2rem;
    height: 2.25rem;
    border: 0;
    border-radius: 6px;
    background: none;
    color: var(--dim);
    cursor: grab;
    touch-action: none;
  }
  .handle svg { fill: currentColor; }
  .handle:hover { color: var(--chalk); background: var(--bg); }
  .dragging .handle { cursor: grabbing; color: var(--accent); }

  .toggle {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: baseline;
    gap: 0.6rem;
    padding: 0.45rem 0.4rem;
    border: 0;
    border-radius: 6px;
    background: none;
    color: var(--chalk);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .toggle:hover { background: var(--bg); }
  .chevron { flex: none; align-self: center; color: var(--dim); transition: transform 0.15s; }
  .toggle[aria-expanded="true"] .chevron { transform: rotate(90deg); }
  .pos { flex: none; color: var(--dim); font-variant-numeric: tabular-nums; min-width: 1.1rem; }
  strong { flex: none; }
  .summary { min-width: 0; color: var(--dim); font-size: 0.9rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  .nocap { flex: none; display: flex; flex-direction: row; align-items: center; gap: 0.35rem; margin: 0 0.5rem 0 0; color: var(--dim); font-size: 0.85rem; }
  .minutes { flex: none; flex-direction: row; align-items: center; gap: 0.4rem; margin: 0; color: var(--dim); font-size: 0.9rem; }
  .minutes input { width: 4.2rem; padding: 0.35rem 0.5rem; text-align: right; }

  .body { padding: 0.5rem 1rem 0.6rem 2.6rem; border-top: 1px solid var(--line); }
  .body .hint { margin: 0.4rem 0 0; }
  .fields { display: grid; grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr)); gap: 0 1rem; padding-top: 0.5rem; }
  .body-foot { display: flex; justify-content: flex-end; }
  .item { --field-bg: var(--bg); }
  .item :global(input) { background: var(--bg); }
</style>
