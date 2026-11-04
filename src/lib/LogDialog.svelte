<script lang="ts">
  // The end of the log file, shown in the app: after a hard crash there is no crash report, only the log.
  import { invoke } from "@tauri-apps/api/core";
  import { t } from "./i18n/index.svelte";

  let dialog = $state<HTMLDialogElement>();
  let lines = $state<string[] | null>(null);
  let copied = $state(false);

  export async function open() {
    copied = false;
    lines = null;
    dialog?.showModal();
    try {
      lines = await invoke<string[]>("log_tail", { lines: 300 });
    } catch {
      lines = [];
    }
  }

  async function copy() {
    await navigator.clipboard.writeText((lines ?? []).join("\n"));
    copied = true;
  }
</script>

<!-- Escape, the backdrop or the button closes it. -->
<dialog
  bind:this={dialog}
  class="confirm log"
  aria-labelledby="log-title"
  onclick={(e) => {
    if (e.target === dialog) dialog.close();
  }}
>
  <h3 id="log-title">{t("log.title")}</h3>
  {#if lines === null}
    <p class="hint">{t("sbom.loading")}</p>
  {:else if !lines.length}
    <p class="hint">{t("log.empty")}</p>
  {:else}
    <pre>{lines.join("\n")}</pre>
  {/if}
  <div class="foot">
    <button onclick={copy} disabled={!lines?.length}>{copied ? t("crash.copied") : t("log.copy")}</button>
    <button class="primary" onclick={() => dialog?.close()}>{t("sbom.close")}</button>
  </div>
</dialog>

<style>
  .log { width: min(56rem, calc(100vw - 2rem)); }
  pre {
    max-height: min(60vh, 36rem);
    overflow: auto;
    margin: 0.75rem 0;
    padding: 0.75rem;
    border-radius: 6px;
    background: var(--panel);
    font: 0.78rem/1.45 ui-monospace, Consolas, monospace;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .foot { display: flex; justify-content: flex-end; gap: 0.75rem; }
</style>
