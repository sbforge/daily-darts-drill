<script lang="ts">
  // Modal for adding a game to a routine: pick the game, set its time cap and settings, add it.
  // Uses the native <dialog>, which brings focus trapping, Escape to close and the backdrop.
  import { GAMES, gameById } from "./games";
  import { t } from "./i18n/index.svelte";
  import Select from "./Select.svelte";
  import { newItem, type RoutineItem } from "./store";

  let { onadd }: { onadd: (item: RoutineItem) => void } = $props();

  let dialog = $state<HTMLDialogElement>();
  let gameId = $state(GAMES[0].id);
  let draft = $state<RoutineItem>(newItem(GAMES[0].id));
  const g = $derived(gameById(draft.gameId));

  export function open() {
    pick(gameId);
    dialog?.showModal();
  }

  /** Switching games starts over from that game's defaults. */
  function pick(id: string) {
    gameId = id;
    draft = newItem(id);
  }

  function add(e: SubmitEvent) {
    e.preventDefault();
    onadd($state.snapshot(draft));
    dialog?.close();
  }

  // A click on the backdrop lands on the dialog element itself.
  function backdrop(e: MouseEvent) {
    if (e.target === dialog) dialog.close();
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<dialog bind:this={dialog} onclick={backdrop} aria-labelledby="add-game-title">
  <form onsubmit={add}>
    <h3 id="add-game-title">{t("routines.addGame")}</h3>

    <fieldset class="games">
      <legend class="sr-only">{t("routines.gameToAdd")}</legend>
      {#each GAMES as game (game.id)}
        <label class="game" class:selected={game.id === gameId}>
          <input type="radio" name="game" value={game.id} checked={game.id === gameId} onchange={() => pick(game.id)} />
          <strong>{game.name}</strong>
          <span>{game.blurb}</span>
        </label>
      {/each}
    </fieldset>

    <div class="fields">
      <label>
        {t("routines.timeCap")}
        <input type="number" min="1" max="120" bind:value={draft.minutes} />
      </label>
      {#each g.fields as f (f.key)}
        <label>
          {f.label}
          {#if f.kind === "select"}
            <Select bind:value={draft.settings[f.key]} options={f.options ?? []} />
          {:else}
            <input type="number" min={f.min} max={f.max} bind:value={draft.settings[f.key]} />
          {/if}
        </label>
      {/each}
    </div>

    <div class="foot">
      <button type="button" class="ghost" onclick={() => dialog?.close()}>{t("common.cancel")}</button>
      <button type="submit" class="primary">{t("routines.addGame")}</button>
    </div>
  </form>
</dialog>

<style>
  dialog {
    width: min(40rem, calc(100vw - 2rem));
    max-height: calc(100dvh - 4rem);
    padding: 1.25rem 1.5rem;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--panel);
    color: var(--chalk);
    box-shadow: 0 20px 60px rgb(0 0 0 / 0.55);
  }
  dialog::backdrop { background: rgb(2 6 9 / 0.7); }
  h3 { margin: 0 0 1rem; font-size: 1.2rem; }

  .games {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr));
    gap: 0.5rem;
    margin: 0 0 1.25rem;
    padding: 0;
    border: 0;
  }
  .game {
    position: relative;
    gap: 0.2rem;
    margin: 0;
    padding: 0.65rem 0.75rem;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--bg);
    cursor: pointer;
  }
  .game:hover { border-color: var(--dim); }
  .game.selected { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); }
  .game:has(input:focus-visible) { outline: 2px solid var(--accent); outline-offset: 2px; }
  .game input { position: absolute; opacity: 0; pointer-events: none; }
  .game span { color: var(--dim); font-size: 0.85rem; line-height: 1.35; }

  .fields { display: grid; grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr)); gap: 0 1rem; }
  .fields { --field-bg: var(--bg); }
  .fields input { background: var(--bg); }
  .foot { display: flex; justify-content: flex-end; gap: 0.75rem; margin-top: 0.5rem; }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
</style>
