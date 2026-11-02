<script lang="ts" module>
  import { en } from "./i18n/en";
  import type { Key } from "./i18n/index.svelte";

  const QUOTES = Object.keys(en).filter((k) => k.startsWith("quote.")) as Key[];
  let last = -1;

  /** A random quote, never the same one twice in a row. */
  function pick(): Key {
    let i = Math.floor(Math.random() * QUOTES.length);
    if (i === last) i = (i + 1) % QUOTES.length;
    last = i;
    return QUOTES[i];
  }
</script>

<script lang="ts">
  // A motivating sentence for the moments the player waits: the countdown, the break, a paused game.
  // It is picked once when shown, so it stays put while the clock ticks and follows a language change.
  import { t } from "./i18n/index.svelte";

  const key = pick();
</script>

<blockquote class="quote">{t(key)}</blockquote>

<style>
  .quote {
    margin: 1.5rem 0;
    padding: 0.25rem 0 0.25rem 1rem;
    border-left: 3px solid var(--dart);
    font-size: 1.35rem;
    font-weight: 600;
    font-style: italic;
    line-height: 1.4;
    color: var(--chalk);
    max-width: 40ch;
    text-wrap: balance;
    animation: quote-in 0.6s ease-out both;
  }
  @keyframes quote-in {
    from { opacity: 0; transform: translateY(6px); }
  }
  :global(.countdown) .quote, :global(.break) .quote {
    border-left: none;
    padding: 0;
    text-align: center;
    font-size: 1.6rem;
  }
  /* On the break screen the quote is the main thing to look at. */
  :global(.break) .quote {
    margin: 2rem auto 2.25rem;
    font-size: clamp(1.8rem, 3.5vw, 2.6rem);
    line-height: 1.3;
    max-width: 28ch;
  }
</style>
