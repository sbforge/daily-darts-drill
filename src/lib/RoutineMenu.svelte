<script lang="ts">
  // The "⋯" menu beside a routine's name, holding the actions on the routine as a whole.
  // Deleting asks for a second click inside the menu before it goes through.
  import { tick } from "svelte";
  import { t } from "./i18n/index.svelte";

  let { onduplicate, ondelete }: { onduplicate: () => void; ondelete: () => void } = $props();

  let open = $state(false);
  let confirming = $state(false);
  let root = $state<HTMLElement>();
  let toggleButton = $state<HTMLButtonElement>();

  async function show() {
    open = true;
    confirming = false;
    await tick();
    root?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }

  function close(refocus = false) {
    open = false;
    confirming = false;
    if (refocus) toggleButton?.focus();
  }

  function duplicate() {
    close();
    onduplicate();
  }

  function remove() {
    if (!confirming) {
      confirming = true;
      return;
    }
    close();
    ondelete();
  }

  function outside(e: PointerEvent) {
    if (open && !root?.contains(e.target as Node)) close();
  }

  function keys(e: KeyboardEvent) {
    if (!open) return;
    if (e.key === "Escape") {
      e.preventDefault();
      close(true);
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const entries = [...(root?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const at = entries.indexOf(document.activeElement as HTMLElement);
    const next = (at + (e.key === "ArrowDown" ? 1 : -1) + entries.length) % entries.length;
    entries[next]?.focus();
  }
</script>

<svelte:window onpointerdown={outside} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="menu" bind:this={root} onkeydown={keys}>
  <button
    bind:this={toggleButton}
    class="ghost trigger"
    aria-haspopup="menu"
    aria-expanded={open}
    aria-label={t("routines.actions")}
    title={t("routines.actions")}
    onclick={() => (open ? close() : show())}
  >
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <circle cx="3" cy="8" r="1.5" /><circle cx="8" cy="8" r="1.5" /><circle cx="13" cy="8" r="1.5" />
    </svg>
  </button>
  {#if open}
    <div class="popup" role="menu">
      <button role="menuitem" onclick={duplicate}>{t("routines.duplicate")}</button>
      <button role="menuitem" class="danger" class:confirming onclick={remove}>
        {confirming ? t("common.confirmDelete") : t("routines.delete")}
      </button>
    </div>
  {/if}
</div>

<style>
  .menu { position: relative; }
  .trigger { display: grid; place-items: center; height: 2.6rem; padding: 0 0.75rem; }
  .trigger svg { fill: currentColor; }
  .trigger[aria-expanded="true"] { background: var(--panel); border-color: var(--dim); }
  .popup {
    position: absolute;
    right: 0;
    top: calc(100% + 0.35rem);
    z-index: 10;
    min-width: 13rem;
    display: flex;
    flex-direction: column;
    padding: 0.3rem;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--panel);
    box-shadow: 0 12px 32px rgb(0 0 0 / 0.5);
  }
  [role="menuitem"] {
    padding: 0.55rem 0.75rem;
    border: 0;
    border-radius: 6px;
    background: none;
    color: var(--chalk);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  [role="menuitem"]:hover, [role="menuitem"]:focus-visible { background: var(--bg); }
  [role="menuitem"].danger { color: #ff9b8f; }
  [role="menuitem"].confirming { background: #5a2420; color: #ffd9d3; }
</style>
