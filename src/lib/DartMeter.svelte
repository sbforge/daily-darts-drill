<script lang="ts">
  // A row of dart icons: thrown darts in grey, the ones still to throw in petrol, split into groups.
  let { label, total, used, group }: { label: string; total: number; used: number; group: number } = $props();

  const groups = $derived(
    Array.from({ length: Math.ceil(total / group) }, (_, g) =>
      Array.from({ length: Math.min(group, total - g * group) }, (_, i) => g * group + i),
    ),
  );
</script>

<div class="meter">
  <span class="cap">{label}</span>
  <div class="row" role="img" aria-label={label}>
    {#each groups as darts, g (g)}
      <div class="group">
        {#each darts as i (i)}
          <svg class="dart" class:thrown={i < used} viewBox="0 0 12 40" width="15" height="50" aria-hidden="true">
            <!-- point, barrel, shaft, flight -->
            <path d="M5.4 0h1.2v9H5.4z" />
            <rect x="3.8" y="8.5" width="4.4" height="13" rx="1.6" />
            <path d="M5.3 21h1.4v8H5.3z" />
            <path d="M6 26 1 33v7l5-4 5 4v-7z" />
          </svg>
        {/each}
      </div>
    {/each}
  </div>
</div>

<style>
  .meter { display: flex; flex-direction: column; gap: 0.45rem; margin-bottom: 1.25rem; }
  .cap { color: var(--dim); }
  .row { display: flex; gap: 1rem; }
  .group { display: flex; gap: 0.35rem; }
  .dart { fill: var(--petrol); transition: fill 0.2s, opacity 0.2s; }
  .dart.thrown { fill: var(--dim); opacity: 0.35; }
</style>
