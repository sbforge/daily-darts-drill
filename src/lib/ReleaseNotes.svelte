<script lang="ts">
  // Release notes of an update, rendered from Markdown without leaving the app. Links open in the browser.
  import ExternalLink from "./ExternalLink.svelte";
  import { parseMarkdown, type Inline } from "./markdown";

  let { text }: { text: string } = $props();
  const blocks = $derived(parseMarkdown(text));
</script>

{#snippet inline(parts: Inline[])}
  {#each parts as p}
    {#if p.href}
      <ExternalLink href={p.href} text={p.text} />
    {:else if p.bold}<strong>{p.text}</strong>
    {:else if p.code}<code>{p.text}</code>
    {:else}{p.text}{/if}
  {/each}
{/snippet}

<div class="release-notes">
  {#each blocks as b}
    {#if b.kind === "heading"}
      <h4 class="h{b.level}">{@render inline(b.inline)}</h4>
    {:else if b.kind === "list"}
      <ul>
        {#each b.items as item}<li>{@render inline(item)}</li>{/each}
      </ul>
    {:else}
      <p>{@render inline(b.inline)}</p>
    {/if}
  {/each}
</div>

<style>
  .release-notes { font-size: 0.92rem; line-height: 1.5; }
  h4 { margin: 0.9rem 0 0.25rem; }
  h4.h1 { font-size: 1.1rem; }
  p { margin: 0.35rem 0; color: var(--dim); }
  ul { margin: 0.3rem 0; padding-left: 1.2rem; }
  li { margin: 0.2rem 0; }
  code { padding: 0 0.3em; border-radius: 4px; background: var(--panel); font-size: 0.9em; }
</style>
