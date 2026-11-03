<script lang="ts" generics="V extends string | number">
  // A dropdown drawn in the app's own style, in place of the native <select> whose list the OS draws.
  // The list only exists while open. It is fixed to the window, so a card or a dialog never clips it,
  // and it is placed again whenever the page scrolls so it stays with its button.
  // (No popover attribute: the WebKit view Tauri uses on macOS ignores it and shows every list.)
  import { tick } from "svelte";

  let {
    value = $bindable(),
    options,
    onchange,
    label,
    id: buttonId,
  }: {
    value: V;
    /** An icon is an image URL shown before the label, e.g. a flag. */
    options: { value: V; label: string; icon?: string }[];
    onchange?: (value: V) => void;
    /** Accessible name when the select is not inside a <label>. */
    label?: string;
    /** For a <label for> outside the select. */
    id?: string;
  } = $props();

  const id = $props.id();
  let trigger = $state<HTMLButtonElement>();
  let list = $state<HTMLElement>();
  let open = $state(false);
  let active = $state(0);
  // A key press that already opened or chose can also click the button; that click is skipped.
  let keyClick = false;
  const current = $derived(options.find((o) => o.value === value));

  async function show() {
    if (open) return;
    active = Math.max(0, options.findIndex((o) => o.value === value));
    open = true;
    // WebKit doesn't focus a button on click, and the arrow keys are read on the button.
    trigger?.focus();
    await tick();
    place();
    list?.children[active]?.scrollIntoView({ block: "nearest" });
  }

  function hide() {
    open = false;
  }

  function choose(o: { value: V }) {
    if (o.value !== value) {
      value = o.value;
      onchange?.(o.value);
    }
    hide();
    trigger?.focus();
  }

  /** Places the list under the button, or above it when there is no room below. */
  function place() {
    if (!trigger || !list) return;
    const r = trigger.getBoundingClientRect();
    // Scrolled out of sight: nothing left to point at.
    if (r.bottom < 0 || r.top > window.innerHeight) return hide();
    const h = list.offsetHeight;
    const below = window.innerHeight - r.bottom - 8;
    list.style.minWidth = `${r.width}px`;
    list.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - list.offsetWidth - 8))}px`;
    list.style.top = `${h > below && r.top > below ? r.top - h - 4 : r.bottom + 4}px`;
  }

  function move(to: number) {
    active = Math.max(0, Math.min(options.length - 1, to));
    list?.children[active]?.scrollIntoView({ block: "nearest" });
  }

  function click() {
    if (keyClick) keyClick = false;
    else if (open) hide();
    else show();
  }

  // Focus stays on the button while the list is open; the arrow keys move the highlight.
  function keys(e: KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") keyClick = true;
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        show();
      }
      return;
    }
    const step = { ArrowDown: 1, ArrowUp: -1, PageDown: 5, PageUp: -5 }[e.key];
    if (step) move(active + step);
    else if (e.key === "Home") move(0);
    else if (e.key === "End") move(options.length - 1);
    else if (e.key === "Enter" || e.key === " ") choose(options[active]);
    else if (e.key === "Tab") hide();
    // Stopped here so that inside a dialog, Escape only closes the list.
    else if (e.key === "Escape") {
      e.stopPropagation();
      hide();
    } else return;
    e.preventDefault();
  }

  function outside(e: PointerEvent) {
    const t = e.target as Node;
    if (open && !trigger?.contains(t) && !list?.contains(t)) hide();
  }

  function scrolled(e: Event) {
    if (open && !list?.contains(e.target as Node)) place();
  }
</script>

<svelte:window onpointerdowncapture={outside} onscrollcapture={scrolled} onresize={() => open && place()} />

<button
  bind:this={trigger}
  id={buttonId}
  type="button"
  class="select"
  role="combobox"
  aria-haspopup="listbox"
  aria-expanded={open}
  aria-controls="{id}-list"
  aria-activedescendant={open ? `${id}-${active}` : undefined}
  aria-label={label}
  onclick={click}
  onkeydown={keys}
  onkeyup={() => setTimeout(() => (keyClick = false))}
>
  <span class="value">
    {#if current?.icon}<img class="icon" src={current.icon} alt="" />{/if}{current?.label ?? ""}
  </span>
  <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
    <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
  </svg>
</button>

{#if open}
  <!-- Inside a field's <label>, cancelling the click keeps the label from reopening the list. -->
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
  <ul bind:this={list} id="{id}-list" role="listbox" onclick={(e) => e.preventDefault()}>
    {#each options as o, i (o.value)}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <li
        id="{id}-{i}"
        role="option"
        aria-selected={o.value === value}
        class:active={i === active}
        onpointermove={() => (active = i)}
        onclick={() => choose(o)}
      >
        {#if o.icon}<img class="icon" src={o.icon} alt="" />{/if}{o.label}
      </li>
    {/each}
  </ul>
{/if}

<style>
  .select {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.6rem;
    width: 100%;
    font: inherit;
    color: var(--chalk);
    background: var(--field-bg, var(--panel));
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 0.55rem 0.7rem;
    text-align: left;
    cursor: pointer;
  }
  .select:hover { border-color: var(--dim); }
  .select[aria-expanded="true"] { border-color: var(--accent); }
  .value { display: flex; align-items: center; gap: 0.5rem; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .icon { flex: none; width: 1.35rem; height: 0.9rem; object-fit: cover; border-radius: 2px; box-shadow: 0 0 0 1px rgb(255 255 255 / 0.15); }
  svg { flex: none; color: var(--dim); transition: transform 0.15s; }
  .select[aria-expanded="true"] svg { transform: rotate(180deg); color: var(--accent); }

  ul {
    position: fixed;
    z-index: 100;
    margin: 0;
    max-height: min(18rem, 50vh);
    overflow-y: auto;
    list-style: none;
    padding: 0.3rem;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--panel);
    color: var(--chalk);
    box-shadow: 0 12px 32px rgb(0 0 0 / 0.5);
  }
  li {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.45rem 0.65rem 0.45rem 1.6rem;
    border-radius: 5px;
    white-space: nowrap;
    cursor: pointer;
  }
  li.active { background: var(--bg); }
  li[aria-selected="true"] { color: var(--accent); font-weight: 600; }
  /* A tick marks the chosen entry. */
  li[aria-selected="true"]::before {
    content: "";
    position: absolute;
    margin-left: -1.05rem;
    width: 0.35rem;
    height: 0.65rem;
    border: solid currentColor;
    border-width: 0 2px 2px 0;
    transform: translateY(-0.1rem) rotate(45deg);
  }
</style>
