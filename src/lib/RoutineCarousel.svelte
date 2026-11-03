<script lang="ts">
  // Cover-flow style picker for the Train view. The selected routine sits in front,
  // its neighbours turn away to the sides. It wraps around, so you can keep rotating.
  import { gameById } from "./games";
  import cardArt from "../assets/brand/art/routine-card.webp";
  import { getLocale, t } from "./i18n/index.svelte";
  import { hasEstimate, totalSeconds, type Routine } from "./store";

  let {
    routines,
    selectedId = $bindable(),
    lastPlayed,
    onstart,
    onedit,
  }: {
    routines: Routine[];
    selectedId: string;
    lastPlayed: Record<string, string>;
    onstart: () => void;
    onedit: () => void;
  } = $props();

  // The room the carousel gets, which the card size and spacing follow (see the CSS).
  let boxW = $state(0);
  let boxH = $state(0);

  const n = $derived(routines.length);
  const active = $derived(Math.max(0, routines.findIndex((r) => r.id === selectedId)));

  /** Distance of card i from the front card, taking the shortest way round the ring. */
  function offsetOf(i: number): number {
    let o = i - active;
    if (n < 3) return o;
    if (o > n / 2) o -= n;
    if (o <= -n / 2) o += n;
    return o;
  }

  // Cards that wrap from one end of the ring to the other skip the slide, so they don't fly across.
  let prevOffsets: Record<string, number> = {};
  const cards = $derived(
    routines.map((r, i) => {
      const o = offsetOf(i);
      const p = prevOffsets[r.id];
      return { r, o, jump: p !== undefined && Math.abs(o - p) > 1 };
    }),
  );
  $effect(() => {
    prevOffsets = Object.fromEntries(cards.map((c) => [c.r.id, c.o]));
  });

  function rotate(dir: -1 | 1) {
    if (n < 2) return;
    const next = n < 3 ? Math.min(n - 1, Math.max(0, active + dir)) : (active + dir + n) % n;
    selectedId = routines[next].id;
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === "ArrowLeft") rotate(-1);
    else if (e.key === "ArrowRight") rotate(1);
    // Enter on the carousel itself starts; on a focused button it is that button's click.
    else if (e.key === "Enter" && e.target === e.currentTarget && routines[active]?.items.length) onstart();
    else return;
    e.preventDefault();
  }

  // ---- games popup

  let dialog: HTMLDialogElement;
  let info = $state<Routine | null>(null);

  function showGames(r: Routine) {
    info = r;
    dialog.showModal();
  }

  /** Game time plus the breaks between games, rounded up to whole minutes. */
  function minutes(r: Routine): number {
    return Math.ceil(totalSeconds(r) / 60);
  }

  // Swipe with mouse, pen or finger.
  let dragX: number | null = null;
  function onpointerdown(e: PointerEvent) {
    dragX = e.clientX;
  }
  function onpointerup(e: PointerEvent) {
    if (dragX === null) return;
    const dx = e.clientX - dragX;
    dragX = null;
    if (Math.abs(dx) > 40) rotate(dx < 0 ? 1 : -1);
  }

  // Sideways scrolling on a trackpad, one card per gesture.
  let wheelLock = 0;
  function onwheel(e: WheelEvent) {
    if (Math.abs(e.deltaX) < Math.abs(e.deltaY) || Math.abs(e.deltaX) < 15) return;
    e.preventDefault();
    if (Date.now() < wheelLock) return;
    wheelLock = Date.now() + 450;
    rotate(e.deltaX > 0 ? 1 : -1);
  }

  function fallbackDescription(r: Routine): string {
    if (!r.items.length) return t("carousel.noGamesDesc");
    return r.items.map((it) => gameById(it.gameId).name).join(" · ");
  }

  function playedLabel(iso: string | undefined): string {
    if (!iso) return t("carousel.neverPlayed");
    const then = new Date(iso);
    const days = Math.round((startOfDay(new Date()) - startOfDay(then)) / 86_400_000);
    if (days <= 0)
      return t("carousel.today", { time: then.toLocaleTimeString(getLocale(), { hour: "2-digit", minute: "2-digit" }) });
    if (days === 1) return t("carousel.yesterday");
    if (days < 7) return t("carousel.daysAgo", { n: days });
    return then.toLocaleDateString(getLocale());
  }

  function startOfDay(d: Date): number {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  }

  /** A hue per routine, so every card gets its own board colours. */
  function hue(id: string): number {
    let h = 0;
    for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return h % 360;
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
  class="carousel"
  role="region"
  aria-roledescription="carousel"
  aria-label={t("nav.routines")}
  tabindex="0"
  {onkeydown}
  {onpointerdown}
  {onpointerup}
  onpointercancel={() => (dragX = null)}
  {onwheel}
  bind:clientWidth={boxW}
  bind:clientHeight={boxH}
  style:--cw="{boxW}px"
  style:--ch="{boxH}px"
>
  <div class="stage">
    {#each cards as { r, o, jump } (r.id)}
      {@const isFront = o === 0}
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
      <div
        class="card"
        class:front={isFront}
        class:jump
        class:hidden={Math.abs(o) > 2}
        style:--o={o}
        style:--abs={Math.abs(o)}
        style:z-index={10 - Math.abs(o)}
        aria-current={isFront ? "true" : undefined}
        onclick={() => (selectedId = r.id)}
      >
        <div class="art" aria-hidden="true">
          <img class="board" src={cardArt} alt="" draggable="false" style:--tint={`${hue(r.id) - 190}deg`} />
          <span class="count">{r.items.length === 1 ? t("carousel.game") : t("carousel.games", { n: r.items.length })}</span>
        </div>
        <button
          class="info"
          aria-label={t("carousel.gamesIn", { name: r.name || t("common.untitled") })}
          title={t("carousel.showGames")}
          tabindex={isFront ? 0 : -1}
          onclick={(e) => {
            e.stopPropagation();
            showGames(r);
          }}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path
              fill="currentColor"
              d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16Zm-1-11h2v7h-2V9Zm0-4h2v2h-2V5Z"
            />
          </svg>
        </button>
        <button
          class="info edit"
          aria-label={t("carousel.edit", { name: r.name || t("common.untitled") })}
          title={t("carousel.editTitle")}
          tabindex={isFront ? 0 : -1}
          onclick={(e) => {
            e.stopPropagation();
            onedit();
          }}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path
              fill="currentColor"
              d="M3 17.25V21h3.75L17.8 9.94l-3.75-3.75L3 17.25ZM20.7 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83Z"
            />
          </svg>
        </button>
        <div class="body">
          <h3>{r.name || t("common.untitled")}</h3>
          <p class="desc" class:auto={!r.description?.trim()}>{r.description?.trim() || fallbackDescription(r)}</p>
          <p class="played" class:never={!lastPlayed[r.id]}>
            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
              <path
                fill="currentColor"
                d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16Zm.5-13H11v6l5.2 3.2.8-1.3-4.5-2.7V7Z"
              />
            </svg>
            {playedLabel(lastPlayed[r.id])}
          </p>
          <button
            class="start"
            tabindex={isFront ? 0 : -1}
            class:empty={r.items.length === 0}
            onclick={(e) => {
              e.stopPropagation();
              if (!isFront) selectedId = r.id;
              else if (r.items.length === 0) onedit();
              else onstart();
            }}
          >
            {r.items.length === 0 ? t("carousel.addGames") : t("train.start")}
          </button>
        </div>
      </div>
    {/each}

    {#if n > 1}
      <button class="arrow left" aria-label={t("carousel.previous")} onclick={() => rotate(-1)} disabled={n < 3 && active === 0}>
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M15.4 5.4 14 4l-8 8 8 8 1.4-1.4L8.8 12z" /></svg>
      </button>
      <button
        class="arrow right"
        aria-label={t("carousel.next")}
        onclick={() => rotate(1)}
        disabled={n < 3 && active === n - 1}
      >
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M8.6 5.4 10 4l8 8-8 8-1.4-1.4 6.6-6.6z" /></svg>
      </button>
    {/if}
  </div>

  {#if n > 1}
    <div class="dots" aria-hidden="true">
      {#each routines as r, i (r.id)}
        <button class="dot" class:on={i === active} tabindex="-1" aria-label={r.name || t("common.untitled")} onclick={() => (selectedId = r.id)}></button>
      {/each}
    </div>
  {/if}
  <p class="sr" aria-live="polite">{routines[active]?.name ?? ""}</p>
</div>

<!-- Outside the carousel, so its keys and swipes don't rotate the cards behind the popup. -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<dialog
  class="games"
  bind:this={dialog}
  onclose={() => (info = null)}
  onclick={(e) => {
    if (e.target === dialog) dialog.close();
  }}
>
  {#if info}
    <div class="sheet">
      <div class="sheet-head">
        <h3>{info.name || t("common.untitled")}</h3>
        <button class="close" aria-label={t("carousel.close")} onclick={() => dialog.close()}>
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path fill="currentColor" d="M18.3 5.7 16.9 4.3 12 9.2 7.1 4.3 5.7 5.7 10.6 12l-4.9 4.9 1.4 1.4 4.9-4.9 4.9 4.9 1.4-1.4-4.9-4.9z" />
          </svg>
        </button>
      </div>
      {#if info.items.length}
        <ol>
          {#each info.items as it, i (i)}
            {@const g = gameById(it.gameId)}
            <li>
              <span class="g-name">{g.name}</span>
              <span class="g-min">{it.minutes > 0 ? t("common.minutes", { n: it.minutes }) : t("routines.untilDone")}</span>
              <span class="g-desc">{g.describe(it.settings)}</span>
            </li>
          {/each}
        </ol>
        <p class="note">
          {t(hasEstimate(info) ? "train.totalEstimate" : "train.total", { n: minutes(info) })}
        </p>
      {:else}
        <p class="note">{t("train.noGames")}</p>
      {/if}
    </div>
  {/if}
</dialog>

<style>
  /* Fills whatever height the Train view gives it; the cards scale with it. */
  .carousel {
    position: relative;
    flex: 1;
    min-height: 26rem;
    display: flex;
    flex-direction: column;
    justify-content: center;
    border-radius: 12px;
    touch-action: pan-y;
    user-select: none;
    --h: clamp(20rem, calc(var(--ch) - 4.5rem), 36rem);
    --w: min(calc(var(--h) * 0.68), calc(var(--cw) * 0.7));
    --card-h: min(var(--h), calc(var(--w) / 0.68));
    /* How far each neighbour sits from the front card; wider screens spread them out. */
    --step: clamp(calc(var(--w) * 0.62), calc(var(--cw) * 0.22), calc(var(--w) * 1.05));
  }
  .carousel:focus-visible { outline-offset: 6px; }

  .stage {
    position: relative;
    height: calc(var(--card-h) + 2rem);
    perspective: 1100px;
    overflow: hidden;
  }

  .card {
    position: absolute;
    top: 1rem;
    left: calc(50% - var(--w) / 2);
    width: var(--w);
    height: var(--card-h);
    padding: 0;
    container-type: size;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    text-align: left;
    font: inherit;
    color: var(--chalk);
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 14px;
    overflow: hidden;
    cursor: pointer;
    transform:
      translateX(calc(var(--o) * var(--step)))
      translateZ(calc(var(--abs) * -9rem))
      rotateY(calc(var(--o) * -38deg));
    opacity: calc(1 - var(--abs) * 0.3);
    filter: brightness(calc(1 - var(--abs) * 0.25));
    box-shadow: 0 18px 40px rgb(0 0 0 / 0.45);
    transition: transform 420ms cubic-bezier(0.22, 0.8, 0.3, 1), opacity 420ms, filter 420ms, border-color 200ms;
  }
  .card.front {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent), 0 22px 50px rgb(0 0 0 / 0.55), 0 0 40px rgb(34 211 238 / 0.18);
    cursor: default;
  }
  .card:not(.front):hover { filter: brightness(calc(1.1 - var(--abs) * 0.25)); }
  .card.hidden { opacity: 0; pointer-events: none; }
  .card.jump { transition: none; animation: fade-in 420ms ease-out; }
  /* Only the front card offers its buttons; the others keep the space so all cards match. */
  .card:not(.front) .info,
  .card:not(.front) .start { visibility: hidden; }
  @keyframes fade-in { from { opacity: 0; } }

  .art {
    position: relative;
    width: 100%;
    height: 39cqh;
    flex: none;
    overflow: hidden;
  }
  /* The card artwork, which is cyan from the start and turned to the routine's hue. */
  .board {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    user-select: none;
    filter: hue-rotate(var(--tint));
  }
  .count {
    position: absolute;
    left: 0.85rem;
    bottom: 0.7rem;
    font-size: 0.8rem;
    font-weight: 600;
    padding: 0.15rem 0.55rem;
    border-radius: 999px;
    background: rgb(6 13 18 / 0.7);
    color: var(--chalk);
  }

  .body { width: 100%; display: flex; flex-direction: column; gap: 0.45rem; padding: 0.9rem 1rem 1rem; flex: 1; min-height: 0; }
  h3 { margin: 0; font-size: 1.15rem; line-height: 1.25; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .desc {
    margin: 0;
    color: var(--dim);
    font-size: 0.9rem;
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .desc.auto { font-style: italic; }
  .played {
    margin: auto 0 0;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.85rem;
    color: var(--accent);
  }
  .played.never { color: var(--dim); }

  .info {
    position: absolute;
    top: 0.6rem;
    left: 0.6rem;
    display: grid;
    place-items: center;
    width: 2rem;
    height: 2rem;
    padding: 0;
    border: 1px solid rgb(255 255 255 / 0.15);
    border-radius: 50%;
    background: rgb(6 13 18 / 0.7);
    color: var(--chalk);
    cursor: pointer;
  }
  .info:hover { color: var(--accent); border-color: var(--accent); }
  .info.edit { left: auto; right: 0.6rem; }

  .start {
    margin-top: 0.4rem;
    width: 100%;
    font: inherit;
    font-weight: 600;
    padding: 0.6rem 1rem;
    border: 0;
    border-radius: 8px;
    background: var(--accent);
    color: var(--on-accent, #04161c);
    cursor: pointer;
  }
  .start:hover { background: var(--accent-hi, #67e8f9); }
  /* An empty routine can't start yet; its button leads to the editor instead. */
  .start.empty { background: none; color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); }
  .start.empty:hover { background: rgb(34 211 238 / 0.1); }

  .arrow {
    position: absolute;
    top: calc(50% - 1.4rem);
    z-index: 20;
    display: grid;
    place-items: center;
    width: 2.8rem;
    height: 2.8rem;
    border-radius: 50%;
    border: 1px solid var(--line);
    background: rgb(13 27 35 / 0.85);
    color: var(--chalk);
    cursor: pointer;
    backdrop-filter: blur(4px);
  }
  .arrow:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
  .arrow.left { left: 0.25rem; }
  .arrow.right { right: 0.25rem; }

  .dots { display: flex; justify-content: center; gap: 0.45rem; margin-top: 0.6rem; }
  .dot {
    width: 0.5rem;
    height: 0.5rem;
    padding: 0;
    border: 0;
    border-radius: 999px;
    background: var(--line);
    cursor: pointer;
    transition: width 250ms, background 250ms;
  }
  .dot.on { width: 1.4rem; background: var(--accent); }

  .games {
    width: min(30rem, calc(100vw - 2rem));
    max-height: min(36rem, calc(100dvh - 4rem));
    padding: 0;
    border: 1px solid var(--line);
    border-radius: 14px;
    background: var(--panel);
    color: var(--chalk);
    box-shadow: 0 30px 80px rgb(0 0 0 / 0.6);
  }
  .games::backdrop { background: rgb(2 6 9 / 0.65); backdrop-filter: blur(3px); }
  .sheet { padding: 1.1rem 1.25rem 1.25rem; }
  .sheet-head { display: flex; justify-content: space-between; align-items: center; gap: 1rem; margin-bottom: 0.75rem; }
  .sheet-head h3 { white-space: normal; }
  .close {
    display: grid;
    place-items: center;
    width: 2rem;
    height: 2rem;
    padding: 0;
    border: 0;
    border-radius: 6px;
    background: none;
    color: var(--dim);
    cursor: pointer;
  }
  .close:hover { color: var(--chalk); background: var(--bg); }
  .games ol { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--line); }
  .games li {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 0.1rem 1rem;
    padding: 0.65rem 0;
    border-bottom: 1px solid var(--line);
  }
  .g-name { font-weight: 600; }
  .g-min { color: var(--dim); }
  .g-desc { grid-column: 1 / -1; color: var(--dim); font-size: 0.9rem; }
  .note { color: var(--dim); font-size: 0.9rem; line-height: 1.45; margin: 0.9rem 0 0; }

  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); margin: 0; }

</style>
