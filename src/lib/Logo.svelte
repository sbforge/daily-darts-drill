<script lang="ts">
  // The ADX wordmark, redrawn as vector so it stays crisp and transparent at header size.
  // The full raster artwork lives in src/assets/brand.
  let { height = 28 }: { height?: number } = $props();
</script>

<svg viewBox="0 0 340 100" {height} role="img" aria-label="ADX">
  <defs>
    <linearGradient id="adx-silver" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f4f7f8" />
      <stop offset="1" stop-color="#b9c3c8" />
    </linearGradient>
  </defs>
  <g fill="url(#adx-silver)">
    <!-- A: open chevron with a base bar -->
    <polygon points="0,90 48,10 72,10 120,90 94,90 60,34 26,90" />
    <polygon points="38,90 50,72 70,72 82,90" />
    <!-- D -->
    <path fill-rule="evenodd" d="M128 10 H176 A40 40 0 0 1 176 90 H128 Z M152 30 V70 H174 A20 20 0 0 0 174 30 Z" />
    <!-- X, silver stroke -->
    <polygon points="222,10 248,10 304,90 278,90" />
  </g>
  <!-- X, cyan stroke that turns into the dart -->
  <g fill="var(--accent, #22d3ee)">
    <polygon points="216,90 242,90 298,10 272,10" />
    <polygon points="240,98 236,95 320,14 323,17" />
    <polygon points="314,18 324,4 338,2 334,16 320,22" />
  </g>
</svg>

<style>
  svg { display: block; width: auto; }
</style>
