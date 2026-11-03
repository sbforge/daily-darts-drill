<script lang="ts">
  // The D³ backdrop over the whole window while the app loads, with a progress bar.
  // The bar never runs ahead of the clock: a fast start still fills it over `fillMs`,
  // so the logo stays a moment instead of flashing by.
  import { fade } from "svelte/transition";

  let { progress, label, fillMs }: { progress: number; label: string; fillMs: number } = $props();

  const start = performance.now();
  let elapsed = $state(0);
  const shown = $derived(Math.min(progress, elapsed / fillMs, 1));

  $effect(() => {
    let id = 0;
    const tick = () => {
      elapsed = performance.now() - start;
      if (elapsed < fillMs) id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  });
</script>

<div class="splash" out:fade={{ duration: 350 }}>
  <div class="art"></div>
  <div class="status">
    <div
      class="track"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(shown * 100)}
    >
      <div class="fill" style:width="{shown * 100}%"></div>
    </div>
    <p>{label}</p>
  </div>
</div>

<style>
  /* The artwork is shown whole, on its own background colour; the bar gets a row of its own below it. */
  .splash {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 4vh 2rem 6vh;
    background: #050b0f;
  }
  .art {
    flex: 1;
    width: 100%;
    min-height: 0;
    background: url("../assets/brand/d3-backdrop.svg") center / contain no-repeat;
  }
  .status {
    width: min(26rem, 70vw);
    margin-top: 1.5rem;
    text-align: center;
  }
  .track {
    height: 6px;
    border-radius: 999px;
    background: rgb(255 255 255 / 0.1);
    overflow: hidden;
  }
  .fill {
    height: 100%;
    border-radius: inherit;
    background: var(--accent);
    box-shadow: 0 0 12px var(--accent);
  }
  p {
    margin: 0.75rem 0 0;
    color: var(--dim);
    font-size: 0.9rem;
  }
</style>
