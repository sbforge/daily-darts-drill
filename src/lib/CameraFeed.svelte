<script lang="ts">
  // Placeholder for the live camera feed. When the stream source is known,
  // pass it in as `src` and render it here (video or image element).
  let { src = null }: { src?: string | null } = $props();
</script>

<div class="feed" role="img" aria-label="Camera feed placeholder">
  {#if src}
    <!-- live feed goes here -->
  {:else}
    <p class="title">Camera feed</p>
    <p class="sub">Live view of the board will appear here.</p>
  {/if}
</div>

<style>
  .feed {
    aspect-ratio: 16 / 9;
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.25rem;
    border: 1px dashed var(--line);
    border-radius: 8px;
    background: var(--panel);
    color: var(--dim);
    text-align: center;
  }
  p { margin: 0; }
  .title { color: var(--chalk); font-weight: 600; }
  .sub { font-size: 0.85rem; }
</style>
