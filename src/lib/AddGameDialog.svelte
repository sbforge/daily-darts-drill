<script lang="ts">
  // Modal for adding a game to a routine: pick the game, set its time cap and settings, add it.
  // As a quick game it starts the game instead, without a routine.
  // Uses the native <dialog>, which brings focus trapping, Escape to close and the backdrop.
  import GameField from "./GameField.svelte";
  import { GAMES, gameById, type Field } from "./games";
  import { t } from "./i18n/index.svelte";
  import { newItem, type RoutineItem } from "./store";

  let {
    onadd,
    quick = false,
  }: {
    onadd: (item: RoutineItem) => void;
    /** Starts a single game instead of adding one to a routine. */
    quick?: boolean;
  } = $props();

  let dialog = $state<HTMLDialogElement>();
  let gameId = $state(GAMES[0].id);
  let draft = $state<RoutineItem>(newItem(GAMES[0].id));
  // Settings already made for a game, so switching back to it keeps them. Starts from what open() was given.
  let made: Record<string, RoutineItem> = {};
  const g = $derived(gameById(draft.gameId));
  // A quick game can always run without a time cap; in a routine only a game that ends by itself can.
  const canEnd = $derived(quick || !!g.canEnd?.(draft.settings));

  const timeCap: Field = {
    key: "minutes",
    get label() {
      return t("routines.timeCap");
    },
    get info() {
      return t(quick ? "quick.timeCapInfo" : "routines.timeCapInfo");
    },
    kind: "number",
    min: 1,
    max: 120,
  };

  // A quick game can do without a time cap: it then runs until the game is done or stopped.
  // An item without a cap has 0 minutes; the minutes field keeps a number for when the cap is back on.
  let capped = $state("on");
  const capField: Field = {
    key: "capped",
    get label() {
      return t("quick.cap");
    },
    get info() {
      return t("quick.capInfo");
    },
    kind: "select",
    get options() {
      return [
        { value: "on", label: t("quick.capOn") },
        { value: "off", label: t("quick.capOff") },
      ];
    },
  };

  function load(item: RoutineItem | undefined, id: string) {
    gameId = id;
    draft = structuredClone(item ?? newItem(id));
    capped = draft.minutes > 0 ? "on" : "off";
    if (!(draft.minutes > 0)) draft.minutes = newItem(id).minutes;
  }

  function current(): RoutineItem {
    const item = $state.snapshot(draft);
    return capped === "off" && canEnd ? { ...item, minutes: 0 } : item;
  }

  /** Opens on the given games' settings (e.g. the ones played last), else on each game's defaults. */
  export function open(last: RoutineItem[] = [], id = gameId) {
    made = Object.fromEntries(last.map((i) => [i.gameId, i]));
    const start = GAMES.some((g) => g.id === id) ? id : GAMES[0].id;
    load(made[start], start);
    dialog?.showModal();
  }

  /** Switching games starts from that game's settings made so far, or from its defaults. */
  function pick(id: string) {
    if (draft.gameId !== id) made[draft.gameId] = current();
    load(made[id], id);
  }

  function add(e: SubmitEvent) {
    e.preventDefault();
    onadd(current());
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
    <h3 id="add-game-title">{t(quick ? "quick.title" : "routines.addGame")}</h3>
    <div class="scroll">

    <fieldset class="games">
      <legend class="sr-only">{t(quick ? "quick.gameToPlay" : "routines.gameToAdd")}</legend>
      {#each GAMES as game (game.id)}
        <label class="game" class:selected={game.id === gameId}>
          <input type="radio" name="game" value={game.id} checked={game.id === gameId} onchange={() => pick(game.id)} />
          <strong>{game.name}</strong>
          {#if game.classic !== game.name}<em class="classic">{game.classic}</em>{/if}
          <span>{game.blurb}</span>
        </label>
      {/each}
    </fieldset>
    <p class="goal"><strong>{t("game.goal")}</strong> {g.goal}</p>

    <div class="fields">
      {#if canEnd}
        <GameField field={capField} bind:value={capped} />
      {/if}
      {#if !canEnd || capped === "on"}
        <GameField field={timeCap} bind:value={draft.minutes} />
      {/if}
      {#each g.fields as f (`${g.id}-${f.key}`)}
        <GameField field={f} bind:value={draft.settings[f.key]} />
      {/each}
    </div>

    </div>

    <div class="foot">
      <button type="button" class="ghost" onclick={() => dialog?.close()}>{t("common.cancel")}</button>
      <button type="submit" class="primary">{t(quick ? "run.startGame" : "routines.addGame")}</button>
    </div>
  </form>
</dialog>

<style>
  dialog {
    width: min(40rem, calc(100vw - 2rem));
    max-height: calc(100dvh - 2rem);
    padding: 0;
    overflow: hidden;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--panel);
    color: var(--chalk);
    box-shadow: 0 20px 60px rgb(0 0 0 / 0.55);
  }
  dialog::backdrop { background: rgb(2 6 9 / 0.7); }
  /* Title and "Cancel / Start game" stay pinned; what is between them scrolls. */
  dialog[open] { display: flex; flex-direction: column; }
  form { display: flex; flex-direction: column; min-height: 0; max-height: calc(100dvh - 2rem); }
  .scroll { flex: 1; min-height: 0; overflow-y: auto; padding: 0 1.5rem; }
  h3 { margin: 0; padding: 1.25rem 1.5rem 0.75rem; font-size: 1.2rem; }

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
  /* The usual name of the drill, so a new name is easy to place. */
  .classic { margin-top: -0.2rem; color: var(--dim); font-size: 0.75rem; font-style: normal; letter-spacing: 0.04em; text-transform: uppercase; }
  .goal { margin: 0 0 1rem; padding: 0.6rem 0.8rem; border-left: 3px solid var(--accent); border-radius: 4px; background: rgb(34 211 238 / 0.06); font-size: 0.9rem; line-height: 1.4; }
  .goal strong { color: var(--accent); margin-right: 0.25rem; }

  .fields { display: grid; grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr)); gap: 0 1rem; }
  .fields { --field-bg: var(--bg); }
  .fields :global(input) { background: var(--bg); }
  .foot { display: flex; justify-content: flex-end; gap: 0.75rem; padding: 0.75rem 1.5rem 1.25rem; border-top: 1px solid var(--line); }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
</style>
