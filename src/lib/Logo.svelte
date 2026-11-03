<script lang="ts">
  // The D³ mark plus the "Daily Darts Drill" name, drawn as vector so it stays crisp and transparent at header size.
  let { height = 28 }: { height?: number } = $props();
</script>

<svg viewBox="0 0 560 100" {height} role="img" aria-label="D³ – Daily Darts Drill">
  <defs>
    <linearGradient id="d3-silver" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f4f7f8" />
      <stop offset="1" stop-color="#b9c3c8" />
    </linearGradient>
  </defs>
  <!-- D -->
  <path
    fill="url(#d3-silver)"
    fill-rule="evenodd"
    d="M0 10 H48 A40 40 0 0 1 48 90 H0 Z M24 30 V70 H46 A20 20 0 0 0 46 30 Z"
  />
  <!-- superscript 3, cyan -->
  <path
    transform="translate(100 10) scale(0.3)"
    fill="none"
    stroke="var(--accent, #22d3ee)"
    stroke-width="30"
    stroke-linejoin="round"
    stroke-linecap="round"
    d="M0 0 H100 L45 55 A50 50 0 1 1 5 127"
  />
  <text x="160" y="68" fill="url(#d3-silver)" font-size="46" font-weight="600" letter-spacing="1">Daily Darts Drill</text>
</svg>

<style>
  svg { display: block; width: auto; font-family: inherit; }
</style>
