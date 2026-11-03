<script lang="ts">
  // The software bill of materials: every package in the app with version and license.
  // The build writes sbom.json (CycloneDX, see scripts/sbom.js); it is read the first time the dialog opens.
  import { t } from "./i18n/index.svelte";

  interface Component {
    name: string;
    version: string;
    purl: string;
    licenses?: { expression: string }[];
  }

  let dialog = $state<HTMLDialogElement>();
  let components = $state<Component[] | null>(null);
  let failed = $state(false);
  let query = $state("");
  let kind = $state<"all" | "cargo" | "npm">("all");

  const ecosystem = (c: Component) => (c.purl.startsWith("pkg:cargo/") ? "cargo" : "npm");
  const count = (k: "cargo" | "npm") => components?.filter((c) => ecosystem(c) === k).length ?? 0;
  const shown = $derived(
    (components ?? []).filter(
      (c) =>
        (kind === "all" || ecosystem(c) === kind) &&
        (c.name + " " + license(c)).toLowerCase().includes(query.trim().toLowerCase()),
    ),
  );

  function license(c: Component): string {
    return c.licenses?.map((l) => l.expression).join(", ") || t("sbom.noLicense");
  }

  export async function open() {
    dialog?.showModal();
    if (components) return;
    failed = false;
    try {
      const res = await fetch("sbom.json");
      if (!res.ok) throw new Error(String(res.status));
      components = (await res.json()).components;
    } catch {
      failed = true;
    }
  }
</script>

<!-- Escape, the backdrop or the button closes it. -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<dialog
  bind:this={dialog}
  class="confirm sbom"
  aria-labelledby="sbom-title"
  onclick={(e) => {
    if (e.target === dialog) dialog.close();
  }}
>
  <h3 id="sbom-title">{t("sbom.title")}</h3>
  {#if failed}
    <p class="error" role="alert">{t("sbom.failed")}</p>
  {:else if !components}
    <p class="hint">{t("sbom.loading")}</p>
  {:else}
    <p class="lede">{t("sbom.lede", { n: components.length, rust: count("cargo"), js: count("npm") })}</p>
    <div class="filters">
      <input type="search" bind:value={query} placeholder={t("sbom.search")} aria-label={t("sbom.search")} />
      <div class="toggle" role="tablist" aria-label={t("sbom.kind")}>
        {#each [["all", "sbom.all"], ["cargo", "sbom.rust"], ["npm", "sbom.js"]] as const as [k, key]}
          <button role="tab" aria-selected={kind === k} onclick={() => (kind = k)}>{t(key)}</button>
        {/each}
      </div>
    </div>
    <ul>
      {#each shown as c (c.purl)}
        <li>
          <span class="name">{c.name}</span>
          <span class="version">{c.version}</span>
          <span class="license">{license(c)}</span>
        </li>
      {:else}
        <li class="none">{t("sbom.none")}</li>
      {/each}
    </ul>
  {/if}
  <div class="foot">
    <button class="primary" onclick={() => dialog?.close()}>{t("sbom.close")}</button>
  </div>
</dialog>

<style>
  .sbom { width: min(44rem, calc(100vw - 2rem)); }
  .filters { display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: center; margin-bottom: 0.75rem; }
  .filters input { flex: 1; min-width: 12rem; }
  ul {
    height: min(26rem, 50vh);
    overflow-y: auto;
    margin: 0 0 1rem;
    padding: 0;
    list-style: none;
    border-top: 1px solid var(--line);
  }
  li {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 7rem minmax(0, 12rem);
    gap: 0.75rem;
    padding: 0.4rem 0;
    border-bottom: 1px solid var(--line);
    font-size: 0.9rem;
  }
  .name { font-weight: 600; overflow-wrap: anywhere; }
  .version { color: var(--dim); font-family: ui-monospace, Consolas, monospace; font-size: 0.85rem; }
  .license { color: var(--dim); text-align: right; overflow-wrap: anywhere; }
  .none { display: block; color: var(--dim); }
</style>
