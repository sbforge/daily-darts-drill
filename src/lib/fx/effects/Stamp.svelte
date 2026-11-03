<script lang="ts">
  // A word stamped over the screen: holds, then fades within the time it is shown.
  // "bad" slams in and shakes (No Score); "great" zooms in past full size, settles and glows.
  import type { EffectProps } from "./index";

  let { text = "", tone, size, ms }: EffectProps = $props();
</script>

<div class="veil" style:--fx-ms="{ms}ms" role="status">
  <div class="stamp" data-tone={tone} data-size={size}>
    <span class="word">{text}</span>
  </div>
</div>

<style>
  .veil {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    background: radial-gradient(closest-side, rgba(6, 13, 18, 0.85), rgba(6, 13, 18, 0.45));
    animation: veil var(--fx-ms) ease-out both;
  }
  .stamp {
    --tone: var(--accent);
    --glow: rgb(34 211 238 / 0.4);
    padding: 1.25rem 2.5rem;
    border: 4px solid var(--tone);
    border-radius: 0.9rem;
    color: var(--tone);
    background: rgba(13, 27, 35, 0.92);
    box-shadow: 0 0 2.5rem var(--glow);
    text-align: center;
    transform: rotate(-6deg);
    animation: great var(--fx-ms) cubic-bezier(0.2, 0.9, 0.3, 1.2) both;
  }
  .stamp[data-tone="bad"] {
    --tone: #ff6b5b;
    --glow: rgba(255, 107, 91, 0.35);
    animation-name: bad;
  }
  .stamp[data-tone="info"] { animation-name: info; }
  .word {
    display: block;
    font-size: clamp(3rem, 9vw, 6rem);
    font-weight: 800;
    line-height: 1;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .stamp[data-size="normal"] { padding: 0.75rem 1.5rem; border-width: 3px; }
  .stamp[data-size="normal"] .word { font-size: clamp(1.75rem, 5vw, 3rem); }

  @keyframes veil {
    from { opacity: 0; }
    10% { opacity: 1; }
    80% { opacity: 1; }
    to { opacity: 0; }
  }
  @keyframes bad {
    from { opacity: 0; transform: rotate(-14deg) scale(2.2); }
    14% { opacity: 1; transform: rotate(-4deg) scale(0.94); }
    22% { transform: rotate(-6deg) scale(1); }
    30%, 34% { transform: rotate(-6deg) translateX(-4px); }
    32%, 36% { transform: rotate(-6deg) translateX(4px); }
    40% { transform: rotate(-6deg) translateX(0); }
    80% { opacity: 1; transform: rotate(-6deg) scale(1); }
    to { opacity: 0; transform: rotate(-6deg) scale(1.08); }
  }
  @keyframes great {
    from { opacity: 0; transform: rotate(-6deg) scale(0.4); }
    14% { opacity: 1; transform: rotate(-6deg) scale(1.18); }
    24% { transform: rotate(-6deg) scale(1); box-shadow: 0 0 2.5rem var(--glow); }
    45% { box-shadow: 0 0 4.5rem 0.5rem var(--glow); }
    80% { opacity: 1; transform: rotate(-6deg) scale(1); box-shadow: 0 0 2.5rem var(--glow); }
    to { opacity: 0; transform: rotate(-6deg) scale(1.08); }
  }
  @keyframes info {
    from { opacity: 0; transform: rotate(-6deg) scale(0.9); }
    12% { opacity: 1; transform: rotate(-6deg) scale(1); }
    80% { opacity: 1; }
    to { opacity: 0; }
  }
</style>
