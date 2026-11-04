<script lang="ts">
  // "Game shot": lies over the board from the checkout dart until the takeout. Darts thrown
  // now don't count; the overlay says what comes next. It is driven by the game's result, not by the fx queue,
  // so it can't be skipped or dropped: it goes away when the turn is closed (takeout or "next turn").
  import { fade } from "svelte/transition";
  import { fx } from "./fx";
  import { t } from "./i18n/index.svelte";

  let {
    next,
    moment = "",
    pulling = false,
  }: {
    /** What comes after the takeout ("Leg 3 next", "Last leg", ...). */
    next: string;
    /** The game's own moment of this checkout ("Ton out!", ...), shown as a line of its own. */
    moment?: string;
    /** Autodarts sees the hand pulling the darts. */
    pulling?: boolean;
  } = $props();

  const ms = $derived(fx.enabled ? 250 : 0);
</script>

<div class="shot" role="status" in:fade={{ duration: ms }} out:fade={{ duration: ms }}>
  <div class="card">
    <span class="title">{t("shot.title")}</span>
    {#if moment}<span class="moment">{moment}</span>{/if}
    <span class="next">{next}</span>
    <span class="pull" class:pulling>{pulling ? t("shot.pulling") : t("shot.pull")}</span>
  </div>
</div>

<style>
  .shot {
    position: absolute;
    inset: 0;
    z-index: 5;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: radial-gradient(closest-side, rgba(6, 13, 18, 0.88), rgba(6, 13, 18, 0.62));
    /* Clicks on the board would set darts; the board takes none while it is locked anyway. */
    pointer-events: none;
  }
  .card {
    display: grid;
    justify-items: center;
    gap: 0.35rem;
    padding: 1rem 1.5rem;
    border: 3px solid var(--accent);
    border-radius: 0.9rem;
    background: rgba(13, 27, 35, 0.94);
    box-shadow: 0 0 2.5rem rgb(34 211 238 / 0.35);
    text-align: center;
    animation: arrive 0.45s cubic-bezier(0.2, 0.9, 0.3, 1.2) both;
  }
  .title {
    color: var(--accent);
    font-size: clamp(1.6rem, 4.5vw, 2.6rem);
    font-weight: 800;
    line-height: 1;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .moment { color: var(--accent); font-weight: 700; font-size: 1.05rem; }
  .next { font-weight: 700; font-size: 1.1rem; }
  .pull { color: var(--dim); font-size: 0.95rem; }
  .pull.pulling { color: var(--accent); }

  @keyframes arrive {
    from { opacity: 0; transform: scale(0.6); }
    60% { opacity: 1; transform: scale(1.06); }
    to { transform: scale(1); }
  }
</style>
