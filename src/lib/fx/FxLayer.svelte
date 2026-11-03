<script lang="ts">
  // Mounted once on top of the app: plays the overlay effects of the fx queue, and turns all motion
  // off when animations are switched off. Clicks pass through, so a busted dart can still be corrected.
  import { EFFECTS } from "./effects";
  import { fx } from "./fx.svelte";

  $effect(() => {
    document.documentElement.dataset.motion = fx.enabled ? "on" : "off";
  });
</script>

{#if fx.current}
  {@const c = fx.current}
  {@const Effect = EFFECTS[c.effect].component}
  {#key c.id}
    <div class="fx-layer">
      <Effect text={c.opts.text} tone={c.opts.tone ?? "info"} size={c.opts.size ?? "big"} ms={c.ms} />
    </div>
  {/key}
{/if}

<style>
  .fx-layer { position: fixed; inset: 0; z-index: 50; pointer-events: none; }

  /* Animations off: no motion anywhere, the end state shows right away. */
  :global(html[data-motion="off"] *),
  :global(html[data-motion="off"] *::before),
  :global(html[data-motion="off"] *::after) {
    transition: none !important;
    animation: none !important;
  }

  /* Element effects of the `fx` action. */
  :global(.fx-pulse) { animation: fx-pulse 1s ease-out infinite; }
  @keyframes -global-fx-pulse {
    from { transform: scale(1.08); }
    35% { transform: scale(1); }
  }
  :global(.fx-in) { animation: fx-in 0.3s ease-out both; animation-delay: var(--fx-delay, 0ms); }
  @keyframes -global-fx-in {
    from { opacity: 0; transform: translateY(0.5rem); }
  }
</style>
