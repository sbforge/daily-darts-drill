<script lang="ts">
  import { onMount } from "svelte";
  import {
    AutodartsClient,
    autodartsUrl,
    dartLabel,
    type ConnState,
    type DartEvent,
  } from "./lib/autodarts";
  import { DEFAULT_CONFIG, newRoutine, newItem, type Config, type Routine } from "./lib/store";
  import * as db from "./lib/db";
  import { GAMES, gameById, type StatLine } from "./lib/games";
  import { Session } from "./lib/session.svelte";
  import Board from "./lib/Board.svelte";
  import CameraFeed from "./lib/CameraFeed.svelte";
  import Logo from "./lib/Logo.svelte";
  import RoutineCarousel from "./lib/RoutineCarousel.svelte";
  import { COFFEE_URL, GITHUB_URL, openExternal } from "./lib/links";

  interface RunResult {
    name: string;
    minutes: number;
    early: boolean;
    hasResult: boolean;
    lines: StatLine[];
  }

  let ready = $state(false);
  let dbError = $state("");
  let saveError = $state("");
  let view = $state<"train" | "routines" | "history" | "settings">("train");

  // connection settings
  let config = $state<Config>({ ...DEFAULT_CONFIG });
  let draft = $state<Config>({ ...DEFAULT_CONFIG });
  let formError = $state("");
  let conn = $state<ConnState>("disconnected");
  let recent = $state<string[]>([]);

  // routines
  let routines = $state<Routine[]>([]);
  let selectedId = $state("");
  let addGameId = $state(GAMES[1].id);
  let pendingDelete = $state<string | null>(null);

  // history
  let history = $state<db.HistorySession[]>([]);
  let lastPlayed = $state<Record<string, string>>({});
  let pendingSessionDelete = $state<string | null>(null);

  // running a routine
  let run = $state<{
    routine: Routine;
    index: number;
    results: RunResult[];
    sessionId: string;
    startedAt: string;
  } | null>(null);
  let phase = $state<"idle" | "ready" | "running" | "gameDone" | "summary">("idle");
  let session = $state<Session | null>(null);
  let gameStartedAt = "";
  let endsAt = $state<number | null>(null);
  let endedEarly = $state(false);
  let now = $state(Date.now());
  let paused = $state(false);
  let pausedAt = $state(0);
  let pendingAbort = $state(false);

  let client: AutodartsClient;

  const connLabel = $derived(
    conn === "connected" ? "Autodarts connected" : conn === "connecting" ? "Connecting…" : "Not connected",
  );
  const item = $derived(run && phase !== "summary" && phase !== "idle" ? (run.routine.items[run.index] ?? null) : null);
  const def = $derived(item ? gameById(item.gameId) : null);
  const totalMs = $derived(item ? item.minutes * 60_000 : 0);
  const remaining = $derived(endsAt === null ? totalMs : Math.max(0, endsAt - (paused ? pausedAt : now)));
  const result = $derived(session ? session.result : null);
  const hero = $derived(result?.lines.find((l) => l.hero));
  const others = $derived(result?.lines.filter((l) => !l.hero) ?? []);
  const canStart = $derived(!!def && (conn === "connected" || !def.needsDarts));
  const isLast = $derived(run ? run.index + 1 >= run.routine.items.length : false);

  function fmt(ms: number): string {
    const s = Math.ceil(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }

  function failed(e: unknown) {
    saveError = `Could not save to the database: ${e instanceof Error ? e.message : String(e)}`;
  }

  function refreshHistory() {
    db.loadSessions().then((h) => (history = h), failed);
    db.loadLastPlayed().then((l) => (lastPlayed = l), failed);
  }

  // ---- live events

  function onEvent(e: DartEvent) {
    if (e.kind === "dart") recent = [dartLabel(e.dart), ...recent].slice(0, 9);
    if (e.kind === "correction") recent = ["(corrected)", ...recent].slice(0, 9);

    if (phase !== "running" || !session) return;
    // While paused, throws are ignored. Turn ends still apply so the turn tracking stays in step.
    if (paused && e.kind !== "turnEnded") return;
    if (endsAt !== null && Date.now() >= endsAt) {
      finish(false);
      return;
    }
    if (e.kind === "dart" && endsAt === null) {
      now = Date.now();
      endsAt = now + totalMs;
    }
    session.handle(e);
  }

  // ---- running a routine

  function startRoutine() {
    const r = routines.find((x) => x.id === selectedId);
    if (!r || r.items.length === 0) return;
    run = {
      routine: structuredClone($state.snapshot(r)),
      index: 0,
      results: [],
      sessionId: crypto.randomUUID(),
      startedAt: new Date().toISOString(),
    };
    phase = "ready";
  }

  function startGame() {
    if (!item || !def) return;
    session = new Session(def, { ...item.settings });
    endedEarly = false;
    paused = false;
    now = Date.now();
    gameStartedAt = new Date(now).toISOString();
    endsAt = def.needsDarts ? null : now + totalMs;
    phase = "running";
  }

  function finish(early: boolean) {
    if (phase !== "running" || !session || !run || !item || !def) return;
    const res = session.result;
    const turns = $state.snapshot(session.allTurns);
    session.finish();
    paused = false;
    endedEarly = early;
    run.results.push({
      name: def.name,
      minutes: item.minutes,
      early,
      hasResult: def.hasResult,
      lines: res.lines,
    });
    if (def.hasResult) {
      db.saveGameResult({
        sessionId: run.sessionId,
        routineId: run.routine.id,
        routineName: run.routine.name,
        sessionStartedAt: run.startedAt,
        position: run.index,
        gameId: def.id,
        gameName: def.name,
        settings: $state.snapshot(session.settings),
        minutes: item.minutes,
        endedEarly: early,
        startedAt: gameStartedAt,
        finishedAt: new Date().toISOString(),
        values: res.values,
        turns,
      }).then(refreshHistory, failed);
    }
    phase = "gameDone";
  }

  function sessionInfo(r: NonNullable<typeof run>): db.SessionInfo {
    return { sessionId: r.sessionId, routineId: r.routine.id, routineName: r.routine.name, startedAt: r.startedAt };
  }

  function nextGame() {
    if (!run) return;
    session = null;
    endsAt = null;
    run.index++;
    if (run.index >= run.routine.items.length) {
      db.endSession(sessionInfo(run), "completed").then(refreshHistory, failed);
      phase = "summary";
    } else {
      phase = "ready";
    }
  }

  function closeRun() {
    run = null;
    session = null;
    endsAt = null;
    paused = false;
    pendingAbort = false;
    phase = "idle";
  }

  /** Stops the routine at any point. It is recorded as aborted and keeps no scores. */
  function abortRoutine() {
    if (!run) return;
    if (!pendingAbort) {
      pendingAbort = true;
      setTimeout(() => (pendingAbort = false), 4000);
      return;
    }
    db.endSession(sessionInfo(run), "aborted").then(refreshHistory, failed);
    closeRun();
  }

  function pause() {
    if (phase !== "running" || paused) return;
    pausedAt = Date.now();
    paused = true;
  }

  function resume() {
    if (!paused) return;
    // Move the end of the clock by however long we were paused.
    if (endsAt !== null) endsAt += Date.now() - pausedAt;
    paused = false;
    now = Date.now();
  }

  $effect(() => {
    if (phase !== "running") return;
    const id = setInterval(() => {
      if (paused) return;
      now = Date.now();
      if (endsAt !== null && now >= endsAt) finish(false);
    }, 200);
    return () => clearInterval(id);
  });

  $effect(() => {
    if (phase === "running" && result?.done) finish(false);
  });

  // ---- saving routines and the selected routine

  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    if (!ready) return;
    const snapshot = $state.snapshot(routines);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => db.saveRoutines(snapshot).catch(failed), 400);
  });

  $effect(() => {
    if (ready && selectedId) db.setSetting("selected_routine", selectedId).catch(failed);
  });

  // ---- routine editing

  function addRoutine() {
    const r = newRoutine();
    routines.push(r);
    selectedId = r.id;
  }

  function duplicateRoutine(r: Routine) {
    const copy = structuredClone($state.snapshot(r));
    copy.id = crypto.randomUUID();
    copy.name = `${r.name} copy`;
    routines.push(copy);
    selectedId = copy.id;
  }

  function deleteRoutine(id: string) {
    if (pendingDelete !== id) {
      pendingDelete = id;
      return;
    }
    pendingDelete = null;
    if (routines.length <= 1) {
      routines[0].items = [];
      routines[0].name = "New routine";
      routines[0].description = "";
      return;
    }
    routines = routines.filter((r) => r.id !== id);
    selectedId = routines[0].id;
  }

  function addGame(r: Routine) {
    r.items.push(newItem(addGameId));
  }

  function move(r: Routine, i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= r.items.length) return;
    [r.items[i], r.items[j]] = [r.items[j], r.items[i]];
  }

  // ---- history

  function deleteSession(id: string) {
    if (pendingSessionDelete !== id) {
      pendingSessionDelete = id;
      return;
    }
    pendingSessionDelete = null;
    db.deleteSession(id).then(refreshHistory, failed);
  }

  // ---- connection settings

  function saveSettings(ev: Event) {
    ev.preventDefault();
    const host = draft.host.trim();
    const port = Number(draft.port);
    if (!host) return (formError = "Enter the host name or IP address of your Autodarts client.");
    if (!Number.isInteger(port) || port < 1 || port > 65535)
      return (formError = "Port must be a whole number between 1 and 65535.");
    formError = "";
    config = { host, port };
    draft = { ...config };
    db.saveConfig(config).catch(failed);
    client.connect(config.host, config.port);
  }

  function useDefaults() {
    draft = { ...DEFAULT_CONFIG };
  }

  onMount(() => {
    client = new AutodartsClient({ onState: (s) => (conn = s), onEvent });
    (async () => {
      try {
        await db.openDb();
        config = await db.loadConfig();
        draft = { ...config };
        routines = await db.loadRoutines();
        const last = await db.getSetting("selected_routine");
        selectedId = routines.find((r) => r.id === last)?.id ?? routines[0].id;
        history = await db.loadSessions();
        lastPlayed = await db.loadLastPlayed();
        ready = true;
        client.connect(config.host, config.port);
      } catch (e) {
        dbError = e instanceof Error ? e.message : String(e);
      }
    })();
    return () => client.disconnect();
  });
</script>

<header>
  <h1><Logo height={26} /></h1>
  <nav aria-label="Main">
    <button class="tab" aria-current={view === "train" ? "page" : undefined} onclick={() => (view = "train")}>
      Train
    </button>
    <button class="tab" aria-current={view === "routines" ? "page" : undefined} onclick={() => (view = "routines")}>
      Routines
    </button>
    <button class="tab" aria-current={view === "history" ? "page" : undefined} onclick={() => (view = "history")}>
      History
    </button>
  </nav>
  <button
    class="icon"
    aria-label="Settings"
    title="Settings"
    aria-current={view === "settings" ? "page" : undefined}
    onclick={() => (view = "settings")}
  >
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        fill="currentColor"
        d="M19.14 12.94a7.07 7.07 0 0 0 0-1.88l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.03 7.03 0 0 0-1.63-.94l-.36-2.54A.5.5 0 0 0 13.9 2h-3.84a.5.5 0 0 0-.49.42l-.36 2.54c-.59.24-1.13.56-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.67 8.48a.5.5 0 0 0 .12.64l2.03 1.58a7.07 7.07 0 0 0 0 1.88l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.13.22.39.3.6.22l2.39-.96c.5.38 1.04.7 1.63.94l.36 2.54c.05.24.25.42.49.42h3.84c.24 0 .44-.18.49-.42l.36-2.54c.59-.24 1.13-.56 1.63-.94l2.39.96c.22.08.47 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Z"
      />
    </svg>
  </button>
</header>

{#if saveError}
  <p class="banner" role="alert">{saveError}</p>
{/if}

<main>
  {#if dbError}
    <section class="narrow">
      <h2>Can’t open the database</h2>
      <p class="error" role="alert">{dbError}</p>
      <p class="hint">
        ADX keeps all settings, routines and results in a local SQLite database. Start the app with
        <code>npm run tauri dev</code> or use the installed app. Opening the page in a normal browser does not work.
      </p>
    </section>
  {:else if !ready}
    <p class="hint">Opening your data…</p>
  {:else if view === "settings"}
    <section class="narrow">
      <h2>Autodarts connection</h2>
      <p class="lede">ADX listens to the live event stream of your Autodarts client.</p>
      <form onsubmit={saveSettings}>
        <label>
          Host
          <input type="text" bind:value={draft.host} autocomplete="off" spellcheck="false" />
        </label>
        <label>
          Port
          <input type="number" min="1" max="65535" bind:value={draft.port} />
        </label>
        <p class="url">{autodartsUrl(draft.host.trim() || "…", draft.port || 0)}</p>
        {#if formError}<p class="error" role="alert">{formError}</p>{/if}
        {#if conn !== "connected" && !formError}
          <p class="hint">
            Can’t reach Autodarts yet. Check that it is running and that host and port match your setup. Retrying
            automatically.
          </p>
        {/if}
        <div class="row">
          <button type="submit" class="primary">Save and connect</button>
          <button type="button" class="ghost" onclick={useDefaults}>Reset to localhost:3180</button>
        </div>
      </form>

      <h3>Last throws seen</h3>
      {#if recent.length}
        <p class="recent">{recent.join("  ")}</p>
      {:else}
        <p class="hint">Throw a dart. It shows up here, so you know the connection works.</p>
      {/if}
    </section>
  {:else if view === "history"}
    <section class="history">
      <h2>History</h2>
      {#if history.length === 0}
        <p class="hint">No results yet. Finish a game in a routine and it shows up here.</p>
      {/if}
      {#each history as s (s.id)}
        <div class="session">
          <div class="session-head">
            <div>
              <strong>{s.routineName}</strong>
              <span class="plan-meta">{new Date(s.startedAt).toLocaleString()}</span>
              {#if s.status === "aborted"}
                <span class="badge">Aborted</span>
              {:else if s.status === "running"}
                <span class="badge live">In progress</span>
              {/if}
            </div>
            <button class="ghost small danger" onclick={() => deleteSession(s.id)}>
              {pendingSessionDelete === s.id ? "Click again to delete" : "Delete"}
            </button>
          </div>
          {#if s.status !== "aborted"}
            <ul class="plan">
              {#each s.rows as r (r.id)}
                {@const g = gameById(r.gameId)}
                <li>
                  <span class="plan-name">{r.gameName}</span>
                  <span class="plan-meta">{r.minutes} min{r.endedEarly ? ", ended early" : ""}</span>
                  <span class="plan-desc">{g.describe(r.settings)}</span>
                  <span class="plan-desc strong">{g.summary(r.values)}</span>
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      {/each}
    </section>
  {:else if view === "routines"}
    <section class="routines">
      <h2>Routines</h2>
      <div class="chips">
        {#each routines as r (r.id)}
          <button class="tab" aria-current={r.id === selectedId ? "page" : undefined} onclick={() => (selectedId = r.id)}>
            {r.name || "Untitled"}
          </button>
        {/each}
        <button class="ghost small" onclick={addRoutine}>New routine</button>
      </div>

      {#each routines as r (r.id)}
        {#if r.id === selectedId}
          <div class="editor">
            <label>
              Routine name
              <input type="text" bind:value={r.name} />
            </label>
            <label>
              Short description
              <textarea rows="2" maxlength="160" bind:value={r.description} placeholder="What this routine is for, shown on its card"
              ></textarea>
            </label>

            {#if r.items.length === 0}
              <p class="hint">No games yet. Add the first one below.</p>
            {/if}

            {#each r.items as it, i (it)}
              {@const g = gameById(it.gameId)}
              <div class="item">
                <div class="item-head">
                  <strong>{g.name}</strong>
                  <div class="row tight">
                    <button class="ghost small" onclick={() => move(r, i, -1)} disabled={i === 0} aria-label="Move up">
                      Up
                    </button>
                    <button
                      class="ghost small"
                      onclick={() => move(r, i, 1)}
                      disabled={i === r.items.length - 1}
                      aria-label="Move down"
                    >
                      Down
                    </button>
                    <button class="ghost small" onclick={() => r.items.splice(i, 1)}>Remove</button>
                  </div>
                </div>
                <div class="fields">
                  <label>
                    Time cap (minutes)
                    <input type="number" min="1" max="120" bind:value={it.minutes} />
                  </label>
                  {#each g.fields as f (f.key)}
                    <label>
                      {f.label}
                      {#if f.kind === "select"}
                        <select bind:value={it.settings[f.key]}>
                          {#each f.options ?? [] as o (o.value)}
                            <option value={o.value}>{o.label}</option>
                          {/each}
                        </select>
                      {:else}
                        <input type="number" min={f.min} max={f.max} bind:value={it.settings[f.key]} />
                      {/if}
                    </label>
                  {/each}
                </div>
              </div>
            {/each}

            <div class="row">
              <select bind:value={addGameId} aria-label="Game to add">
                {#each GAMES as g (g.id)}
                  <option value={g.id}>{g.name}</option>
                {/each}
              </select>
              <button class="primary" onclick={() => addGame(r)}>Add game</button>
            </div>

            <div class="row">
              <button class="ghost" onclick={() => duplicateRoutine(r)}>Duplicate routine</button>
              <button class="ghost danger" onclick={() => deleteRoutine(r.id)}>
                {pendingDelete === r.id ? "Click again to delete" : "Delete routine"}
              </button>
            </div>
          </div>
        {/if}
      {/each}
    </section>
  {:else if phase === "idle"}
    <section class="pick">
      <h2>Start a routine</h2>
      <RoutineCarousel {routines} bind:selectedId {lastPlayed} onstart={startRoutine} />
    </section>
  {:else if phase === "ready" && run && item && def}
    <section class="narrow">
      <p class="progress">Game {run.index + 1} of {run.routine.items.length}</p>
      <h2>{def.name}</h2>
      <p class="lede">{def.blurb}</p>
      <p class="settings-line">{def.describe(item.settings)}, {item.minutes} min</p>
      {#if def.needsDarts}
        <p class="hint">The clock starts with your first dart.</p>
      {/if}
      <div class="row">
        <button class="primary" onclick={startGame} disabled={!canStart}>Start game</button>
        <button class="ghost danger" onclick={abortRoutine}>{pendingAbort ? "Click again to abort" : "Abort routine"}</button>
      </div>
      {#if !canStart}
        <p class="hint">Connect to Autodarts in Settings first.</p>
      {/if}
    </section>
  {:else if (phase === "running" || phase === "gameDone") && session && result && run && def}
    <section class="stage">
      <div class="panel">
        <p class="progress">Game {run.index + 1} of {run.routine.items.length}: {def.name}</p>
        <div class="clock" class:waiting={endsAt === null} class:paused class:over={phase === "gameDone"}>{fmt(remaining)}</div>
        <p class="note">
          {#if phase === "gameDone"}
            {#if result.done}Completed.{:else if endedEarly}Ended early.{:else}Time is up.{/if}
          {:else if paused}
            Paused. Throws are not counted.
          {:else if endsAt === null}
            Waiting for your first dart.
          {:else}
            Keep throwing.
          {/if}
        </p>

        {#if result.focus}
          <div class="focus">
            <span class="cap">{result.focus.label}</span>
            <span class="big">{result.focus.value}</span>
          </div>
        {/if}

        {#if hero}
          <div class="hero">
            <span class="big">{hero.value}</span>
            <span class="cap">{hero.label}</span>
          </div>
        {/if}

        {#if others.length}
          <dl class="stats">
            {#each others as l (l.key)}
              <div><dt>{l.label}</dt><dd>{l.value}</dd></div>
            {/each}
          </dl>
        {/if}

        <div class="row">
          {#if phase === "running"}
            <button class="primary" onclick={paused ? resume : pause}>{paused ? "Resume" : "Pause"}</button>
            <button class="ghost" onclick={() => finish(true)}>{def.hasResult ? "End game" : "Skip warm up"}</button>
          {:else}
            <button class="primary" onclick={nextGame}>{isLast ? "Finish routine" : "Next game"}</button>
          {/if}
          <button class="ghost danger" onclick={abortRoutine}>{pendingAbort ? "Click again to abort" : "Abort routine"}</button>
        </div>
        {#if phase === "gameDone" && def.hasResult}
          <p class="hint">Result saved. See it under History.</p>
        {/if}
      </div>

      <div class="views">
        <div class="board">
          <Board turns={session.turns} current={session.current} />
        </div>
        <div class="camera">
          <CameraFeed />
        </div>
      </div>
    </section>
  {:else if phase === "summary" && run}
    <section class="narrow">
      <h2>Routine finished</h2>
      <p class="lede">{run.routine.name}</p>
      {#each run.results as r, i (i)}
        <div class="result">
          <h3>{r.name}</h3>
          {#if r.hasResult}
            <dl class="stats">
              {#each r.lines as l (l.key)}
                <div><dt>{l.label}</dt><dd class:strong={l.hero}>{l.value}</dd></div>
              {/each}
            </dl>
          {:else}
            <p class="hint">No result for this game.</p>
          {/if}
        </div>
      {/each}
      <p class="hint">Results are saved. See them under History.</p>
      <div class="row">
        <button class="primary" onclick={closeRun}>Done</button>
      </div>
    </section>
  {/if}
</main>

<footer>
  <div class="meta">
    <span>ADX v{__APP_VERSION__}</span>
    <a href={GITHUB_URL} onclick={(e) => openExternal(e, GITHUB_URL)}>GitHub</a>
    <a href={COFFEE_URL} onclick={(e) => openExternal(e, COFFEE_URL)}>Buy me a coffee</a>
  </div>
  <div class="conn" data-state={conn} role="status">
    <span class="dot"></span>{connLabel}
  </div>
</footer>

<style>
  :global(:root) {
    --bg: #060d12;
    --panel: #0d1b23;
    --line: #1d3440;
    --chalk: #e6ecef;
    --dim: #8aa1ab;
    --accent: #22d3ee;
    --accent-hi: #67e8f9;
    --on-accent: #04161c;
    --ok: #4ade80;
    --dart: #f2c14e;
    --board-dark: #141c1a;
    --board-light: #d8d2bf;
    --board-red: #b8372d;
    --board-green: #2f7d52;
    --board-wire: #8c9c96;
    font-family: "Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif;
    color: var(--chalk);
    background: var(--bg);
  }
  :global(body) {
    margin: 0;
    min-height: 100vh;
    /* The full logo artwork sits behind every view, dimmed so it never competes with the content. */
    background:
      radial-gradient(ellipse at 70% 110%, #0b2b36 0%, transparent 60%) fixed,
      linear-gradient(rgb(6 13 18 / 0.78), rgb(6 13 18 / 0.78)) fixed,
      url("./assets/brand/adx-logo-tagline.webp") center / cover no-repeat fixed,
      var(--bg);
  }
  /* Header and footer stay put; only the content between them scrolls. */
  :global(#app) {
    height: 100vh;
    height: 100dvh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  :global(*) {
    box-sizing: border-box;
  }
  :global(:focus-visible) {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  header {
    flex: none;
    display: flex;
    align-items: center;
    gap: 2rem;
    padding: 0.75rem 1.5rem;
    border-bottom: 1px solid var(--line);
    background: rgb(6 13 18 / 0.85);
  }
  h1 { margin: 0; line-height: 0; }
  nav { display: flex; gap: 0.25rem; flex: 1; }
  .tab {
    background: none;
    border: 0;
    color: var(--dim);
    font: inherit;
    padding: 0.4rem 0.8rem;
    border-radius: 6px;
    cursor: pointer;
  }
  .tab:hover { color: var(--chalk); }
  .tab[aria-current="page"] { color: var(--chalk); background: var(--panel); box-shadow: inset 0 -2px 0 var(--accent); }
  button.icon {
    display: grid;
    place-items: center;
    width: 2.25rem;
    height: 2.25rem;
    border: 0;
    border-radius: 6px;
    background: none;
    color: var(--dim);
    cursor: pointer;
  }
  button.icon:hover { color: var(--chalk); background: var(--panel); }
  button.icon[aria-current="page"] { color: var(--accent); background: var(--panel); }

  footer {
    flex: none;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    padding: 0.6rem 1.5rem;
    border-top: 1px solid var(--line);
    font-size: 0.85rem;
    color: var(--dim);
  }
  .meta { display: flex; gap: 1.25rem; align-items: center; }
  .meta a { color: var(--dim); text-decoration: none; }
  .meta a:hover { color: var(--accent); }
  .conn { display: flex; align-items: center; gap: 0.5rem; color: var(--dim); font-size: 0.9rem; }
  .dot { width: 0.6rem; height: 0.6rem; border-radius: 50%; background: var(--dim); }
  .conn[data-state="connected"] { color: var(--chalk); }
  .conn[data-state="connected"] .dot { background: var(--ok); }
  .conn[data-state="connecting"] .dot { background: var(--dart); }

  /* Full width so the scrollbar sits at the window edge; the padding centres a 1100px column. */
  main {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 2rem max(1.5rem, calc((100% - 1100px) / 2 + 1.5rem)) 3rem;
  }
  h2 { font-size: 1.6rem; margin: 0 0 0.5rem; }
  h3 { font-size: 1.05rem; margin: 2rem 0 0.5rem; }
  .lede { color: var(--dim); max-width: 56ch; line-height: 1.5; margin: 0 0 1.25rem; }
  .hint { color: var(--dim); font-size: 0.9rem; max-width: 56ch; line-height: 1.45; }
  .error { color: #ff9b8f; }
  .progress { color: var(--dim); margin: 0 0 0.35rem; font-size: 0.95rem; }
  .settings-line { margin: 0 0 1rem; }

  .narrow { max-width: 34rem; }
  .pick { max-width: 52rem; margin: 0 auto; }
  .pick h2 { text-align: center; }
  textarea { resize: vertical; line-height: 1.4; }
  label { display: flex; flex-direction: column; gap: 0.35rem; margin-bottom: 1rem; font-size: 0.95rem; }
  input, select, textarea {
    font: inherit;
    color: var(--chalk);
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 0.55rem 0.7rem;
  }
  .url { font-family: ui-monospace, Consolas, monospace; color: var(--dim); font-size: 0.9rem; margin: 0 0 1rem; word-break: break-all; }
  .recent { font-size: 1.2rem; letter-spacing: 0.04em; }

  .row { display: flex; gap: 0.75rem; margin-top: 1.25rem; flex-wrap: wrap; align-items: center; }
  .row.tight { margin-top: 0; gap: 0.4rem; }
  button.primary, button.ghost {
    font: inherit;
    font-weight: 600;
    border-radius: 6px;
    padding: 0.65rem 1.2rem;
    cursor: pointer;
    border: 1px solid transparent;
  }
  button.small { padding: 0.3rem 0.7rem; font-size: 0.9rem; }
  button.primary { background: var(--accent); color: var(--on-accent); }
  button.primary:hover:not(:disabled) { background: var(--accent-hi); }
  button:disabled { opacity: 0.45; cursor: not-allowed; }
  button.ghost { background: none; color: var(--chalk); border-color: var(--line); }
  button.ghost:hover:not(:disabled) { background: var(--panel); }
  button.danger { color: #ff9b8f; }

  .chips { display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: center; margin: 1rem 0 1.5rem; }
  .editor { max-width: 44rem; }
  .item {
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 0.9rem 1rem 0.2rem;
    margin-bottom: 0.9rem;
    background: var(--panel);
  }
  .item-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.8rem; }
  .fields { display: grid; grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr)); gap: 0 1rem; }
  .item input, .item select { background: var(--bg); }

  .plan { padding: 0; margin: 0 0 1rem; list-style: none; border-top: 1px solid var(--line); }
  .plan li {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 0.1rem 1rem;
    padding: 0.65rem 0;
    border-bottom: 1px solid var(--line);
  }
  .plan-name { font-weight: 600; }
  .plan-meta { color: var(--dim); text-align: right; }
  .plan-desc { color: var(--dim); font-size: 0.9rem; grid-column: 1 / -1; }

  .stage { display: grid; grid-template-columns: minmax(280px, 380px) 1fr; gap: 2.5rem; align-items: start; }
  .clock { font-size: 4.5rem; font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1; }
  .clock.waiting { color: var(--dim); }
  .clock.over { color: var(--dart); }
  .clock.paused { color: var(--dart); opacity: 0.75; }
  .note { color: var(--dim); margin: 0.5rem 0 1.5rem; }
  .focus { display: flex; flex-direction: column; margin-bottom: 1.25rem; }
  .focus .big { font-size: 3.6rem; line-height: 1.05; }
  .hero { display: flex; align-items: baseline; gap: 0.75rem; margin-bottom: 1.25rem; }
  .big { font-size: 3.2rem; font-weight: 700; font-variant-numeric: tabular-nums; }
  .cap { color: var(--dim); }
  .stats { margin: 0; border-top: 1px solid var(--line); }
  .stats div { display: flex; justify-content: space-between; padding: 0.55rem 0; border-bottom: 1px solid var(--line); }
  dt { color: var(--dim); }
  dd { margin: 0; font-weight: 600; font-variant-numeric: tabular-nums; }
  dd.strong { color: var(--dart); }
  .result h3 { margin-top: 1.75rem; }

  .banner { flex: none; margin: 0; padding: 0.6rem 1.5rem; background: #5a2420; color: #ffd9d3; }
  code { font-family: ui-monospace, Consolas, monospace; background: var(--panel); padding: 0.1rem 0.35rem; border-radius: 4px; }
  .history { max-width: 44rem; }
  .session { margin-bottom: 2rem; }
  .session-head { display: flex; justify-content: space-between; align-items: center; gap: 1rem; margin-bottom: 0.5rem; }
  .session-head .plan-meta { margin-left: 0.75rem; }
  .plan-desc.strong { color: var(--chalk); font-weight: 600; }
  .badge {
    margin-left: 0.75rem;
    padding: 0.1rem 0.5rem;
    border: 1px solid var(--line);
    border-radius: 999px;
    font-size: 0.85rem;
    color: var(--dim);
  }
  .badge.live { color: var(--dart); border-color: var(--dart); }

  .views { display: flex; flex-direction: column; gap: 1.25rem; align-items: center; }
  .board, .camera { max-width: 400px; width: 100%; }

  @media (max-width: 860px) { .stage { grid-template-columns: 1fr; } }
  @media (prefers-reduced-motion: reduce) { :global(*) { transition: none !important; animation: none !important; } }
</style>
