<script lang="ts">
  // Error toasts at the bottom right, on top of everything. They stay until closed and don't block clicks.
  import { openFolder } from "./backend";
  import { crash, dismissCrash } from "./crash.svelte";
  import { t } from "./i18n/index.svelte";
  import { EXTERNAL_ICON, openExternal } from "./links";

  let copied = $state<number | null>(null);

  async function copy(id: number, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      copied = id;
      setTimeout(() => copied === id && (copied = null), 2000);
    } catch {
      /* the report is also in the log folder */
    }
  }
</script>

{#if crash.toasts.length}
  <div class="crash-toasts" aria-live="assertive">
    {#each crash.toasts as c (c.id)}
      <div class="crash-toast" role="alert">
        <div class="head">
          <strong>{t("crash.title")}{c.count > 1 ? ` ×${c.count}` : ""}</strong>
          <button class="x" aria-label={t("crash.dismiss")} onclick={() => dismissCrash(c.id)}>×</button>
        </div>
        <p class="msg">{c.message}</p>
        <div class="actions">
          <button onclick={() => copy(c.id, c.report)}>{copied === c.id ? t("crash.copied") : t("crash.copy")}</button>
          <a href={c.githubUrl} onclick={(e) => openExternal(e, c.githubUrl)}>
            {t("crash.report")}<svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
              <path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d={EXTERNAL_ICON} />
            </svg>
          </a>
          <button onclick={() => openFolder("logs")}>{t("about.openLogs")}</button>
        </div>
      </div>
    {/each}
  </div>
{/if}

<style>
  .crash-toasts {
    position: fixed; right: 1rem; bottom: 1rem; z-index: 80; display: grid; gap: 0.6rem;
    width: min(26rem, calc(100vw - 2rem)); pointer-events: none;
  }
  .crash-toast {
    pointer-events: auto; background: #3b1714; color: #ffe3de; border: 1px solid #c4473a;
    border-left-width: 5px; border-radius: 8px; padding: 0.7rem 0.9rem; box-shadow: 0 6px 24px #0008;
  }
  .head { display: flex; justify-content: space-between; align-items: center; }
  .x { background: none; border: 0; color: inherit; font-size: 1.3rem; line-height: 1; cursor: pointer; }
  .msg { margin: 0.3rem 0 0.6rem; font-size: 0.85rem; overflow-wrap: anywhere; max-height: 4.5rem; overflow: auto; }
  .actions { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; }
  .actions button, .actions a {
    background: #ffffff1a; color: inherit; border: 1px solid #ffffff40; border-radius: 6px;
    padding: 0.25rem 0.6rem; font-size: 0.8rem; cursor: pointer; text-decoration: none;
  }
  .actions a { display: inline-flex; align-items: center; gap: 0.3rem; }
  .actions button:hover, .actions a:hover { background: #ffffff33; }
</style>
