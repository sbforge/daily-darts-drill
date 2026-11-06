<script lang="ts">
  // The result of a round (JDC Challenge): lies over the board from the round's last dart until the takeout.
  // Like Game shot it is driven by the game's result, not by the fx queue: it goes away when the turn is closed,
  // and then the next round starts, or the game ends.
  import { fade } from "svelte/transition";
  import { fx } from "./fx";
  import { t } from "./i18n/index.svelte";
  import type { RoundEnd } from "./games/types";

  let {
    round,
    moment = "",
    pulling = false,
  }: {
    round: RoundEnd;
    /** The game's own moment of the last visit ("Shanghai!"), shown as a line of its own. */
    moment?: string;
    /** Autodarts sees the hand pulling the darts. */
    pulling?: boolean;
  } = $props();

  const ms = $derived(fx.enabled ? 250 : 0);
</script>

<div class="round" role="status" in:fade={{ duration: ms }} out:fade={{ duration: ms }}>
  <div class="card">
    <span class="title">{round.title}</span>
    {#if moment}<span class="moment">{moment}</span>{/if}
    <span class="score"><strong>{round.score.value}</strong> {round.score.label}</span>
    {#if round.badge}<span class="badge">{round.badge}</span>{/if}
    <dl>
      {#each round.lines as l (l.label)}
        <dt>{l.label}</dt>
        <dd>{l.value}</dd>
      {/each}
    </dl>
    <span class="next">{round.next}</span>
    <span class="pull" class:pulling>{pulling ? t("shot.pulling") : t("shot.pull")}</span>
  </div>
</div>

<style>
  .round {
    position: absolute;
    inset: 0;
    z-index: 5;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: radial-gradient(closest-side, rgba(6, 13, 18, 0.9), rgba(6, 13, 18, 0.66));
    /* Clicks go to the board; corrections of the last darts still change the result shown. */
    pointer-events: none;
  }
  .card {
    display: grid;
    justify-items: center;
    gap: 0.4rem;
    max-width: min(26rem, 90%);
    padding: 1rem 1.5rem 1.1rem;
    border: 3px solid var(--accent);
    border-radius: 0.9rem;
    background: rgba(13, 27, 35, 0.95);
    box-shadow: 0 0 2.5rem rgb(34 211 238 / 0.35);
    text-align: center;
    animation: arrive 0.45s cubic-bezier(0.2, 0.9, 0.3, 1.2) both;
  }
  .title {
    color: var(--accent);
    font-size: clamp(1.2rem, 3vw, 1.8rem);
    font-weight: 800;
    line-height: 1.1;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .moment { color: var(--accent); font-weight: 700; }
  .score { color: var(--dim); font-size: 1rem; }
  .score strong { color: var(--chalk); font-size: clamp(2rem, 6vw, 3.2rem); font-weight: 800; line-height: 1; margin-right: 0.2rem; }
  .badge { color: var(--ok, #4ade80); font-weight: 700; }
  dl {
    display: grid;
    grid-template-columns: auto auto;
    gap: 0.2rem 1.25rem;
    margin: 0.3rem 0;
    padding: 0.5rem 0 0;
    border-top: 1px solid var(--line);
    font-size: 0.92rem;
    text-align: left;
  }
  dt { color: var(--dim); }
  dd { margin: 0; font-weight: 700; text-align: right; font-variant-numeric: tabular-nums; }
  .next { font-weight: 700; font-size: 1.05rem; }
  .pull { color: var(--dim); font-size: 0.92rem; }
  .pull.pulling { color: var(--accent); }

  @keyframes arrive {
    from { opacity: 0; transform: scale(0.6); }
    60% { opacity: 1; transform: scale(1.06); }
    to { transform: scale(1); }
  }
</style>
