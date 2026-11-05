<script lang="ts">
  // A link that leaves the app: opens in the system browser, and the arrow-out-of-box icon says so.
  import { EXTERNAL_ICON, openExternal } from "./links";

  let { href, text }: { href: string; text: string } = $props();
  // The last word and the icon stay on one line: the icon never wraps alone.
  const cut = $derived(text.lastIndexOf(" ") + 1);
</script>

<a class="ext" {href} onclick={(e) => openExternal(e, href)}>
  {text.slice(0, cut)}<span class="tail">{text.slice(cut)}<svg class="ext-icon" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
    <path
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      d={EXTERNAL_ICON}
    />
  </svg></span>
</a>

<style>
  .ext {
    color: var(--accent);
    font-weight: 600;
    text-decoration: none;
    text-underline-offset: 0.2em;
  }
  .ext:hover { color: var(--accent-hi); text-decoration: underline; }
  .ext:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 3px; }
  .tail { white-space: nowrap; }
  .ext-icon { display: inline-block; margin-left: 0.3em; vertical-align: -0.1em; opacity: 0.85; }
</style>
