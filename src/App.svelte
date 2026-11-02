<script lang="ts">
  import { onMount } from "svelte";
  import {
    AutodartsClient,
    autodartsUrl,
    dartLabel,
    type ConnState,
    type DartEvent,
  } from "./lib/autodarts";
  import { DEFAULT_CONFIG, MAX_PAUSE_SECONDS, newRoutine, pauseSeconds, totalSeconds, type Config, type Routine } from "./lib/store";
  import * as db from "./lib/db";
  import { GAMES, gameById, type StatLine } from "./lib/games";
  import { Session } from "./lib/session.svelte";
  import Board from "./lib/Board.svelte";
  import Logo from "./lib/Logo.svelte";
  import Quote from "./lib/Quote.svelte";
  import RoutineCarousel from "./lib/RoutineCarousel.svelte";
  import RoutineItems from "./lib/RoutineItems.svelte";
  import RoutineMenu from "./lib/RoutineMenu.svelte";
  import Select from "./lib/Select.svelte";
  import { COFFEE_URL, GITHUB_URL, openExternal } from "./lib/links";
  import { LOCALES, dateTime, getLocale, isLocale, setLocale, t, type Locale } from "./lib/i18n/index.svelte";

  interface RunResult {
    gameId: string;
    minutes: number;
    early: boolean;
    /** The game reached its own end, before the clock ran out. */
    completed: boolean;
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
  let phase = $state<"idle" | "countdown" | "ready" | "break" | "running" | "summary">("idle");
  let session = $state<Session | null>(null);
  let gameStartedAt = "";
  let endsAt = $state<number | null>(null);
  let now = $state(Date.now());
  let paused = $state(false);
  let pausedAt = $state(0);
  let pendingAbort = $state(false);
  // The countdown before the first game and the break between two games share one clock;
  // the game starts by itself when it runs out.
  let breakEndsAt = $state(0);
  const COUNTDOWN_SECONDS = 5;

  let client: AutodartsClient;

  const connLabel = $derived(
    t(conn === "connected" ? "conn.connected" : conn === "connecting" ? "conn.connecting" : "conn.disconnected"),
  );
  const item = $derived(run && phase !== "summary" && phase !== "idle" ? (run.routine.items[run.index] ?? null) : null);
  const def = $derived(item ? gameById(item.gameId) : null);
  const totalMs = $derived(item ? item.minutes * 60_000 : 0);
  const remaining = $derived(endsAt === null ? totalMs : Math.max(0, endsAt - (paused ? pausedAt : now)));
  const result = $derived(session ? session.result : null);
  const hero = $derived(result?.lines.find((l) => l.hero));
  const others = $derived(result?.lines.filter((l) => !l.hero) ?? []);
  const canStart = $derived(!!def && (conn === "connected" || !def.needsDarts));
  const breakLeft = $derived(Math.max(0, breakEndsAt - (paused ? pausedAt : now)));
  const countdownLeft = $derived(Math.max(1, Math.ceil(breakLeft / 1000)));

  function fmt(ms: number): string {
    const s = Math.ceil(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }

  function failed(e: unknown) {
    saveError = t("error.save", { msg: e instanceof Error ? e.message : String(e) });
  }

  function refreshHistory() {
    db.loadSessions().then((h) => (history = h), failed);
    db.loadLastPlayed().then((l) => (lastPlayed = l), failed);
  }

  // ---- live events

  function onEvent(e: DartEvent) {
    if (e.kind === "dart") recent = [dartLabel(e.dart), ...recent].slice(0, 9);
    if (e.kind === "correction") recent = [t("run.corrected"), ...recent].slice(0, 9);

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
    now = Date.now();
    breakEndsAt = now + COUNTDOWN_SECONDS * 1000;
    phase = "countdown";
  }

  function startGame() {
    if (!item || !def) return;
    session = new Session(def, { ...item.settings });
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
    run.results.push({
      gameId: def.id,
      minutes: item.minutes,
      early,
      completed: res.done,
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
    nextGame();
  }

  function sessionInfo(r: NonNullable<typeof run>): db.SessionInfo {
    return { sessionId: r.sessionId, routineId: r.routine.id, routineName: r.routine.name, startedAt: r.startedAt };
  }

  /** Straight on from a finished game: the break if the routine has one, else the next game. */
  function nextGame() {
    if (!run) return;
    session = null;
    endsAt = null;
    run.index++;
    if (run.index >= run.routine.items.length) {
      db.endSession(sessionInfo(run), "completed").then(refreshHistory, failed);
      phase = "summary";
    } else if (pauseSeconds(run.routine) > 0) {
      now = Date.now();
      breakEndsAt = now + pauseSeconds(run.routine) * 1000;
      phase = "break";
    } else {
      startOrWait();
    }
  }

  /** Ends the break. Without a connection a game with darts can't start, so it waits on its start screen. */
  function endBreak() {
    if (phase === "break" || phase === "countdown") startOrWait();
  }

  function startOrWait() {
    if (canStart) startGame();
    else phase = "ready";
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

  /** While a routine runs, its controls sit in the header as icons, so the screen stays free for darts. */
  const inRun = $derived(!!run && (phase === "countdown" || phase === "break" || phase === "ready" || phase === "running"));
  const skipLabel = $derived(
    phase === "running"
      ? t(def?.hasResult ? "run.endGame" : "run.skipWarmUp")
      : phase === "ready"
        ? t("run.startGame")
        : phase === "countdown" && canStart
          ? t("run.startNow")
          : t("run.skipBreak"),
  );

  /** Moves on: ends the game early, skips the countdown or break, or starts a waiting game. */
  function skip() {
    if (phase === "running") finish(true);
    else if (phase === "ready") startGame();
    else endBreak();
  }

  // A game waiting for the connection starts by itself once Autodarts is there.
  $effect(() => {
    if (phase === "ready" && canStart) startGame();
  });

  /** Pauses a game or the break between games. A paused break doesn't start the next game. */
  function pause() {
    if ((phase !== "running" && phase !== "break") || paused) return;
    pausedAt = Date.now();
    paused = true;
  }

  function resume() {
    if (!paused) return;
    // Move the end of the clock by however long we were paused.
    if (phase === "break") breakEndsAt += Date.now() - pausedAt;
    else if (endsAt !== null) endsAt += Date.now() - pausedAt;
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

  $effect(() => {
    if (phase !== "break" && phase !== "countdown") return;
    const id = setInterval(() => {
      if (paused) return;
      now = Date.now();
      if (now >= breakEndsAt) endBreak();
    }, 200);
    return () => clearInterval(id);
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
    copy.name = t("routines.copyName", { name: r.name });
    routines.push(copy);
    selectedId = copy.id;
  }

  /** The menu has already asked for confirmation. */
  function deleteRoutine(id: string) {
    if (routines.length <= 1) {
      routines[0].items = [];
      routines[0].name = t("routines.new");
      routines[0].description = "";
      return;
    }
    routines = routines.filter((r) => r.id !== id);
    selectedId = routines[0].id;
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
    if (!host) return (formError = t("settings.hostRequired"));
    if (!Number.isInteger(port) || port < 1 || port > 65535)
      return (formError = t("settings.portInvalid"));
    formError = "";
    config = { host, port };
    draft = { ...config };
    db.saveConfig(config).catch(failed);
    client.connect(config.host, config.port);
  }

  function useDefaults() {
    draft = { ...DEFAULT_CONFIG };
  }

  function changeLanguage(l: Locale) {
    setLocale(l);
    db.setSetting("language", l).catch(failed);
  }

  onMount(() => {
    client = new AutodartsClient({ onState: (s) => (conn = s), onEvent });
    (async () => {
      try {
        await db.openDb();
        // Before the routines load, so a first start names its starter routine in this language.
        const lang = await db.getSetting("language");
        setLocale(isLocale(lang) ? lang : getLocale());
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
  <nav aria-label={t("nav.main")}>
    <button class="tab" aria-current={view === "train" ? "page" : undefined} onclick={() => (view = "train")}>
      {t("nav.train")}
    </button>
    <button class="tab" aria-current={view === "routines" ? "page" : undefined} onclick={() => (view = "routines")}>
      {t("nav.routines")}
    </button>
    <button class="tab" aria-current={view === "history" ? "page" : undefined} onclick={() => (view = "history")}>
      {t("nav.history")}
    </button>
  </nav>
  {#if inRun}
    <div class="run-controls" role="group" aria-label={t("run.controls")}>
      <button
        class="icon"
        class:active={paused}
        aria-label={paused ? t("run.resume") : t("run.pause")}
        title={paused ? t("run.resume") : t("run.pause")}
        onclick={paused ? resume : pause}
        disabled={phase !== "running" && phase !== "break"}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          {#if paused}
            <path fill="currentColor" d="M8 5.14v13.72a1 1 0 0 0 1.52.85l10.8-6.86a1 1 0 0 0 0-1.7L9.52 4.29A1 1 0 0 0 8 5.14Z" />
          {:else}
            <path fill="currentColor" d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" />
          {/if}
        </svg>
      </button>
      <button class="icon" aria-label={skipLabel} title={skipLabel} onclick={skip} disabled={phase === "ready" && !canStart}>
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path fill="currentColor" d="M5 6.07v11.86a1 1 0 0 0 1.55.83L15 13.1V18a1 1 0 0 0 2 0V6a1 1 0 0 0-2 0v4.9L6.55 5.24A1 1 0 0 0 5 6.07Z" />
        </svg>
      </button>
      <span class="abort-wrap">
        <button
          class="icon abort"
          class:armed={pendingAbort}
          aria-label={pendingAbort ? t("run.confirmAbort") : t("run.abort")}
          title={pendingAbort ? undefined : t("run.abort")}
          onclick={abortRoutine}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor" />
          </svg>
        </button>
        <!-- The icon can't change its text, so the second click is asked for right next to it. -->
        {#if pendingAbort}
          <span class="confirm-bubble" role="status">{t("run.confirmAbort")}</span>
        {/if}
      </span>
    </div>
  {/if}
  <button
    class="icon"
    aria-label={t("nav.settings")}
    title={t("nav.settings")}
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
      <h2>{t("db.title")}</h2>
      <p class="error" role="alert">{dbError}</p>
      <p class="hint">
        {t("db.hintBefore")} <code>npm run tauri dev</code> {t("db.hintAfter")}
      </p>
    </section>
  {:else if !ready}
    <section class="countdown">
      <Quote />
      <p class="hint">{t("db.loading")}</p>
    </section>
  {:else if view === "settings"}
    <section class="narrow">
      <h2>{t("settings.connTitle")}</h2>
      <p class="lede">{t("settings.connLede")}</p>
      <form onsubmit={saveSettings}>
        <label>
          {t("settings.host")}
          <input type="text" bind:value={draft.host} autocomplete="off" spellcheck="false" />
        </label>
        <label>
          {t("settings.port")}
          <input type="number" min="1" max="65535" bind:value={draft.port} />
        </label>
        <p class="url">{autodartsUrl(draft.host.trim() || "…", draft.port || 0)}</p>
        {#if formError}<p class="error" role="alert">{formError}</p>{/if}
        {#if conn !== "connected" && !formError}
          <p class="hint">
            {t("settings.unreachable")}
          </p>
        {/if}
        <div class="row">
          <button type="submit" class="primary">{t("settings.save")}</button>
          <button type="button" class="ghost" onclick={useDefaults}>{t("settings.reset")}</button>
        </div>
      </form>

      <h3>{t("settings.recentTitle")}</h3>
      {#if recent.length}
        <p class="recent">{recent.join("  ")}</p>
      {:else}
        <p class="hint">{t("settings.recentEmpty")}</p>
      {/if}

      <h3>{t("settings.languageTitle")}</h3>
      <label>
        {t("settings.language")}
        <Select
          value={getLocale()}
          options={LOCALES.map((l) => ({ value: l.id, label: l.name }))}
          onchange={(id) => changeLanguage(id)}
        />
      </label>
    </section>
  {:else if view === "history"}
    <section class="history">
      <h2>{t("history.title")}</h2>
      {#if history.length === 0}
        <p class="hint">{t("history.empty")}</p>
      {/if}
      {#each history as s (s.id)}
        <div class="session">
          <div class="session-head">
            <div>
              <strong>{s.routineName}</strong>
              <span class="plan-meta">{dateTime(s.startedAt)}</span>
              {#if s.status === "aborted"}
                <span class="badge">{t("history.aborted")}</span>
              {:else if s.status === "running"}
                <span class="badge live">{t("history.running")}</span>
              {/if}
            </div>
            <button class="ghost small danger" onclick={() => deleteSession(s.id)}>
              {pendingSessionDelete === s.id ? t("common.confirmDelete") : t("common.delete")}
            </button>
          </div>
          {#if s.status !== "aborted"}
            <ul class="plan">
              {#each s.rows as r (r.id)}
                {@const g = gameById(r.gameId)}
                <li>
                  <!-- The stored name is in the language of the day it was played, unless the game still exists. -->
                  <span class="plan-name">{g.id === r.gameId ? g.name : r.gameName}</span>
                  <span class="plan-meta">{t(r.endedEarly ? "history.minutesEarly" : "common.minutes", { n: r.minutes })}</span>
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
      <h2>{t("routines.title")}</h2>
      <div class="chips">
        {#each routines as r (r.id)}
          <button class="tab" aria-current={r.id === selectedId ? "page" : undefined} onclick={() => (selectedId = r.id)}>
            {r.name || t("common.untitled")}
          </button>
        {/each}
        <button class="ghost small" onclick={addRoutine}>{t("routines.new")}</button>
      </div>

      {#each routines as r (r.id)}
        {#if r.id === selectedId}
          <div class="editor">
            <div class="name-row">
              <label>
                {t("routines.name")}
                <input type="text" bind:value={r.name} />
              </label>
              <RoutineMenu onduplicate={() => duplicateRoutine(r)} ondelete={() => deleteRoutine(r.id)} />
            </div>
            <label>
              {t("routines.description")}
              <textarea rows="2" maxlength="160" bind:value={r.description} placeholder={t("routines.descriptionPlaceholder")}
              ></textarea>
            </label>
            <label class="pause-field">
              {t("routines.pause")}
              <input type="number" min="0" max={MAX_PAUSE_SECONDS} step="15" bind:value={r.pauseSeconds} />
              <span class="hint">{t("routines.pauseHint")}</span>
            </label>

            <RoutineItems items={r.items} totalSeconds={totalSeconds(r)} />
          </div>
        {/if}
      {/each}
    </section>
  {:else if phase === "idle"}
    <section class="pick">
      <h2>{t("train.title")}</h2>
      <RoutineCarousel {routines} bind:selectedId {lastPlayed} onstart={startRoutine} />
    </section>
  {:else if phase === "countdown" && run && item && def}
    <section class="countdown">
      <p class="progress">{run.routine.name}</p>
      {#key countdownLeft}
        <div class="count" aria-live="assertive">{countdownLeft}</div>
      {/key}
      <p class="lede">{t("run.firstUp", { name: def.name })}</p>
      <Quote />
      {#if !canStart}
        <p class="hint">{t("run.connectFirst")}</p>
      {/if}
    </section>
  {:else if phase === "break" && run && item && def}
    {@const last = run.results.at(-1)}
    {@const lastHero = last?.lines.find((l) => l.hero)}
    <section class="break">
      <p class="progress">{t("run.breakTitle")}</p>
      <div class="clock" class:paused>{fmt(breakLeft)}</div>
      <p class="note">{t(paused ? "run.breakPaused" : "run.breakNote")}</p>
      <Quote />
      <div class="cards">
        {#if last}
          <div class="card">
            <p class="progress">{t("run.finishedGame", { n: run.index, total: run.routine.items.length })}</p>
            <h2>{gameById(last.gameId).name}</h2>
            <p class="lede">{t(last.completed ? "run.completed" : last.early ? "run.endedEarly" : "run.timeUp")}</p>
            {#if last.hasResult && lastHero}
              <p class="last-hero"><strong>{lastHero.value}</strong> {lastHero.label}</p>
            {/if}
          </div>
        {/if}
        <div class="card">
          <p class="progress">{t("run.upNext", { n: run.index + 1, total: run.routine.items.length })}</p>
          <h2>{def.name}</h2>
          <p class="lede">{def.blurb}</p>
          <p class="settings-line">{t("run.settingsLine", { desc: def.describe(item.settings), n: item.minutes })}</p>
          {#if def.needsDarts}
            <p class="hint">{t("run.clockHint")}</p>
          {/if}
        </div>
      </div>
      {#if !canStart}
        <p class="hint">{t("run.connectFirst")}</p>
      {/if}
    </section>
  {:else if phase === "ready" && run && item && def}
    <section class="narrow">
      <p class="progress">{t("run.progress", { n: run.index + 1, total: run.routine.items.length })}</p>
      <h2>{def.name}</h2>
      <p class="lede">{def.blurb}</p>
      <p class="settings-line">{t("run.settingsLine", { desc: def.describe(item.settings), n: item.minutes })}</p>
      {#if def.needsDarts}
        <p class="hint">{t("run.clockHint")}</p>
      {/if}
      {#if !canStart}
        <p class="hint">{t("run.connectFirst")}</p>
      {/if}
    </section>
  {:else if phase === "running" && session && result && run && def}
    <section class="stage">
      <div class="panel">
        <p class="progress">{t("run.progressNamed", { n: run.index + 1, total: run.routine.items.length, name: def.name })}</p>
        <div class="clock" class:waiting={endsAt === null} class:paused>{fmt(remaining)}</div>
        <p class="note">
          {#if paused}
            {t("run.paused")}
          {:else if endsAt === null}
            {t("run.waiting")}
          {:else}
            {t("run.keepThrowing")}
          {/if}
        </p>
        {#if paused}
          <Quote />
        {/if}

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
      </div>

      <div class="views">
        <div class="darts" aria-label={t("run.dartsAria")}>
          {#each [0, 1, 2] as i (i)}
            {@const d = session.current[i]}
            <div class="dart-box" class:filled={d}>{d ? dartLabel(d) : "–"}</div>
          {/each}
        </div>
        <div class="board">
          <Board turns={session.turns} current={session.current} />
        </div>
      </div>
    </section>
  {:else if phase === "summary" && run}
    <section class="narrow">
      <h2>{t("summary.title")}</h2>
      <p class="lede">{run.routine.name}</p>
      {#each run.results as r, i (i)}
        <div class="result">
          <h3>{gameById(r.gameId).name}</h3>
          {#if r.hasResult}
            <dl class="stats">
              {#each r.lines as l (l.key)}
                <div><dt>{l.label}</dt><dd class:strong={l.hero}>{l.value}</dd></div>
              {/each}
            </dl>
          {:else}
            <p class="hint">{t("summary.noResult")}</p>
          {/if}
        </div>
      {/each}
      <p class="hint">{t("summary.saved")}</p>
      <div class="row">
        <button class="primary" onclick={closeRun}>{t("summary.done")}</button>
      </div>
    </section>
  {/if}
</main>

<footer>
  <div class="meta">
    <span>ADX v{__APP_VERSION__}</span>
    <a href={GITHUB_URL} onclick={(e) => openExternal(e, GITHUB_URL)}>GitHub</a>
    <a href={COFFEE_URL} onclick={(e) => openExternal(e, COFFEE_URL)}>{t("footer.coffee")}</a>
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
  button.icon:disabled { opacity: 0.35; cursor: not-allowed; background: none; color: var(--dim); }
  .run-controls { display: flex; gap: 0.25rem; padding-right: 0.75rem; margin-right: -1.25rem; border-right: 1px solid var(--line); }
  .run-controls button.icon.active { color: var(--accent); background: var(--panel); }
  .run-controls button.icon.abort:hover, .run-controls button.icon.armed { color: #ff9b8f; }
  .run-controls button.icon.armed { background: rgb(255 155 143 / 0.15); }
  .abort-wrap { position: relative; }
  .confirm-bubble {
    position: absolute;
    top: calc(100% + 0.6rem);
    right: -0.25rem;
    z-index: 10;
    padding: 0.45rem 0.75rem;
    border: 1px solid #ff9b8f;
    border-radius: 6px;
    background: #3a1a17;
    color: #ffd9d3;
    font-size: 0.9rem;
    font-weight: 600;
    white-space: nowrap;
    box-shadow: 0 6px 18px rgb(0 0 0 / 0.4);
    animation: bubble-in 0.15s ease-out both;
  }
  .confirm-bubble::before {
    content: "";
    position: absolute;
    bottom: 100%;
    right: 0.95rem;
    border: 6px solid transparent;
    border-bottom-color: #ff9b8f;
  }
  @keyframes bubble-in {
    from { opacity: 0; transform: translateY(-4px); }
  }

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
  .error { color: #ff9b8f; }
  .progress { color: var(--dim); margin: 0 0 0.35rem; font-size: 0.95rem; }
  .settings-line { margin: 0 0 1rem; }

  .narrow { max-width: 34rem; }
  .pause-field { max-width: 22rem; }
  .pause-field input { max-width: 8rem; }
  .pause-field .hint { margin: 0; }
  .countdown { display: flex; flex-direction: column; align-items: center; text-align: center; padding-top: 3rem; }
  .countdown .lede { margin: 0.5rem 0 0; }
  .count {
    font-size: 11rem;
    font-weight: 700;
    line-height: 1;
    color: var(--accent);
    font-variant-numeric: tabular-nums;
    animation: count-in 1s ease-out both;
  }
  @keyframes count-in {
    from { opacity: 0; transform: scale(1.35); }
    25% { opacity: 1; transform: scale(1); }
    to { opacity: 0.85; }
  }
  .break { display: flex; flex-direction: column; align-items: center; text-align: center; max-width: 60rem; margin: 0 auto; }
  .break .progress { margin: 0; }
  .break .clock { font-size: 4rem; margin: 0.25rem 0 0; }
  .break .note { margin-bottom: 0; }
  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
    gap: 1rem;
    width: 100%;
    margin-top: 0.5rem;
  }
  .card {
    padding: 1rem 1.25rem 0.25rem;
    border: 1px solid var(--line);
    border-left: 3px solid var(--accent);
    border-radius: 8px;
    background: var(--panel);
    text-align: left;
  }
  .card h2 { margin-bottom: 0.35rem; }
  .card .lede { margin-bottom: 0.75rem; }
  .last-hero { margin: 0 0 1rem; color: var(--dim); }
  .last-hero strong { color: var(--dart); font-size: 1.6rem; font-variant-numeric: tabular-nums; margin-right: 0.25rem; }
  .pick { max-width: 52rem; margin: 0 auto; }
  .pick h2 { text-align: center; }
  /* Shared form controls and buttons, also used by components in lib/. */
  :global {
    .hint { color: var(--dim); font-size: 0.9rem; max-width: 56ch; line-height: 1.45; }
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
    .row { display: flex; gap: 0.75rem; margin-top: 1.25rem; flex-wrap: wrap; align-items: center; }
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
  }
  .url { font-family: ui-monospace, Consolas, monospace; color: var(--dim); font-size: 0.9rem; margin: 0 0 1rem; word-break: break-all; }
  .recent { font-size: 1.2rem; letter-spacing: 0.04em; }

  .chips { display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: center; margin: 1rem 0 1.5rem; }
  .editor { max-width: 44rem; }
  .name-row { display: flex; align-items: flex-end; gap: 0.5rem; }
  .name-row label { flex: 1; }
  .name-row :global(.menu) { margin-bottom: 1rem; }

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
  .board, .darts { max-width: 400px; width: 100%; }
  .darts { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem; }
  .dart-box {
    padding: 0.6rem 0;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--panel);
    color: var(--dim);
    text-align: center;
    font-size: 1.5rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .dart-box.filled { color: var(--dart); border-color: var(--dart); }

  @media (max-width: 860px) { .stage { grid-template-columns: 1fr; } }
  @media (prefers-reduced-motion: reduce) { :global(*) { transition: none !important; animation: none !important; } }
</style>
