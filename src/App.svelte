<script lang="ts">
  import { onMount } from "svelte";
  import {
    AutodartsClient,
    autodartsUrl,
    dartLabel,
    type BoardStatus,
    type ThrowPhase,
    type ConnState,
    type DartEvent,
  } from "./lib/autodarts";
  import { DEFAULT_CONFIG, MAX_PAUSE_SECONDS, newRoutine, pauseSeconds, totalSeconds, type Config, type Routine } from "./lib/store";
  import * as db from "./lib/db";
  import { GAMES, gameById, type StatLine } from "./lib/games";
  import { Session } from "./lib/session.svelte";
  import Board from "./lib/Board.svelte";
  import DartMeter from "./lib/DartMeter.svelte";
  import Logo from "./lib/Logo.svelte";
  import Quote from "./lib/Quote.svelte";
  import RoutineCarousel from "./lib/RoutineCarousel.svelte";
  import RoutineItems from "./lib/RoutineItems.svelte";
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
  type View = "train" | "routines" | "history" | "settings";
  let view = $state<View>("train");

  // connection settings
  let config = $state<Config>({ ...DEFAULT_CONFIG });
  let draft = $state<Config>({ ...DEFAULT_CONFIG });
  let formError = $state("");
  let conn = $state<ConnState>("disconnected");
  let board = $state<BoardStatus>("unknown");
  let throwPhase = $state<ThrowPhase>(null);
  let startError = $state(false);
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
  // The websocket only says the client is up; what it is doing shows as an icon behind it.
  const boardLabel = $derived(board === "unknown" ? "" : t(`board.${board}`));
  // Darts are only detected while the client runs, not merely while it is connected.
  const detecting = $derived(conn === "connected" && board === "running");
  const item = $derived(run && phase !== "summary" && phase !== "idle" ? (run.routine.items[run.index] ?? null) : null);
  const def = $derived(item ? gameById(item.gameId) : null);
  const totalMs = $derived(item ? item.minutes * 60_000 : 0);
  const remaining = $derived(endsAt === null ? totalMs : Math.max(0, endsAt - (paused ? pausedAt : now)));
  const result = $derived(session ? session.result : null);
  const hero = $derived(result?.lines.find((l) => l.hero));
  const others = $derived(result?.lines.filter((l) => !l.hero) ?? []);
  // After a bust the turn is over: darts of the shown turn from here on don't count, its empty boxes are closed.
  const bustAt = $derived(session && result?.noScore?.turn === session.shownTurn ? result.noScore.darts : 3);
  const canStart = $derived(!!def && (detecting || !def.needsDarts));
  // A game with darts can't go on without the detection, so it waits paused until Autodarts is back.
  const waiting = $derived(phase === "running" && !!def?.needsDarts && !detecting);
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
    endsAt = now + totalMs;
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
    if (!paused || waiting) return;
    // Move the end of the clock by however long we were paused.
    if (phase === "break") breakEndsAt += Date.now() - pausedAt;
    else if (endsAt !== null) endsAt += Date.now() - pausedAt;
    paused = false;
    now = Date.now();
  }

  // Paused by the lost detection, so it picks up by itself once the detection runs again.
  // A pause the player made stays until they resume.
  let autoPaused = false;
  $effect(() => {
    if (waiting && !paused) {
      pause();
      autoPaused = true;
    } else if (!waiting && autoPaused) {
      autoPaused = false;
      resume();
    }
  });

  function startDetection() {
    startError = false;
    client.start().catch(() => (startError = true));
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

  // A bust in a checkout game shows "No Score" for a moment. The game names the busted turn,
  // so a correction that makes a turn bust shows it too, and a bust right after another one as well.
  const NO_SCORE_MS = 2000;
  let noScoreAt = $state<number | null>(null);
  let seenNoScore: number | undefined;
  let noScoreTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    const n = phase === "running" ? result?.noScore?.turn : undefined;
    if (n !== undefined && n !== seenNoScore) {
      clearTimeout(noScoreTimer);
      noScoreAt = n;
      noScoreTimer = setTimeout(() => (noScoreAt = null), NO_SCORE_MS);
    }
    seenNoScore = n;
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
  // Routines are picked in the Train carousel; "routines" is the editor for the selected one.

  // A routine made with "New routine" counts as a draft until it has games or the user keeps it empty.
  let draftId = $state<string | null>(null);
  let selectedBeforeDraft = "";
  let emptyDialog = $state<HTMLDialogElement>();
  let leaveTo = $state<View>("train");
  let pendingRoutineDelete = $state(false);
  const editing = $derived(routines.find((r) => r.id === selectedId));

  /** Every way out of a view goes through here, so leaving an empty draft can ask first. */
  function go(next: View) {
    if (view === "routines" && next !== "routines") {
      const draft = routines.find((r) => r.id === draftId);
      if (draft && !draft.items.length) {
        leaveTo = next;
        emptyDialog?.showModal();
        return;
      }
      draftId = null;
    }
    pendingRoutineDelete = false;
    view = next;
  }

  function keepEmptyDraft() {
    draftId = null;
    emptyDialog?.close();
    go(leaveTo);
  }

  function discardEmptyDraft() {
    routines = routines.filter((r) => r.id !== draftId);
    selectedId = routines.find((r) => r.id === selectedBeforeDraft)?.id ?? routines[0].id;
    draftId = null;
    emptyDialog?.close();
    go(leaveTo);
  }

  function addRoutine() {
    const r = newRoutine();
    routines.push(r);
    selectedBeforeDraft = selectedId;
    selectedId = r.id;
    draftId = r.id;
    go("routines");
  }

  function duplicateRoutine(r: Routine) {
    const copy = structuredClone($state.snapshot(r));
    copy.id = crypto.randomUUID();
    copy.name = t("routines.copyName", { name: r.name });
    routines.push(copy);
    selectedId = copy.id;
    // Duplicating a draft keeps it, so only the copy is new now.
    draftId = null;
    pendingRoutineDelete = false;
  }

  /** The first click asks, the second deletes. */
  function deleteRoutine(id: string) {
    if (!pendingRoutineDelete) {
      pendingRoutineDelete = true;
      return;
    }
    if (draftId === id) draftId = null;
    if (routines.length <= 1) {
      routines[0].items = [];
      routines[0].name = t("routines.new");
      routines[0].description = "";
    } else {
      routines = routines.filter((r) => r.id !== id);
      selectedId = routines[0].id;
    }
    go("train");
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
    client = new AutodartsClient({ onState: (s) => (conn = s), onBoard: (s) => (board = s), onPhase: (p) => (throwPhase = p), onEvent });
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

<!-- Why a game with darts can't start or go on: no connection, or the detection isn't running. -->
{#snippet waitHint()}
  {#if conn !== "connected"}
    <p class="hint">{t("run.connectFirst")}</p>
  {:else}
    <p class="hint wait-hint">
      {t("run.detectionOff", { status: t(`board.${board}`) })}
      {#if board === "stopped"}
        <button class="ghost small" onclick={startDetection}>{t("run.startDetection")}</button>
      {/if}
    </p>
    {#if startError}<p class="error" role="alert">{t("run.startFailed")}</p>{/if}
  {/if}
{/snippet}

<!-- Escape stops correcting a dart. -->
<svelte:window onkeydown={(e) => e.key === "Escape" && session?.editing && (session.editing = null)} />

<header>
  <h1><Logo height={26} /></h1>
  <nav aria-label={t("nav.main")}>
    <button class="tab" aria-current={view === "train" || view === "routines" ? "page" : undefined} onclick={() => go("train")}>
      {t("nav.train")}
    </button>
    <button class="tab" aria-current={view === "history" ? "page" : undefined} onclick={() => go("history")}>
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
        disabled={(phase !== "running" && phase !== "break") || waiting}
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
    onclick={() => go("settings")}
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
      <button class="back" onclick={() => go("train")}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M20 11H7.8l5.6-5.6L12 4l-8 8 8 8 1.4-1.4L7.8 13H20z" /></svg>
        {t("routines.back")}
      </button>
      <div class="edit-head">
        <h2>{t("routines.editTitle")}</h2>
        {#if editing}
          {@const r = editing}
          <button class="icon" aria-label={t("routines.duplicate")} title={t("routines.duplicate")} onclick={() => duplicateRoutine(r)}>
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path
                fill="currentColor"
                d="M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1Zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Zm0 16H8V7h11v14Z"
              />
            </svg>
          </button>
          <span class="delete-wrap">
            <button
              class="icon delete"
              class:armed={pendingRoutineDelete}
              aria-label={pendingRoutineDelete ? t("common.confirmDelete") : t("routines.delete")}
              title={pendingRoutineDelete ? undefined : t("routines.delete")}
              onclick={() => deleteRoutine(r.id)}
            >
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                <path fill="currentColor" d="M9 3v1H4v2h1v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6h1V4h-5V3H9Zm-2 3h10v13H7V6Zm2 2v9h2V8H9Zm4 0v9h2V8h-2Z" />
              </svg>
            </button>
            <!-- The icon can't change its text, so the second click is asked for right next to it. -->
            {#if pendingRoutineDelete}
              <span class="confirm-bubble" role="status">{t("common.confirmDelete")}</span>
            {/if}
          </span>
        {/if}
      </div>

      {#each routines as r (r.id)}
        {#if r.id === selectedId}
          <div class="editor">
            <label>
              {t("routines.name")}
              <input type="text" bind:value={r.name} />
            </label>
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
      <div class="pick-head">
        <h2>{t("train.title")}</h2>
        <button class="ghost small new" onclick={addRoutine}>
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z" /></svg>
          {t("routines.new")}
        </button>
      </div>
      <RoutineCarousel {routines} bind:selectedId {lastPlayed} onstart={startRoutine} onedit={() => go("routines")} />
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
        {@render waitHint()}
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
        </div>
      </div>
      {#if !canStart}
        {@render waitHint()}
      {/if}
    </section>
  {:else if phase === "ready" && run && item && def}
    <section class="narrow">
      <p class="progress">{t("run.progress", { n: run.index + 1, total: run.routine.items.length })}</p>
      <h2>{def.name}</h2>
      <p class="lede">{def.blurb}</p>
      <p class="settings-line">{t("run.settingsLine", { desc: def.describe(item.settings), n: item.minutes })}</p>
      {#if !canStart}
        {@render waitHint()}
      {/if}
    </section>
  {:else if phase === "running" && session && result && run && def}
    <section class="stage">
      <div class="panel">
        <p class="progress">{t("run.progressNamed", { n: run.index + 1, total: run.routine.items.length, name: def.name })}</p>
        <div class="clock" class:paused>{fmt(remaining)}</div>
        <p class="note">
          {#if waiting}
            {t("run.waitingForBoard")}
          {:else if paused}
            {t("run.paused")}
          {:else}
            {t("run.keepThrowing")}
          {/if}
        </p>
        {#if waiting}
          {@render waitHint()}
        {:else if paused}
          <Quote />
        {/if}

        {#if result.focus}
          <div class="focus">
            <span class="cap">{result.focus.label}</span>
            <!-- Words ("Single bull", "Success") get a smaller size so they fit the box. -->
            <span class="big" class:long={result.focus.value.length > 4}>{result.focus.value}</span>
          </div>
        {/if}

        {#if result.darts}
          <DartMeter {...result.darts} />
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
        <!-- A thrown dart is corrected by clicking its box, then the field it really hit on the board.
             A click on the board without a box picked sets the next dart. -->
        <div class="darts" role="group" aria-label={t("run.dartsAria")}>
          <!-- What Autodarts waits for: darts, the takeout, or the hand pulling them. -->
          {#if throwPhase && !waiting}
            <span class="phase" data-phase={throwPhase} title={t(`phase.${throwPhase}`)} role="status">
              <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                {#if throwPhase === "throw"}
                  <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2" />
                  <circle cx="12" cy="12" r="5" fill="none" stroke="currentColor" stroke-width="2" />
                  <circle cx="12" cy="12" r="1.6" fill="currentColor" />
                {:else}
                  <path fill="currentColor" d="M21 7.5V19a4 4 0 0 1-4 4h-6.2a4 4 0 0 1-2.83-1.17L2 15.83l1.24-1.22a1.2 1.2 0 0 1 1.46-.18L8 16.3V5.5a1.5 1.5 0 0 1 3 0V12h1V3.5a1.5 1.5 0 0 1 3 0V12h1V4.5a1.4 1.4 0 0 1 2.8 0V12h.4V7.5a.9 .9 0 0 1 1.8 0Z" />
                {/if}
              </svg>
              <span class="sr-only">{t(`phase.${throwPhase}`)}</span>
            </span>
          {/if}
          <!-- Ends the turn by hand, e.g. one set on the board; empty boxes count as misses. -->
          {#if !paused}
            <button class="icon next-turn" title={t("run.nextTurn")} aria-label={t("run.nextTurn")} onclick={() => session?.endTurn()}>
              <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                <path fill="currentColor" d="M3 11h11.2l-4.6-4.6L11 5l7 7-7 7-1.4-1.4 4.6-4.6H3zM19 5h2v14h-2z" />
              </svg>
            </button>
          {/if}
          {#each [0, 1, 2] as i (i)}
            {@const d = session.shown[i]}
            {#if d}
              <button
                class="dart-box filled"
                class:done={!session.current.length}
                class:void={i >= bustAt}
                class:editing={session.edit === i}
                class:fixed={d.method === "manual"}
                aria-pressed={session.edit === i}
                aria-label={t("run.correctDart", { n: i + 1, dart: dartLabel(d) })}
                onclick={() => session?.toggleEdit(i)}
              >{dartLabel(d)}</button>
            {:else}
              <div class="dart-box" class:closed={i >= bustAt} title={i >= bustAt ? t("run.noScoreHint") : undefined}>{i >= bustAt ? "✕" : "–"}</div>
            {/if}
          {/each}
        </div>
        <p class="pick-hint" class:show={session.edit !== null} aria-live="polite">
          {session.edit !== null ? t("run.pickHint", { n: session.edit + 1 }) : ""}
        </p>
        <div class="board">
          <Board
            turns={session.allTurns.filter((_, k) => k !== session?.shownTurn)}
            current={session.shown}
            targets={result.targets}
            picking={session.edit !== null || (!paused && session.canAdd)}
            onpick={(d) => (session?.edit !== null ? session?.correct(d) : !paused && session?.add(d))}
          />
        </div>
      </div>

      <!-- Over the whole game, but clicks pass through, so the busted dart can still be corrected. -->
      {#if noScoreAt !== null}
        {#key noScoreAt}
          <div class="no-score" role="status" style:--no-score-ms="{NO_SCORE_MS}ms">
            <div class="stamp">
              <span class="word">{t("run.noScore")}</span>
              <span class="why">{t("run.noScoreHint")}</span>
            </div>
          </div>
        {/key}
      {/if}
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

<!-- Asked when leaving the editor of a new routine that still has no games. Escape or the backdrop stays. -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<dialog
  class="confirm"
  bind:this={emptyDialog}
  aria-labelledby="empty-title"
  onclick={(e) => {
    if (e.target === emptyDialog) emptyDialog.close();
  }}
>
  <h3 id="empty-title">{t("routines.emptyTitle")}</h3>
  <p class="lede">
    {t("routines.emptyBody", { name: routines.find((r) => r.id === draftId)?.name || t("common.untitled") })}
  </p>
  <div class="foot">
    <button class="ghost" onclick={discardEmptyDraft}>{t("routines.discard")}</button>
    <button class="primary" onclick={keepEmptyDraft}>{t("routines.keep")}</button>
  </div>
</dialog>

<footer>
  <div class="meta">
    <span>D³ v{__APP_VERSION__}</span>
    <a href={GITHUB_URL} onclick={(e) => openExternal(e, GITHUB_URL)}>GitHub</a>
    <a href={COFFEE_URL} onclick={(e) => openExternal(e, COFFEE_URL)}>{t("footer.coffee")}</a>
  </div>
  <div class="conn" data-state={conn} data-board={conn === "connected" && !detecting ? "idle" : undefined} role="status">
    <span class="dot"></span>{connLabel}
    {#if conn === "connected" && board !== "unknown"}
      <span class="board-icon" data-board={board} title={boardLabel}>
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          {#if board === "running"}
            <path fill="currentColor" d="M8 5.14v13.72a1 1 0 0 0 1.52.85l10.8-6.86a1 1 0 0 0 0-1.7L9.52 4.29A1 1 0 0 0 8 5.14Z" />
          {:else if board === "stopped"}
            <path fill="currentColor" d="M7 6h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z" />
          {:else if board === "starting" || board === "stopping"}
            <path fill="currentColor" d="M6 2h12v6l-4 4 4 4v6H6v-6l4-4-4-4V2Zm2 2v3.2l4 4 4-4V4H8Zm4 8.8-4 4V20h8v-3.2l-4-4Z" />
          {:else if board === "calibrating"}
            <path fill="currentColor" d="M11 2h2v3.07A7 7 0 0 1 18.93 11H22v2h-3.07A7 7 0 0 1 13 18.93V22h-2v-3.07A7 7 0 0 1 5.07 13H2v-2h3.07A7 7 0 0 1 11 5.07V2Zm1 5a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm0 3a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z" />
          {:else if board === "noCamera"}
            <path fill="currentColor" d="M21 6.5l-4 4V7a1 1 0 0 0-1-1H9.82L21 17.18V6.5ZM3.27 2 2 3.27 4.73 6H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12c.21 0 .39-.08.54-.18L19.73 21 21 19.73 3.27 2Z" />
          {:else}
            <path fill="currentColor" d="M12 2 1 21h22L12 2Zm0 4.3L19.5 19h-15L12 6.3ZM11 10v5h2v-5h-2Zm0 6v2h2v-2h-2Z" />
          {/if}
        </svg>
        <span class="sr-only">{boardLabel}</span>
      </span>
    {/if}
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
    --petrol: #1a9fae;
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
    /* The D³ backdrop artwork sits behind every view, dimmed so it never competes with the content. */
    background:
      radial-gradient(ellipse at 70% 110%, #0b2b36 0%, transparent 60%) fixed,
      linear-gradient(rgb(6 13 18 / 0.78), rgb(6 13 18 / 0.78)) fixed,
      url("./assets/brand/d3-backdrop.svg") center / cover no-repeat fixed,
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
  /* Connected, but the client doesn't detect darts right now. */
  .conn[data-board="idle"] .dot { background: var(--dart); }
  .board-icon { display: inline-flex; color: var(--dart); cursor: help; }
  .board-icon[data-board="running"] { color: var(--ok); }
  .board-icon[data-board="noCamera"], .board-icon[data-board="blocked"] { color: #ff9b8f; }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }

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
  .wait-hint button { margin-left: 0.5rem; vertical-align: baseline; }

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
  /* At least the full height of main, so the carousel can take all the room below the title. */
  .pick { min-height: 100%; display: flex; flex-direction: column; }
  /* The title stays centred over the carousel; "New routine" sits at the right edge. */
  .pick-head { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 0.75rem; margin-bottom: 0.5rem; }
  .pick-head h2 { grid-column: 2; margin: 0; text-align: center; }
  .pick-head .new { grid-column: 3; justify-self: end; display: inline-flex; align-items: center; gap: 0.35rem; }
  @media (max-width: 640px) {
    .pick-head { grid-template-columns: 1fr auto; }
    .pick-head h2 { grid-column: 1; text-align: left; }
    .pick-head .new { grid-column: 2; }
  }
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

  .back {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    margin: 0 0 1rem -0.5rem;
    padding: 0.35rem 0.5rem;
    border: 0;
    border-radius: 6px;
    background: none;
    color: var(--dim);
    font: inherit;
    cursor: pointer;
  }
  .back:hover { color: var(--chalk); background: var(--panel); }
  .editor { max-width: 44rem; }
  .edit-head { display: flex; align-items: center; gap: 0.25rem; margin-bottom: 1.25rem; }
  .edit-head h2 { margin: 0 0.5rem 0 0; }
  .delete-wrap { position: relative; }
  button.icon.delete:hover, button.icon.armed { color: #ff9b8f; }
  button.icon.armed { background: rgb(255 155 143 / 0.15); }

  .confirm {
    width: min(26rem, calc(100vw - 2rem));
    padding: 1.25rem 1.5rem;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--panel);
    color: var(--chalk);
    box-shadow: 0 20px 60px rgb(0 0 0 / 0.55);
  }
  .confirm::backdrop { background: rgb(2 6 9 / 0.7); }
  .confirm h3 { margin: 0 0 0.5rem; }
  .confirm .foot { display: flex; justify-content: flex-end; gap: 0.75rem; }

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

  /* Game info and board share the view half and half; the game info is centred in its half. */
  .stage { position: relative; display: grid; grid-template-columns: 1fr 1fr; gap: 2.5rem; align-items: center; }

  /* The bust overlay: the stamp slams in, holds, and fades out within the time it is shown. */
  .no-score {
    position: absolute;
    inset: -1rem;
    z-index: 5;
    display: grid;
    place-items: center;
    pointer-events: none;
    border-radius: 1rem;
    background: radial-gradient(closest-side, rgba(6, 13, 18, 0.85), rgba(6, 13, 18, 0.45));
    animation: no-score-fade var(--no-score-ms) ease-out both;
  }
  .no-score .stamp {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    padding: 1.25rem 2.5rem;
    border: 4px solid #ff6b5b;
    border-radius: 0.9rem;
    color: #ff6b5b;
    background: rgba(13, 27, 35, 0.92);
    box-shadow: 0 0 2.5rem rgba(255, 107, 91, 0.35);
    transform: rotate(-6deg);
    animation: no-score-stamp var(--no-score-ms) cubic-bezier(0.2, 0.9, 0.3, 1.2) both;
  }
  .no-score .word {
    font-size: clamp(3rem, 9vw, 6rem);
    font-weight: 800;
    line-height: 1;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .no-score .why { color: var(--chalk); font-size: 1rem; }
  @keyframes no-score-fade {
    from { opacity: 0; }
    10% { opacity: 1; }
    80% { opacity: 1; }
    to { opacity: 0; }
  }
  @keyframes no-score-stamp {
    from { opacity: 0; transform: rotate(-14deg) scale(2.2); }
    14% { opacity: 1; transform: rotate(-4deg) scale(0.94); }
    22% { transform: rotate(-6deg) scale(1); }
    30%, 34% { transform: rotate(-6deg) translateX(-4px); }
    32%, 36% { transform: rotate(-6deg) translateX(4px); }
    40% { transform: rotate(-6deg) translateX(0); }
    80% { opacity: 1; transform: rotate(-6deg) scale(1); }
    to { opacity: 0; transform: rotate(-6deg) scale(1.08); }
  }
  .stage .panel { display: flex; flex-direction: column; align-items: center; text-align: center; }
  .clock { font-size: 4.5rem; font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1; }
  .clock.paused { color: var(--dart); opacity: 0.75; }
  .note { color: var(--dim); margin: 0.5rem 0 1.5rem; }
  /* The current score, the one number to read at a glance from the oche. */
  .focus {
    display: flex;
    flex-direction: column;
    align-items: center;
    min-width: min(100%, 18rem);
    margin: 0.5rem 0 1.5rem;
    padding: 1rem 2.5rem 1.25rem;
    border: 1px solid var(--petrol);
    border-radius: 14px;
    background: var(--panel);
    box-shadow: 0 0 0 4px rgb(26 159 174 / 0.12);
  }
  .focus .big { font-size: 6.5rem; line-height: 1; }
  .focus .big.long { font-size: 3.6rem; line-height: 1.2; }
  .hero { display: flex; align-items: baseline; justify-content: center; gap: 0.75rem; margin-bottom: 1.25rem; }
  .big { font-size: 3.2rem; font-weight: 700; font-variant-numeric: tabular-nums; }
  .cap { color: var(--dim); }
  .stats { margin: 0; border-top: 1px solid var(--line); }
  .stage .stats { width: min(100%, 24rem); text-align: left; }
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
  .darts { position: relative; display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem; }
  /* Beside the boxes, so they stay lined up with the board. */
  .darts .next-turn {
    position: absolute;
    top: 50%;
    left: calc(100% + 0.75rem);
    transform: translateY(-50%);
    border: 1px solid var(--line);
    color: var(--chalk);
  }
  .darts .phase {
    position: absolute;
    top: 50%;
    right: calc(100% + 0.75rem);
    transform: translateY(-50%);
    display: inline-flex;
    padding: 0.45rem;
    color: var(--ok);
    cursor: help;
  }
  .darts .phase[data-phase="takeout"] { color: var(--dart); }
  /* The hand is in the picture: the icon waves while the darts come out. */
  .darts .phase[data-phase="takeoutInProgress"] { color: var(--accent); }
  .darts .phase[data-phase="takeoutInProgress"] svg { animation: pull 0.8s ease-in-out infinite alternate; }
  @keyframes pull { from { transform: translateY(2px); } to { transform: translateY(-3px); } }
  .darts .next-turn:hover { color: var(--accent); border-color: var(--accent); background: var(--panel); }
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
  button.dart-box { font: inherit; font-size: 1.5rem; font-weight: 700; cursor: pointer; }
  button.dart-box:hover { background: rgb(242 193 78 / 0.08); }
  /* The last turn after the takeout: still shown, and still correctable, until the next dart. */
  .dart-box.done { opacity: 0.6; }
  /* Set by hand: a small mark in the corner. */
  .dart-box.fixed { position: relative; }
  .dart-box.fixed::after {
    content: "";
    position: absolute;
    top: 6px;
    right: 6px;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--accent);
  }
  /* Thrown after a bust, or never to be thrown: the turn is over. */
  .dart-box.void:not(.editing) { color: var(--dim); border-color: var(--line); border-style: dashed; text-decoration: line-through; }
  .dart-box.closed { color: #ff6b5b; opacity: 0.55; border-style: dashed; font-size: 1.2rem; }
  .dart-box.editing { opacity: 1; color: var(--accent); border-color: var(--accent); box-shadow: 0 0 0 3px rgb(34 211 238 / 0.25); }
  .pick-hint { max-width: 400px; width: 100%; min-height: 1.4em; margin: -0.5rem 0; overflow: hidden; color: var(--accent); font-size: 0.9rem; text-align: center; text-overflow: ellipsis; white-space: nowrap; visibility: hidden; }
  .pick-hint.show { visibility: visible; }

  @media (max-width: 860px) { .stage { grid-template-columns: 1fr; } }
  @media (prefers-reduced-motion: reduce) { :global(*) { transition: none !important; animation: none !important; } }
</style>
