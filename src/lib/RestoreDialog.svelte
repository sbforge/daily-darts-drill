<script lang="ts">
  // "Restore a backup": pick one of the backups (or an exported file), D³ checks it, saves the current data to
  // backups/restore and restarts with it. The swap itself happens on the next start, before the database opens.
  import { chooseRestoreFile, discardRestore, listBackups, restoreProblem, stageRestore, type BackupEntry } from "./backend";
  import { dateTime, t, type Key } from "./i18n/index.svelte";
  import { log } from "./log";

  let dialog = $state<HTMLDialogElement>();
  let backups = $state<BackupEntry[] | null>(null);
  /** The file to restore: a backup's path or a chosen file. */
  let chosen = $state("");
  let chosenFile = $state("");
  let error = $state("");
  let busy = $state(false);

  export async function open() {
    backups = null;
    chosen = "";
    chosenFile = "";
    error = "";
    busy = false;
    dialog?.showModal();
    backups = await listBackups();
    chosen = backups[0]?.path ?? "";
  }

  async function pickFile() {
    error = "";
    try {
      const path = await chooseRestoreFile();
      if (!path) return;
      chosenFile = path;
      chosen = path;
    } catch (e) {
      error = t("restore.failed", { msg: e instanceof Error ? e.message : String(e) });
    }
  }

  async function restore() {
    if (!chosen) return;
    busy = true;
    error = "";
    try {
      await stageRestore(chosen);
      log.info(`restore staged, restarting: ${chosen}`);
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch (e) {
      const p = restoreProblem(e);
      error =
        p.kind === "newer"
          ? t("restore.newer")
          : p.kind === "io"
            ? t("restore.failed", { msg: p.detail })
            : t(`restore.${p.kind}` as Key);
      await discardRestore();
      busy = false;
    }
  }

  const kindLabel = (k: BackupEntry["kind"]) => t(`restore.kind.${k}` as Key);
  const fileName = (path: string) => path.split(/[\\/]/).pop() ?? path;
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<dialog
  bind:this={dialog}
  class="confirm restore"
  aria-labelledby="restore-title"
  onclick={(e) => {
    if (e.target === dialog && !busy) dialog.close();
  }}
>
  <h3 id="restore-title">{t("restore.title")}</h3>
  <p class="lede">{t("restore.lede")}</p>
  {#if backups === null}
    <p class="hint">{t("sbom.loading")}</p>
  {:else}
    <div class="list" role="radiogroup" aria-labelledby="restore-title">
      {#each backups as b (b.path)}
        <label class="item" class:on={chosen === b.path}>
          <input type="radio" name="restore" value={b.path} bind:group={chosen} disabled={busy} />
          <span class="when">{dateTime(b.made)}</span>
          <span class="kind">{kindLabel(b.kind)}</span>
        </label>
      {:else}
        <p class="hint">{t("restore.noBackups")}</p>
      {/each}
      {#if chosenFile}
        <label class="item" class:on={chosen === chosenFile}>
          <input type="radio" name="restore" value={chosenFile} bind:group={chosen} disabled={busy} />
          <span class="when">{fileName(chosenFile)}</span>
          <span class="kind">{t("restore.kind.file")}</span>
        </label>
      {/if}
    </div>
    <button class="ghost small" onclick={pickFile} disabled={busy}>{t("restore.chooseFile")}</button>
  {/if}
  <p class="hint">{t("restore.safety")}</p>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  <div class="foot">
    <button class="ghost" disabled={busy} onclick={() => dialog?.close()}>{t("erase.cancel")}</button>
    <button class="primary" disabled={!chosen || busy} onclick={restore}>{busy ? t("restore.restarting") : t("restore.button")}</button>
  </div>
</dialog>

<style>
  .restore { width: min(34rem, calc(100vw - 2rem)); }
  .list {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    max-height: min(40vh, 20rem);
    overflow-y: auto;
    margin: 0.75rem 0 0.6rem;
  }
  .item {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 0.6rem;
    padding: 0.5rem 0.7rem;
    border: 1px solid var(--line);
    border-radius: 6px;
    cursor: pointer;
  }
  .item.on { border-color: var(--accent); background: rgb(34 211 238 / 0.06); }
  .item input { margin: 0; }
  .when { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .kind { color: var(--dim); font-size: 0.85rem; }
</style>
