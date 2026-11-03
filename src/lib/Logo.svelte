<script lang="ts">
  // The D³ mark plus the "Daily Darts Drill" name, drawn as vector so it stays crisp and transparent at header size.
  let { height = 28 }: { height?: number } = $props();
</script>

<svg viewBox="0 0 430 100" {height} role="img" aria-label="D³ – Daily Darts Drill">
  <!-- D with the bull in its counter -->
  <path fill="var(--chalk, #e6ecef)" fill-rule="evenodd" d="M0 0H44A50 50 0 0 1 44 100H0ZM24 24V76H44A26 26 0 0 0 44 24Z" />
  <circle cx="44" cy="50" r="7" fill="var(--accent, #22d3ee)" />
  <!-- superscript 3 -->
  <path
    fill="none"
    stroke="var(--accent, #22d3ee)"
    stroke-width="9"
    stroke-linecap="round"
    stroke-linejoin="round"
    d="M108 8H128L116 24A15 15 0 1 1 106 46"
  />
  <text x="160" y="68" fill="var(--chalk, #e6ecef)" font-size="40" font-weight="600" letter-spacing="7">DAILY DARTS DRILL</text>
</svg>

<style>
  svg { display: block; width: auto; font-family: inherit; }
</style>
