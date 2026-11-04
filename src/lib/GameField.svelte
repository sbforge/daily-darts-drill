<script lang="ts">
  // One game setting: its label with an info icon, and the control. The icon opens the info text as a
  // bubble over the form, styled like the "click again" bubbles. Like Select's list it is fixed to the
  // window, so a card or a dialog never clips it.
  // The info button sits next to the <label>, not inside it: a button inside would become the label's control.
  import { tick } from "svelte";
  import type { Field } from "./games";
  import { t } from "./i18n/index.svelte";
  import Select from "./Select.svelte";

  let { field, value = $bindable() }: { field: Field; value: string | number } = $props();

  const id = $props.id();
  let button = $state<HTMLButtonElement>();
  let bubble = $state<HTMLElement>();
  let showInfo = $state(false);
  let above = $state(false);

  async function toggle() {
    showInfo = !showInfo;
    if (!showInfo) return;
    await tick();
    place();
  }

  /** Places the bubble under the icon, or above it when there is no room below. The arrow points at the icon. */
  function place() {
    if (!button || !bubble) return;
    const r = button.getBoundingClientRect();
    const h = bubble.offsetHeight;
    const w = bubble.offsetWidth;
    const mid = r.left + r.width / 2;
    const left = Math.max(8, Math.min(mid - 20, window.innerWidth - w - 8));
    above = r.bottom + 10 + h > window.innerHeight - 8 && r.top - 10 - h > 8;
    bubble.style.left = `${left}px`;
    bubble.style.top = `${above ? r.top - 10 - h : r.bottom + 10}px`;
    bubble.style.setProperty("--arrow", `${mid - left - 6}px`);
  }

  function outside(e: PointerEvent) {
    if (showInfo && !button?.contains(e.target as Node)) showInfo = false;
  }

  // Stopped here so that inside a dialog, Escape only closes the bubble.
  function keys(e: KeyboardEvent) {
    if (showInfo && e.key === "Escape") {
      e.stopPropagation();
      e.preventDefault();
      showInfo = false;
      button?.focus();
    }
  }
</script>

<svelte:window
  onpointerdowncapture={outside}
  onkeydowncapture={keys}
  onscrollcapture={() => (showInfo = false)}
  onresize={() => (showInfo = false)}
/>

<div class="field" class:check={field.kind === "checkbox"}>
  <div class="head">
    {#if field.kind === "checkbox"}
      <!-- The box sits in front of its label, on the line of the other fields' controls. -->
      <input {id} type="checkbox" checked={value === "on"} onchange={(e) => (value = e.currentTarget.checked ? "on" : "off")} />
    {/if}
    <label for={id}>{field.label}</label>
    <button
      bind:this={button}
      type="button"
      class="info"
      aria-expanded={showInfo}
      aria-controls="{id}-info"
      aria-label={t("common.fieldInfo", { name: field.label })}
      onclick={toggle}
    >
      <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
        <circle cx="8" cy="8" r="6.6" fill="none" stroke="currentColor" stroke-width="1.4" />
        <circle cx="8" cy="4.9" r="0.95" fill="currentColor" />
        <path d="M8 7.3v4.4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
      </svg>
    </button>
  </div>
  {#if field.kind === "select"}
    <Select {id} bind:value options={field.options ?? []} />
  {:else if field.kind === "number"}
    <input {id} type="number" min={field.min} max={field.max} bind:value />
  {/if}
  {#if showInfo}
    <p bind:this={bubble} id="{id}-info" class="bubble" class:above role="status">{field.info}</p>
  {/if}
</div>

<style>
  /* Spaced like the shared <label> fields. */
  .field { display: flex; flex-direction: column; gap: 0.35rem; margin-bottom: 1rem; font-size: 0.95rem; }
  .head { display: flex; align-items: center; gap: 0.3rem; }
  .head label { display: inline; margin: 0; }
  /* Its control is the box in the head, so the head moves down to where the other fields have their control. */
  .field.check { justify-content: flex-end; }
  .field.check .head { min-height: 2.6rem; gap: 0.5rem; }
  .field.check label { cursor: pointer; }
  input[type="checkbox"] { width: 1.1rem; height: 1.1rem; margin: 0; padding: 0; accent-color: var(--accent); cursor: pointer; }
  .info {
    flex: none;
    display: grid;
    place-items: center;
    padding: 0.15rem;
    border: 0;
    border-radius: 50%;
    background: none;
    color: var(--dim);
    cursor: pointer;
  }
  .info:hover, .info[aria-expanded="true"] { color: var(--accent); }
  .info:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }

  /* The "click again" bubble from App.svelte, in the accent colour. */
  .bubble {
    position: fixed;
    z-index: 30;
    width: max-content;
    max-width: min(20rem, calc(100vw - 16px));
    margin: 0;
    padding: 0.55rem 0.75rem;
    border: 1px solid var(--accent);
    border-radius: 6px;
    background: #0f2a31;
    color: #d4f6fc;
    font-size: 0.875rem;
    line-height: 1.45;
    box-shadow: 0 6px 18px rgb(0 0 0 / 0.4);
    animation: bubble-in 0.15s ease-out both;
  }
  .bubble::before {
    content: "";
    position: absolute;
    bottom: 100%;
    left: var(--arrow, 0.75rem);
    border: 6px solid transparent;
    border-bottom-color: var(--accent);
  }
  .bubble.above::before { top: 100%; bottom: auto; border-bottom-color: transparent; border-top-color: var(--accent); }
  @keyframes bubble-in {
    from { opacity: 0; transform: translateY(-4px); }
  }
</style>
