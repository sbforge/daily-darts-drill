<script lang="ts">
  import { onMount } from "svelte";
  import {
    AutodartsClient,
    autodartsUrl,
    dartLabel,
    type BoardStatus,
    type ThrowPhase,
    type ConnState,
    type Dart,
    type DartEvent,
  } from "./lib/autodarts";
  import {
    DEFAULT_CONFIG,
    MAX_PAUSE_SECONDS,
    newRoutine,
    pauseSeconds,
    totalSeconds,
    type Config,
    type Routine,
    type RoutineItem,
  } from "./lib/store";
  import * as db from "./lib/db";
  import {
    DEFAULT_RANGE,
    DEFAULT_SAMPLE,
    MAX_SAMPLE,
    gameIndex,
    hasIndex,
    metricScores,
    overview,
    sessionIndex,
    withSample,
    trendStep,
    type Performance,
    type ResultRecord,
    type TimeRange,
    type Trend,
  } from "./lib/dpi";
  import { BUILTIN_ROUTINES, makeBuiltin, missingBuiltins } from "./lib/routines/builtin";
  import { NON_COMPARABLE, withCounting } from "./lib/games/shared";
  import { prefs } from "./lib/prefs.svelte";
  import { GAMES, gameById, type GameDef, type Settings, type StatLine } from "./lib/games";
  import { FxLayer, fx, useFx } from "./lib/fx";
  import { log } from "./lib/log";
  import { checkForUpdate, initUpdates, installUpdate, later, releasesUrl, setAutoCheck, setChannel, setDeveloper, skipVersion, updateAvailable, updates } from "./lib/updates.svelte";
  import {
    chooseExportFile,
    chooseRoutineOpenFile,
    chooseRoutineSaveFile,
    lastBackup,
    prepareEraseBackup,
    readRoutineFile,
    saveRoutineFile,
  } from "./lib/backend";
  import { ImportError, parseShareFile, shareFileName, toShareFile } from "./lib/routines/share";
  import CrashToasts from "./lib/CrashToasts.svelte";
  import { installCrashHandlers, reportCrash, setCrashContext } from "./lib/crash.svelte";
  import { isNewerDatabase, openFolder, startupReport } from "./lib/backend";
  import { pickMoments } from "./lib/fx/moments";
  import { en } from "./lib/i18n/en";
  import { Session } from "./lib/session.svelte";
  import { quickFixes } from "./lib/quickfix";
  import AddGameDialog from "./lib/AddGameDialog.svelte";
  import Board from "./lib/Board.svelte";
  import GameShot from "./lib/GameShot.svelte";
  import RoundEndOverlay from "./lib/RoundEnd.svelte";
  import DartMeter from "./lib/DartMeter.svelte";
  import DpiChart from "./lib/DpiChart.svelte";
  import LoadingScreen from "./lib/LoadingScreen.svelte";
  import SbomDialog from "./lib/SbomDialog.svelte";
  import LogDialog from "./lib/LogDialog.svelte";
  import RestoreDialog from "./lib/RestoreDialog.svelte";
  import Logo from "./lib/Logo.svelte";
  import Quote from "./lib/Quote.svelte";
  import RoutineCarousel from "./lib/RoutineCarousel.svelte";
  import ReleaseNotes from "./lib/ReleaseNotes.svelte";
  import ExternalLink from "./lib/ExternalLink.svelte";
  import RoutineItems from "./lib/RoutineItems.svelte";
  import Precision from "./lib/Precision.svelte";
    import Select from "./lib/Select.svelte";
  import { discoverBoards, type FoundBoard } from "./lib/discovery";
  import { fullscreen, fullscreenKeys, toggleFullscreen, watchFullscreen } from "./lib/fullscreen.svelte";
  import { AUTODARTS_URL, COFFEE_ICON, COFFEE_URL, GITHUB_URL, ISSUES_URL, LICENSE_URL, openExternal } from "./lib/links";
  import { LOCALES, dateTime, getLocale, isLocale, num, setLocale, t, type Key, type Locale } from "./lib/i18n/index.svelte";

  interface RunResult {
    gameId: string;
    minutes: number;
    early: boolean;
    /** The game reached its own end, before the clock ran out. */
    completed: boolean;
    hasResult: boolean;
    lines: StatLine[];
    settings: Settings;
    values: Record<string, number>;
    startedAt: string;
    finishedAt: string;
  }

  let ready = $state(false);
  let sbomDialog = $state<SbomDialog>();
  // The loading screen: how many of the startup steps are done, and what runs now.
  const LOAD_STEPS = 4;
  const MIN_LOADING_MS = 2000;
  let loadDone = $state(0);
  let loadLabel = $state<Key>("loading.data");
  let dbError = $state("");
  let updateBackup = $state("");
  let backupError = $state("");
  let lastBackupAt = $state<string | null>(null);
  // The last run didn't close normally (the Rust side left its "running" marker behind).
  let closedBadly = $state(false);
  let logDialog = $state<LogDialog>();
  let restoreDialog = $state<RestoreDialog>();
  // Set on the start after a restore: the folder with the data it replaced, or why it failed.
  let restoredFrom = $state("");
  let restoreError = $state("");
  let saveError = $state("");
  type View = "train" | "routines" | "history" | "stats" | "precision" | "settings" | "about";
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
  // The search in the settings: null before the first search.
  let searching = $state(false);
  let found = $state<FoundBoard[] | null>(null);

  // routines
  let routines = $state<Routine[]>([]);
  let selectedId = $state("");

  // history
  let history = $state<db.HistorySession[]>([]);
  let lastPlayed = $state<Record<string, string>>({});
  // The history shows the sessions of a period, by default the last month, and all of them, the routines or the quick games.
  let historyFrom = $state(dayInput(monthsAgo(1)));
  let historyTo = $state(dayInput(new Date()));
  let historyKind = $state<"all" | "routines" | "quick">("all");
  const shownHistory = $derived(
    historyKind === "all" ? history : history.filter((s) => s.quick === (historyKind === "quick")),
  );
  let detailSession = $state<db.HistorySession | null>(null);
  let detailDialog = $state<HTMLDialogElement>();
  let updateDialog = $state<HTMLDialogElement>();
  // "Later" and "Skip" take the update away: the dialog goes with it.
  $effect(() => {
    if (!updateAvailable() && updates.status !== "downloading" && updates.status !== "installing") updateDialog?.close();
  });
  let deleteTarget = $state<db.HistorySession | null>(null);
  let deleteDialog = $state<HTMLDialogElement>();
  // The performance index, calculated from all stored results each time they change.
  // The raw results, read from the database whenever they change; the index is worked out from them for the picked period.
  let dpiResults = $state<ResultRecord[]>([]);
  let statsRange = $state<TimeRange>(DEFAULT_RANGE);
  // "Results per comparison" from the settings: the rolling average, and how many a trend needs per period.
  let statsSample = $state(DEFAULT_SAMPLE);
  const dpi = $derived(overview(dpiResults, statsRange, Date.now(), withSample(statsSample)));
  let dpiHelp = $state<HTMLDialogElement>();
  // Statistics shows either the overall index or the index of one game (the picked one, else the first).
  let statsView = $state<"overall" | "games">("overall");
  let statsGameId = $state("");
  const statsGame = $derived(dpi?.games.find((g) => g.gameId === statsGameId) ?? dpi?.games[0] ?? null);
  // The game's chart shows its index or the measured values behind it (one metric at a time).
  let statsChart = $state<"index" | "raw">("index");
  let statsMetric = $state("");
  const statsRaw = $derived(statsGame?.raw.find((r) => r.key === statsMetric) ?? statsGame?.raw[0] ?? null);

  // running a routine
  let run = $state<{
    routine: Routine;
    /** A quick game: one game without a routine, its routine made up just for this run. */
    quick: boolean;
    index: number;
    results: RunResult[];
    sessionId: string;
    startedAt: string;
  } | null>(null);
  let phase = $state<"idle" | "countdown" | "ready" | "break" | "running" | "summary">("idle");
  // Countdown, game and break never scroll: the layout fits the window instead (see main.fit).
  const fit = $derived(view === "train" && (phase === "countdown" || phase === "running" || phase === "break"));
  let session = $state<Session | null>(null);
  let gameStartedAt = "";
  let endsAt = $state<number | null>(null);
  // When the game clock started, moved on by pauses. Without a time cap the clock counts up from here.
  let startsAt = $state(0);
  let now = $state(Date.now());
  let paused = $state(false);
  let pausedAt = $state(0);
  let pendingAbort = $state(false);
  // Skipping a running game ends it early, so it asks for a second click like aborting does.
  let pendingSkip = $state(false);
  let skipTimer: ReturnType<typeof setTimeout> | undefined;
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
  // The last seconds of a timed game: the clock turns accent and beats once a second.
  const LAST_SECONDS_MS = 10_000;
  const lastSeconds = $derived(phase === "running" && totalMs > 0 && !paused && remaining > 0 && remaining <= LAST_SECONDS_MS);
  const elapsed = $derived(Math.max(0, (paused ? pausedAt : now) - startsAt));
  const result = $derived(session ? session.result : null);
  // The headline numbers, usually one; Solo Leg has two (match and leg average), shown side by side.
  const heroes = $derived(result?.lines.filter((l) => l.hero && l.live !== false) ?? []);
  const others = $derived(result?.lines.filter((l) => !l.hero && l.live !== false && !l.grid) ?? []);
  const gridLines = $derived(result?.lines.filter((l) => l.grid && l.live !== false) ?? []);
  // After a bust or a checkout (Game shot) the turn is over: darts of the shown turn from here on don't count,
  // its empty boxes are closed.
  const shot = $derived(session && result?.gameShot?.turn === session.shownTurn ? result.gameShot : null);
  const bustAt = $derived(
    shot ? shot.darts : session && result?.noScore?.turn === session.shownTurn ? result.noScore.darts : 3,
  );
  const closedHint = $derived(shot ? t("shot.lockedHint") : t("run.noScoreHint"));
  // Autodarts keeps detecting after a bust or a checkout (that can't be stopped), but those darts are neither
  // counted nor shown: the boxes after it stay closed and the board doesn't draw them.
  const shownDarts = $derived(session ? session.shown.slice(0, bustAt) : []);
  // While a dart is corrected: the fields next to the one it counted.
  const fixes = $derived.by(() => {
    const i = session?.edit ?? null;
    return i !== null && shownDarts[i] ? quickFixes(shownDarts[i]) : [];
  });
  // The end of a round (JDC Challenge): its result lies over the board until the takeout.
  const roundEnd = $derived(session && result?.roundEnd?.turn === session.shownTurn ? result.roundEnd : null);
  // The turn under an overlay: its moment ("Ton out!", "Shanghai!") is shown on the overlay instead of a stamp.
  const overlayTurn = $derived(shot?.turn ?? roundEnd?.turn ?? null);
  const shotMoment = $derived(
    overlayTurn !== null && session && result
      ? (pickMoments(result, session.allTurns).play.find((m) => m.turn === overlayTurn)?.text ?? "")
      : "",
  );
  const canStart = $derived(!!def && (detecting || !def.needsDarts));
  // A game with darts can't go on without the detection, so it waits paused until Autodarts is back.
  const waiting = $derived(phase === "running" && !!def?.needsDarts && !detecting);
  const breakLeft = $derived(Math.max(0, breakEndsAt - (paused ? pausedAt : now)));
  const countdownLeft = $derived(Math.max(1, Math.ceil(breakLeft / 1000)));

  /** Minutes and seconds. A countdown rounds up, so it shows 0:00 only at its end; a clock counting up rounds down. */
  function fmt(ms: number, up = false): string {
    const s = up ? Math.floor(ms / 1000) : Math.ceil(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }

  function settingsLine(i: RoutineItem): string {
    const desc = gameById(i.gameId).describe(i.settings);
    return i.minutes > 0 ? t("run.settingsLine", { desc, n: i.minutes }) : t("quick.settingsLineNoCap", { desc });
  }

  let exportNote = $state<{ text: string; failed: boolean } | null>(null);

  async function exportData() {
    exportNote = null;
    try {
      const path = await chooseExportFile();
      if (!path) return;
      await db.exportTo(path);
      log.info("data exported");
      exportNote = { text: t("export.done"), failed: false };
    } catch (e) {
      log.error(`export failed: ${e}`);
      exportNote = { text: t("export.failed", { msg: e instanceof Error ? e.message : String(e) }), failed: true };
    }
  }

  let restoreNote = $state("");

  // Developer mode: a checkbox in Settings. Turning it on asks first, because betas can put the data at risk.
  let developerDialog = $state<HTMLDialogElement>();
  function toggleDeveloper(e: MouseEvent) {
    if (updates.developer) {
      setDeveloper(false);
      return;
    }
    // The box only gets its tick once the dialog is confirmed.
    e.preventDefault();
    developerDialog?.showModal();
  }
  async function confirmDeveloper() {
    developerDialog?.close();
    await setDeveloper(true);
  }

  // "Erase all data": asked twice, then a copy goes to backups/erase, everything the player made is deleted,
  // the built-in routines are added as new, and the app starts over (a reload reads the empty database).
  let eraseDialog = $state<HTMLDialogElement>();
  let eraseStep = $state<1 | 2>(1);
  let erasing = $state(false);
  let eraseError = $state("");

  function askErase() {
    eraseStep = 1;
    eraseError = "";
    eraseDialog?.showModal();
  }

  async function eraseAll() {
    erasing = true;
    eraseError = "";
    try {
      await db.exportTo(await prepareEraseBackup());
      await db.eraseAllData();
      await db.saveRoutines(BUILTIN_ROUTINES.map((b) => makeBuiltin(b)));
      log.info("all data erased, built-in routines added");
      location.reload();
    } catch (e) {
      log.error(`erase failed: ${e}`);
      eraseError = t("erase.failed", { msg: e instanceof Error ? e.message : String(e) });
      erasing = false;
    }
  }

  /** Adds back the built-in routines that are missing; never overwrites what the player changed. */
  function restoreBuiltins() {
    const add = missingBuiltins($state.snapshot(routines));
    routines = [...routines, ...add];
    restoreNote = add.length ? t("builtin.restored", { n: add.length }) : t("builtin.nothingToRestore");
  }

  function failed(e: unknown) {
    log.error(`save failed: ${e instanceof Error ? e.message : String(e)}`);
    saveError = t("error.save", { msg: e instanceof Error ? e.message : String(e) });
  }

  function refreshHistory() {
    loadHistory();
    db.loadLastPlayed().then((l) => (lastPlayed = l), failed);
    refreshDpi();
  }

  function refreshDpi() {
    return db.loadResults().then((r) => (dpiResults = r), failed);
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

  // Without a connection to Autodarts, nothing that counts darts can start: the session would only wait.
  const offline = $derived(conn !== "connected");

  function startRoutine() {
    const r = routines.find((x) => x.id === selectedId);
    if (!r || r.items.length === 0) return;
    if (offline && r.items.some((i) => gameById(i.gameId).needsDarts)) return;
    begin(structuredClone($state.snapshot(r)), false);
  }

  // ---- quick game: a single game without a routine

  let quickDialog = $state<AddGameDialog>();
  // The settings played last per game, and the game played last, so the dialog opens on them.
  let quickItems = $state<RoutineItem[]>([]);
  let quickLast = $state("");

  function openQuick() {
    quickDialog?.open($state.snapshot(quickItems), quickLast);
  }

  function startQuick(item: RoutineItem) {
    if (offline && gameById(item.gameId).needsDarts) return;
    quickLast = item.gameId;
    quickItems = [...quickItems.filter((i) => i.gameId !== item.gameId), item];
    db.saveQuickGame(quickLast, $state.snapshot(quickItems)).catch(failed);
    const routine = newRoutine(t("quick.name"));
    routine.pauseSeconds = 0;
    routine.items = [structuredClone(item)];
    begin(routine, true);
  }

  /** The same game again, with the same settings. */
  function playAgain() {
    const again = run?.quick ? $state.snapshot(run.routine.items[0]) : null;
    closeRun();
    if (again) startQuick(again);
  }

  function begin(routine: Routine, quick: boolean) {
    log.info(`${quick ? "quick game" : "routine"} started: ${routine.items.map((i) => i.gameId).join(", ")}`);
    run = {
      routine,
      quick,
      index: 0,
      results: [],
      sessionId: crypto.randomUUID(),
      startedAt: new Date().toISOString(),
    };
    now = Date.now();
    breakEndsAt = now + COUNTDOWN_SECONDS * 1000;
    resetOnStart = true;
    phase = "countdown";
  }

  // A session starts on a clean board: Autodarts is reset during the countdown, so darts left in the board
  // from before don't count for the first game. Without the detection running yet, it waits until it does.
  let resetOnStart = false;
  $effect(() => {
    if (phase === "countdown" && canReset && resetOnStart) {
      resetOnStart = false;
      resetBoard();
    }
  });

  function startGame() {
    if (!item || !def) return;
    // With a time cap a game completed early starts over and plays on until the clock runs out.
    const played = withCounting(item.settings, def.countsRest === true, prefs.instantCount);
    session = new Session(def, def.prepare ? def.prepare({ ...played }) : { ...played }, totalMs > 0);
    paused = false;
    now = Date.now();
    gameStartedAt = new Date(now).toISOString();
    startsAt = now;
    // A quick game can have no time cap (0 minutes): it runs until it is done or stopped.
    endsAt = totalMs > 0 ? now + totalMs : null;
    phase = "running";
  }

  function finish(early: boolean) {
    if (recordGame(early)) nextGame();
  }

  /** A routine stopped mid-game keeps that game when it had at least this many darts: shorter says too little. */
  const STOP_KEEPS_DARTS = 30;
  const stoppedGameCounts = $derived(
    phase === "running" && !!session && !!def?.hasResult && session.allTurns.flat().length >= STOP_KEEPS_DARTS,
  );

  /** Saves the game in play as a result of the run. Returns false when there is no game to save. */
  function recordGame(early: boolean): boolean {
    if (phase !== "running" || !session || !run || !item || !def) return false;
    const res = session.result;
    const turns = $state.snapshot(session.allTurns);
    const settings = $state.snapshot(session.settings);
    const finishedAt = new Date().toISOString();
    session.finish();
    log.info(`game finished: ${def.id}, ${item.minutes} min${early ? ", early" : ""}`);
    // Moments still waiting belong to the game that just ended; the one on screen plays out.
    fx.dropQueued();
    paused = false;
    run.results.push({
      gameId: def.id,
      minutes: item.minutes,
      early,
      completed: res.done,
      hasResult: def.hasResult,
      lines: res.lines.filter((l) => !l.liveOnly),
      settings,
      values: res.values,
      startedAt: gameStartedAt,
      finishedAt,
    });
    if (def.hasResult) {
      db.saveGameResult({
        sessionId: run.sessionId,
        routineId: run.quick ? null : run.routine.id,
        routineName: run.routine.name,
        sessionStartedAt: run.startedAt,
        position: run.index,
        gameId: def.id,
        gameName: def.name,
        settings,
        minutes: item.minutes,
        endedEarly: early,
        startedAt: gameStartedAt,
        finishedAt,
        values: res.values,
        turns,
      }).then(refreshHistory, failed);
    }
    return true;
  }

  function sessionInfo(r: NonNullable<typeof run>): db.SessionInfo {
    return {
      sessionId: r.sessionId,
      routineId: r.quick ? null : r.routine.id,
      routineName: r.routine.name,
      startedAt: r.startedAt,
    };
  }

  /** Straight on from a finished game: the break if the routine has one, else the next game. */
  function nextGame() {
    if (!run) return;
    session = null;
    endsAt = null;
    run.index++;
    if (run.index >= run.routine.items.length) {
      db.endSession(sessionInfo(run), "completed").then(refreshHistory, failed);
      showSummary();
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

  // ---- the summary at the end of a routine or quick game

  // The closing sentences ("finish.1", ...), one picked at random when the summary opens.
  const CLOSINGS = Object.keys(en).filter((k) => k.startsWith("finish.")) as Key[];
  let closing = $state<Key>("finish.1");
  // The game shown in detail beside the list.
  let summaryPick = $state(0);

  function showSummary() {
    closing = CLOSINGS[Math.floor(Math.random() * CLOSINGS.length)];
    // The warm-up has nothing to show, so the first game with a result opens.
    summaryPick = Math.max(0, run?.results.findIndex((r) => r.hasResult) ?? 0);
    phase = "summary";
  }

  // Worked out from the run itself, so the summary doesn't wait for the database.
  const runIndices = $derived(run?.results.map((r) => gameIndex(r.gameId, r.settings, r.values)) ?? []);
  const runIndex = $derived(
    run ? sessionIndex(run.results.map((r, i) => ({ id: String(i), sessionId: run!.sessionId, ...r }))) : null,
  );

  const sameSettings = (a: Settings, b: Settings) =>
    [...new Set([...Object.keys(a), ...Object.keys(b)])].every((k) => NON_COMPARABLE.includes(k) || String(a[k]) === String(b[k]));

  /**
   * The earlier results of a game, played with the same settings, oldest first: what it is compared with.
   * Results too short to count for the index are left out, they would pull the average down for nothing.
   */
  function earlierOf(r: RunResult, sessionId: string): ResultRecord[] {
    return dpiResults
      .filter((x) => x.sessionId !== sessionId && x.gameId === r.gameId && sameSettings(x.settings, r.settings))
      .filter((x) => !hasIndex(x.gameId) || gameIndex(x.gameId, x.settings, x.values) !== null)
      .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  }

  /** The latest earlier results of the picked game, as many as "Results per comparison". */
  const summaryEarlier = $derived.by(() => {
    const r = run?.results[summaryPick];
    return run && r ? earlierOf(r, run.sessionId).slice(-statsSample) : [];
  });

  /**
   * Per played game, the index metrics that beat every earlier result with the same settings.
   * A first result is no record yet, and a result too short to count can't set one.
   */
  const runBests = $derived(
    run?.results.map((r, i) => {
      const scores = metricScores(r.gameId, r.settings, r.values);
      const earlier = run ? earlierOf(r, run.sessionId) : [];
      if (!scores || runIndices[i] === null || !earlier.length) return new Set<string>();
      return new Set(
        scores.metrics
          .filter((m) => m.value > Math.max(...earlier.map((x) => Number(x.values[m.key]) || 0)))
          .map((m) => m.key),
      );
    }) ?? [],
  );

  // A new best anywhere in the run gets a stamp when the summary opens.
  $effect(() => {
    if (phase === "summary" && run && runBests.some((b) => b.size)) {
      fx.play("stamp", { text: t("summary.newBest"), tone: "great", size: "normal", key: `best:${run.sessionId}` });
    }
  });

  const average = (list: number[]) => (list.length ? list.reduce((s, n) => s + n, 0) / list.length : null);

  const summaryEarlierIndex = $derived(
    average(summaryEarlier.map((x) => gameIndex(x.gameId, x.settings, x.values)).filter((n) => n !== null)),
  );

  /** A line's earlier average in the same form ("12.5", "40%"); empty when the line isn't a plain number. */
  function lineAverage(l: StatLine): string {
    if (!/^[\d.,]+%?$/.test(l.value)) return "";
    const a = average(summaryEarlier.map((x) => Number(x.values[l.stored ?? l.key])).filter(Number.isFinite));
    return a === null ? "" : `${num(a, 1)}${l.value.endsWith("%") ? "%" : ""}`;
  }

  function closeRun() {
    run = null;
    session = null;
    endsAt = null;
    paused = false;
    pendingAbort = false;
    pendingSkip = false;
    phase = "idle";
  }

  /**
   * Stops the routine at any point. It is recorded as stopped and keeps the games finished so far;
   * the game in play too, when it had 30 darts; otherwise it is dropped.
   * A quick game is stopped instead: a game in play ends and its result is kept, so it needs no
   * second click. Before its game started there is nothing to keep and nothing is recorded.
   */
  function abortRoutine() {
    if (!run) return;
    if (run.quick) {
      if (phase === "running") finish(true);
      else closeRun();
      return;
    }
    if (!pendingAbort) {
      pendingAbort = true;
      setTimeout(() => (pendingAbort = false), 4000);
      return;
    }
    log.info("routine aborted");
    if (stoppedGameCounts) recordGame(true);
    db.endSession(sessionInfo(run), "aborted").then(refreshHistory, failed);
    closeRun();
  }

  /** While a routine runs, its controls sit in the header as icons, so the screen stays free for darts. */
  // A game or break in progress. The summary of a finished or stopped routine doesn't count: export and
  // updates work there, they only wait while darts are thrown.
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

  /** Moves on: ends the game early (on a second click), skips the countdown or break, or starts a waiting game. */
  function skip() {
    if (phase === "running" && !pendingSkip) {
      pendingSkip = true;
      clearTimeout(skipTimer);
      skipTimer = setTimeout(() => (pendingSkip = false), 4000);
      return;
    }
    clearTimeout(skipTimer);
    pendingSkip = false;
    if (phase === "running") finish(true);
    else if (phase === "ready") startGame();
    else endBreak();
  }

  // A second click only counts for the game it was asked for.
  $effect(() => {
    if (phase !== "running") pendingSkip = false;
  });

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
    else {
      startsAt += Date.now() - pausedAt;
      if (endsAt !== null) endsAt += Date.now() - pausedAt;
    }
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

  // ---- start / stop, reset and calibrate, beside the Autodarts status in the footer

  // "noCamera" and "blocked" are a running detection with a problem, so they can be stopped too.
  const canStartDetection = $derived(conn === "connected" && board === "stopped");
  const canStopDetection = $derived(conn === "connected" && (board === "running" || board === "noCamera" || board === "blocked"));

  // Reset only does something while darts are detected; calibrating waits until the client is settled.
  const canReset = $derived(conn === "connected" && board === "running");
  const canCalibrate = $derived(conn === "connected" && board !== "starting" && board !== "stopping" && board !== "calibrating");
  // What became of the last reset or calibration, shown for a moment as a bubble over the buttons.
  let boardNote = $state<{ text: string; failed: boolean } | null>(null);
  let boardNoteTimer: ReturnType<typeof setTimeout> | undefined;

  function noteBoard(text: string, failed: boolean) {
    clearTimeout(boardNoteTimer);
    boardNote = { text, failed };
    boardNoteTimer = setTimeout(() => (boardNote = null), 3000);
  }

  /** Clears the darts on the board, like a takeout by hand. A running game takes it as the end of the turn. */
  function resetBoard(quiet = false) {
    if (!canReset) return;
    client.reset().then(
      () => (log.info("autodarts reset"), quiet || noteBoard(t("board.resetDone"), false)),
      (e) => (log.warn(`autodarts reset failed: ${e}`), quiet || noteBoard(t("board.resetFailed"), true)),
    );
  }

  /**
   * "Next turn": the turn ends by hand, and Autodarts is reset too, so its turn ends with ours and the next
   * dart starts a new one. That happens without the bubble over the board buttons.
   */
  function nextTurn() {
    session?.endTurn();
    resetBoard(true);
  }

  /** Starts the detection when it is stopped, stops it when it runs. */
  function toggleDetection() {
    if (canStartDetection)
      client.start().then(
        () => noteBoard(t("board.startDone"), false),
        () => noteBoard(t("board.startFailed"), true),
      );
    else if (canStopDetection)
      client.stop().then(
        () => noteBoard(t("board.stopDone"), false),
        () => noteBoard(t("board.stopFailed"), true),
      );
  }

  /** Starts the auto-calibration of the cameras. */
  function calibrateBoard() {
    if (!canCalibrate) return;
    client.calibrate().then(
      () => (log.info("autodarts calibration started"), noteBoard(t("board.calibrateStarted"), false)),
      (e) => (log.warn(`autodarts calibration failed: ${e}`), noteBoard(t("board.calibrateFailed"), true)),
    );
  }

  $effect(() => {
    if (phase !== "running") return;
    const id = setInterval(() => {
      if (paused) return;
      now = Date.now();
      if (endsAt !== null && now >= endsAt) {
        fx.play("stamp", { text: t("run.time"), tone: "info", size: "normal" });
        finish(false);
      }
    }, 200);
    return () => clearInterval(id);
  });

  $effect(() => {
    if (phase === "running" && result?.done) finish(false);
  });

  // While a game runs, the backdrop moves so the bull of its dartboard sits behind the bull of the
  // board on screen. It stays at least as big as "cover", and grows where moving it would leave a gap.
  const BACKDROP = { width: 2400, height: 1500, bullX: 1750, bullY: 780 };
  let boardEl = $state<HTMLDivElement>();
  $effect(() => {
    const el = boardEl;
    const svg = el?.querySelector("svg");
    if (!el || !svg) return;
    const style = document.body.style;
    const align = () => {
      const r = svg.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const { width, height, bullX, bullY } = BACKDROP;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const scale = Math.max(vw / width, vh / height, cx / bullX, cy / bullY, (vw - cx) / (width - bullX), (vh - cy) / (height - bullY));
      style.setProperty("--backdrop-size", `${width * scale}px ${height * scale}px`);
      style.setProperty("--backdrop-pos", `${cx - bullX * scale}px ${cy - bullY * scale}px`);
    };
    align();
    // The board moves when the window, the stage or the column above it (the dart boxes) changes size.
    const ro = new ResizeObserver(align);
    ro.observe(el);
    for (const sel of [".stage", ".views"]) {
      const around = el.closest(sel);
      if (around) ro.observe(around);
    }
    window.addEventListener("resize", align);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", align);
      style.removeProperty("--backdrop-size");
      style.removeProperty("--backdrop-pos");
    };
  });

  // The moments of a game are played through the fx module: what the game describes (a great turn),
  // plus a 180 and No Score for every game. Each plays once, so a correction that makes a turn great
  // or bust shows it too, and a game recomputing on every dart doesn't repeat it. Keys carry the
  // game's start, so turn 4 of the next game is a new moment.
  $effect(() => {
    if (phase !== "running" || !session || !result) return;
    const game = gameStartedAt;
    const { play, skip } = pickMoments(result, session.allTurns);
    const shotTurn = result.gameShot?.turn ?? result.roundEnd?.turn;
    for (const m of skip) fx.skip(`${game}:${m.key}`);
    for (const m of play) {
      // A checkout's moment is on the Game shot overlay; it isn't stamped later either.
      if (m.turn === shotTurn) {
        fx.skip(`${game}:${m.key}`);
        continue;
      }
      fx.play(m.effect, { text: m.text, tone: m.tone, size: "big", key: `${game}:${m.key}`, priority: m.priority });
    }
  });

  $effect(() => {
    if (phase !== "break" && phase !== "countdown") return;
    const id = setInterval(() => {
      if (paused) return;
      now = Date.now();
      // The countdown before the first game holds at its start until the game can start.
      if (phase === "countdown" && !canStart) breakEndsAt = now + COUNTDOWN_SECONDS * 1000;
      else if (now >= breakEndsAt) endBreak();
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

  // Routine files: export the routine being edited, import one as a new routine. The outcome shows as a banner.
  let shareNote = $state<{ text: string; failed: boolean } | null>(null);

  async function exportRoutine(r: Routine) {
    shareNote = null;
    try {
      const path = await chooseRoutineSaveFile(shareFileName(r.name));
      if (!path) return;
      await saveRoutineFile(path, toShareFile($state.snapshot(r), __APP_VERSION__));
      log.info(`routine exported: ${r.name}`);
      shareNote = { text: t("share.exported", { name: r.name }), failed: false };
    } catch (e) {
      log.error(`routine export failed: ${e}`);
      shareNote = { text: t("share.exportFailed", { msg: e instanceof Error ? e.message : String(e) }), failed: true };
    }
  }

  async function importRoutine() {
    shareNote = null;
    try {
      const path = await chooseRoutineOpenFile();
      if (!path) return;
      const { routine, dropped } = parseShareFile(await readRoutineFile(path));
      if (!routine.name) routine.name = t("routines.new");
      routines.push(routine);
      selectedId = routine.id;
      draftId = null;
      pendingRoutineDelete = false;
      log.info(`routine imported: ${routine.name} (${routine.items.length} games, ${dropped} left out)`);
      shareNote = {
        text: dropped ? t("share.importedDropped", { name: routine.name, n: dropped }) : t("share.imported", { name: routine.name }),
        failed: false,
      };
      go("routines");
    } catch (e) {
      log.warn(`routine import failed: ${e}`);
      const text =
        e instanceof ImportError ? t(`share.${e.problem}`) : t("share.importFailed", { msg: e instanceof Error ? e.message : String(e) });
      shareNote = { text, failed: true };
    }
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

  /** A date as the value of a date input: the local day, YYYY-MM-DD. */
  function dayInput(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function monthsAgo(n: number): Date {
    const d = new Date();
    d.setMonth(d.getMonth() - n);
    return d;
  }

  /** From the start of the first day to the end of the last one, local time. */
  function loadHistory() {
    const from = new Date(`${historyFrom}T00:00`);
    const to = new Date(`${historyTo}T00:00`);
    if (isNaN(from.getTime()) || isNaN(to.getTime())) return Promise.resolve();
    to.setDate(to.getDate() + 1);
    return db.loadSessions(from.toISOString(), to.toISOString()).then((h) => (history = h), failed);
  }

  function sessionName(s: db.HistorySession): string {
    // The stored routine name is in the language of the day it was played; a quick game follows the current one.
    return s.quick ? t("quick.name") : s.routineName;
  }

  function showDetails(s: db.HistorySession) {
    detailSession = s;
    detailDialog?.showModal();
  }

  function askDelete(s: db.HistorySession) {
    deleteTarget = s;
    deleteDialog?.showModal();
  }

  function confirmDelete() {
    const id = deleteTarget?.id;
    deleteDialog?.close();
    if (id) db.deleteSession(id).then(refreshHistory, failed);
  }

  /** The time cap, or for a quick game without one how long it was played. */
  function playedLine(r: Pick<db.HistoryRow, "minutes" | "endedEarly" | "startedAt" | "finishedAt">): string {
    if (r.minutes > 0) return t(r.endedEarly ? "history.minutesEarly" : "common.minutes", { n: r.minutes });
    const played = Math.max(1, Math.round((Date.parse(r.finishedAt) - Date.parse(r.startedAt)) / 60_000));
    return t("history.playedNoCap", { n: played });
  }

  /** Encouraging feedback on the trend, whichever way it goes. The arrow and the number show the direction. */
  function trendText(tr: Trend): string {
    if (tr.kind === "notEnough") return tr.missing ? t("dpi.notEnough", { n: tr.missing }) : t("dpi.notEnoughYet");
    return t(`dpi.trend.${trendStep(tr.percent)}`);
  }

  /** The change without its sign: the arrow shows the direction. */
  function trendShort(tr: Trend): string {
    return tr.kind === "notEnough" ? "–" : `${num(Math.abs(tr.percent), 1)}%`;
  }

  function trendDir(tr: Trend): "up" | "down" | "steady" | "none" {
    if (tr.kind === "notEnough") return "none";
    const step = trendStep(tr.percent);
    return step === "steady" ? "steady" : step.startsWith("up") ? "up" : "down";
  }

  /** How the measured values behind the index read: their name, and percentages on a 0-100 scale. */
  const METRICS: Record<string, { label: Key; percent?: boolean; digits: number }> = {
    average: { label: "scoring.average", digits: 1 },
    accuracy: { label: "game.accuracy", percent: true, digits: 1 },
    successRate: { label: "game.successRate", percent: true, digits: 1 },
    highestCheckout: { label: "121.best", digits: 0 },
    pointsPerNumber: { label: "dpi.metric.pointsPerNumber", digits: 2 },
    dartsPerLeg: { label: "solo.dartsPerLeg", digits: 1 },
    hitRate: { label: "bob.hitRate", percent: true, digits: 1 },
    finishedScore: { label: "dpi.metric.finishedScore", digits: 0 },
    firstDartBullRate: { label: "bullx.firstRate", percent: true, digits: 1 },
    recoveryRate: { label: "bullx.recoveryRate", percent: true, digits: 1 },
    segmentRate: { label: "jdc.segmentRate", percent: true, digits: 1 },
    doubleRate: { label: "jdc.doubleRate", percent: true, digits: 1 },
    score: { label: "jdc.average", digits: 0 },
  };
  const metricOf = (key: string) => METRICS[key] ?? { label: "dpi.metric" as Key, digits: 1 };
  const metricFormat = (key: string) => (n: number) => `${num(n, metricOf(key).digits)}${metricOf(key).percent ? "%" : ""}`;

  const RANGE_UNITS = ["day", "week", "month", "year", "all"] as const;
  type RangeUnit = (typeof RANGE_UNITS)[number];
  // What the number field shows; the period only changes once it holds a whole number from 1 up.
  let rangeAmount = $state(30);

  function setRange(unit: RangeUnit, amount = rangeAmount) {
    statsRange = unit === "all" ? { unit } : { unit, amount };
    db.setSetting("stats_range", JSON.stringify(statsRange)).catch(failed);
  }

  function rangeUnitLabel(unit: RangeUnit): string {
    if (unit === "all") return t("range.all");
    return t(`range.${unit}${rangeAmount === 1 ? "" : "s"}` as Key);
  }

  function changeRangeAmount(ev: Event) {
    const n = Math.round(Number((ev.currentTarget as HTMLInputElement).value));
    if (!Number.isFinite(n) || n < 1 || n > 999) return;
    rangeAmount = n;
    if (statsRange.unit !== "all") setRange(statsRange.unit, n);
  }

  function changeSample(ev: Event) {
    const n = Math.round(Number((ev.currentTarget as HTMLInputElement).value));
    if (!Number.isFinite(n) || n < 1 || n > MAX_SAMPLE) return;
    statsSample = n;
    db.setSetting("stats_sample", String(n)).catch(failed);
  }

  async function loadRange() {
    const n = Number(await db.getSetting("stats_sample"));
    if (Number.isInteger(n) && n >= 1 && n <= MAX_SAMPLE) statsSample = n;
    try {
      const r = JSON.parse((await db.getSetting("stats_range")) ?? "null");
      if (r?.unit === "all") statsRange = { unit: "all" };
      else if (RANGE_UNITS.includes(r?.unit) && Number(r.amount) >= 1) {
        rangeAmount = Math.round(Number(r.amount));
        statsRange = { unit: r.unit, amount: rangeAmount };
      }
    } catch {
      /* a broken setting keeps the default */
    }
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
    dropCandidate();
    config = { host, port };
    draft = { ...config };
    db.saveConfig(config).catch(failed);
    client.connect(config.host, config.port);
  }

  function useDefaults() {
    draft = { ...DEFAULT_CONFIG };
  }

  async function searchBoards() {
    searching = true;
    formError = "";
    try {
      found = await discoverBoards();
    } catch {
      found = [];
    }
    searching = false;
    if (found.length === 1) pickBoard(found[0]);
  }

  function pickBoard(b: FoundBoard) {
    draft = { host: b.host, port: b.port };
  }

  // ---- auto discovery on start

  /** A board found on start that we try instead of the saved one; saved only once it connects. */
  let candidate: Config | null = null;
  let candidateTimer: ReturnType<typeof setTimeout> | undefined;
  const AUTO_DISCOVER_AFTER_MS = 4000;
  const CANDIDATE_TIMEOUT_MS = 8000;

  async function autoDiscover() {
    const boards = await discoverBoards().catch(() => [] as FoundBoard[]);
    log.info(`autodarts discovery: ${boards.length} found`);
    if (conn === "connected" || !boards.length) return;
    const b = boards[0];
    if (b.host === config.host && b.port === config.port) return;
    candidate = { host: b.host, port: b.port };
    client.connect(b.host, b.port);
    // It doesn't answer either: back to the saved connection, which stays as it is.
    candidateTimer = setTimeout(() => {
      if (!candidate) return;
      candidate = null;
      client.connect(config.host, config.port);
    }, CANDIDATE_TIMEOUT_MS);
  }

  function dropCandidate() {
    candidate = null;
    clearTimeout(candidateTimer);
  }

  function onConnState(s: ConnState) {
    if (s !== conn) log.info(`autodarts ${s} (${config.host}:${config.port})`);
    conn = s;
    if (s !== "connected" || !candidate) return;
    config = candidate;
    draft = { ...config };
    dropCandidate();
    db.saveConfig(config).catch(failed);
  }

  function setAnimations(on: boolean) {
    fx.enabled = on;
    db.setSetting("animations", on ? "on" : "off").catch(failed);
  }

  function setInstantCount(on: boolean) {
    prefs.instantCount = on;
    db.setSetting("game.instantCount", on ? "on" : "off").catch(failed);
  }

  function changeLanguage(l: Locale) {
    setLocale(l);
    db.setSetting("language", l).catch(failed);
  }

  onMount(() => watchFullscreen());
  onMount(() => {
    installCrashHandlers();
    setCrashContext(() => ({
      screen: view,
      phase,
      routine: run?.routine.name,
      game: session && def ? { id: def.id, settings: $state.snapshot(session.settings) } : undefined,
      turns: session?.allTurns.length,
      connection: conn,
      board,
      animations: fx.enabled,
      language: getLocale(),
    }));
    client = new AutodartsClient({ onState: onConnState, onBoard: (s) => (board = s), onPhase: (p) => (throwPhase = p), onEvent });
    const started = performance.now();
    const loaded = (next?: Key) => {
      loadDone++;
      if (next) loadLabel = next;
    };
    (async () => {
      try {
        const startup = await startupReport();
        updateBackup = startup.updateBackup ?? "";
        if (startup.backupError) {
          log.error(`backup failed: ${startup.backupError}`);
          backupError = startup.backupError;
        }
        lastBackupAt = await lastBackup();
        if (startup.crashedLastTime) closedBadly = true;
        restoredFrom = startup.restored ?? "";
        if (startup.restoreError) {
          log.error(`restore failed: ${startup.restoreError}`);
          restoreError = startup.restoreError;
        }
        await db.openDb();
        // Before the routines load, so a first start names its starter routine in this language.
        const lang = await db.getSetting("language");
        setLocale(isLocale(lang) ? lang : getLocale());
        // The first start takes the system's "reduce motion" as its starting value, later only the setting counts.
        const anim = await db.getSetting("animations");
        prefs.instantCount = (await db.getSetting("game.instantCount")) === "on";
        if (anim) fx.enabled = anim === "on";
        else setAnimations(fx.enabled);
        const saved = await db.hasConfig();
        config = await db.loadConfig();
        draft = { ...config };
        initUpdates(
          { get: db.getSetting, set: db.setSetting, busy: () => inRun, backup: db.exportTo },
          __APP_VERSION__,
        ).catch((e) => log.warn(`updates: ${e}`));
        loaded("loading.routines");
        routines = await db.loadRoutines();
        const last = await db.getSetting("selected_routine");
        selectedId = routines.find((r) => r.id === last)?.id ?? routines[0].id;
        ({ last: quickLast, items: quickItems } = await db.loadQuickGame());
        loaded("loading.history");
        await loadHistory();
        lastPlayed = await db.loadLastPlayed();
        loaded("loading.stats");
        await loadRange();
        await refreshDpi();
        loaded();
        // A fast start still shows the loading screen for a moment.
        await new Promise((r) => setTimeout(r, MIN_LOADING_MS - (performance.now() - started)));
        ready = true;
        client.connect(config.host, config.port);
        checkForUpdate({ manual: false });
        // First start: look for a board right away. Later: only if the saved one doesn't answer.
        if (!saved) autoDiscover();
        else setTimeout(() => conn !== "connected" && autoDiscover(), AUTO_DISCOVER_AFTER_MS);
      } catch (e) {
        dbError = e instanceof Error ? e.message : String(e);
        log.error(`database could not be opened: ${dbError}${updateBackup ? ` (backup: ${updateBackup})` : ""}`);
      }
    })();
    return () => client.disconnect();
  });
</script>

<!-- What a game is and why to play it, under its name before it starts. -->
{#snippet gameIntro(g: GameDef)}
  {#if g.classic !== g.name}<p class="classic-name">{g.classic}</p>{/if}
  <p class="lede">{g.blurb}</p>
  <p class="game-goal"><strong>{t("game.goal")}</strong> {g.goal}</p>
{/snippet}

<!-- Why a game with darts can't start or go on: no connection, or the detection isn't running. -->
{#snippet waitHint()}
  {#if conn === "connecting"}
    <p class="hint">{t("run.reconnecting")}</p>
  {:else if conn !== "connected"}
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

<!-- Escape stops correcting a dart; otherwise it leaves fullscreen. F11 toggles fullscreen. -->
<svelte:window
  onkeydown={(e) => {
    if (e.key === "Escape" && session?.editing) {
      session.editing = null;
      e.preventDefault();
    }
    fullscreenKeys(e);
  }}
/>

{#snippet updateIcon(size: number)}
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
    <path fill="currentColor" d="M12 3a1 1 0 0 1 1 1v9.6l3.3-3.3 1.4 1.4-5.7 5.7-5.7-5.7 1.4-1.4 3.3 3.3V4a1 1 0 0 1 1-1ZM5 19h14v2H5z" />
  </svg>
{/snippet}

<!-- The version on offer: its notes, then install, later or skip. `dialog` moves title and buttons into the dialog's own head and foot. -->
{#snippet updatePanel(dialog: boolean)}
  {#if !dialog}<h4>{t("updates.available", { v: updates.version })}</h4>{/if}
  {#if updates.notes}
    <div class="notes"><ReleaseNotes text={updates.notes} /></div>
  {/if}
  <p class="notes-link"><ExternalLink href={releasesUrl()} text={t("updates.notesOnline")} /></p>
  {#if updates.status === "available"}
    {#if updates.blocker}
      <p class="hint">{t(updates.blocker === "macos-not-installed" ? "updates.blockedMac" : "updates.blockedLinux")}</p>
      <p><ExternalLink href={releasesUrl()} text={t("updates.manual")} /></p>
    {:else}
      {#if inRun}<p class="hint">{t("updates.notDuringTraining")}</p>{/if}
      {#if dialog}
        <div class="foot update-actions">
          <button class="ghost" onclick={skipVersion}>{t("updates.skip")}</button>
          <span class="spacer"></span>
          <button class="ghost" onclick={later}>{t("updates.later")}</button>
          <button class="primary" disabled={inRun} onclick={installUpdate}>{t("updates.now")}</button>
        </div>
      {:else}
        <div class="row">
          <button class="primary" disabled={inRun} onclick={installUpdate}>{t("updates.now")}</button>
          <button class="ghost" onclick={later}>{t("updates.later")}</button>
          <button class="ghost" onclick={skipVersion}>{t("updates.skip")}</button>
        </div>
      {/if}
    {/if}
  {:else}
    <div class="update-progress">
      <progress max={updates.total || undefined} value={updates.total ? updates.done : undefined}></progress>
      <p class="hint">{t(updates.status === "installing" ? "updates.installing" : "updates.downloading")}{updates.total ? ` ${Math.round((updates.done / updates.total) * 100)}%` : ""}</p>
    </div>
  {/if}
{/snippet}

<header class:compact={fit}>
  <h1><Logo height={26} /></h1>
  <nav aria-label={t("nav.main")}>
    <button class="tab" aria-current={view === "train" || view === "routines" ? "page" : undefined} onclick={() => go("train")}>
      {t("nav.train")}
    </button>
    <button class="tab" aria-current={view === "history" ? "page" : undefined} onclick={() => go("history")}>
      {t("nav.history")}
    </button>
    <button class="tab" aria-current={view === "stats" ? "page" : undefined} onclick={() => go("stats")}>
      {t("nav.dpi")}
    </button>
    <button class="tab" aria-current={view === "precision" ? "page" : undefined} onclick={() => go("precision")}>
      {t("nav.precision")}
    </button>
  </nav>
  {#if updates.channel === "preview"}
    <span class="preview-pill" title={t("developer.previewTitle")}>{t("developer.previewLabel")}</span>
  {/if}
  {#if updateAvailable()}
    <button class="update-btn" onclick={() => updateDialog?.showModal()} title={t("updates.badge")}>
      {@render updateIcon(16)}
      {t("updates.buttonLabel", { v: updates.version })}
    </button>
  {/if}
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
      <span class="abort-wrap">
        <button
          class="icon"
          class:armed={pendingSkip}
          aria-label={pendingSkip ? t("run.confirmSkip") : skipLabel}
          title={pendingSkip ? undefined : skipLabel}
          onclick={skip}
          disabled={phase === "ready" && !canStart}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path fill="currentColor" d="M5 6.07v11.86a1 1 0 0 0 1.55.83L15 13.1V18a1 1 0 0 0 2 0V6a1 1 0 0 0-2 0v4.9L6.55 5.24A1 1 0 0 0 5 6.07Z" />
          </svg>
        </button>
        {#if pendingSkip}
          <span class="confirm-bubble" role="status">{t("run.confirmSkip")}</span>
        {/if}
      </span>
      <span class="abort-wrap">
        <button
          class="icon abort"
          class:armed={pendingAbort}
          aria-label={pendingAbort ? t("run.confirmAbort") : t(run?.quick ? "quick.stop" : "run.abort")}
          title={pendingAbort ? undefined : t(run?.quick ? "quick.stop" : "run.abort")}
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
    class="icon help"
    aria-label={t("nav.about")}
    title={t("nav.about")}
    aria-current={view === "about" ? "page" : undefined}
    onclick={() => go("about")}
  >
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16Zm-1-5h2v2h-2v-2Zm1-10a4 4 0 0 0-4 4h2a2 2 0 1 1 3.2 1.6c-.94.7-2.2 1.64-2.2 3.4h2c0-.9.6-1.4 1.4-2A4 4 0 0 0 12 5Z"
      />
    </svg>
  </button>
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
  <button
    class="icon fullscreen"
    class:active={fullscreen.on}
    aria-label={t(fullscreen.on ? "nav.exitFullscreen" : "nav.fullscreen")}
    title={t(fullscreen.on ? "nav.exitFullscreen" : "nav.fullscreen")}
    onclick={toggleFullscreen}
  >
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        d={fullscreen.on
          ? "M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"
          : "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"}
      />
    </svg>
  </button>
</header>

{#if saveError}
  <p class="banner" role="alert">{saveError}</p>
{/if}
{#if shareNote}
  <p class={shareNote.failed ? "banner" : "banner ok"} role={shareNote.failed ? "alert" : "status"}>
    {shareNote.text}
    <button class="link" onclick={() => (shareNote = null)}>{t("updates.dismiss")}</button>
  </p>
{/if}
{#if updates.updatedTo}
  <p class="banner ok" role="status">
    {t("updates.updated", { v: updates.updatedTo })}
    <button class="link" onclick={() => (updates.updatedTo = "")}>{t("updates.dismiss")}</button>
  </p>
{/if}
{#if backupError}
  <p class="banner" role="alert">
    {t("backup.failed", { msg: backupError })}
    <button class="link" onclick={() => openFolder("backups")}>{t("backup.openFolder")}</button>
    <button class="link" onclick={() => (backupError = "")}>{t("crash.dismiss")}</button>
  </p>
{/if}
{#if restoredFrom}
  <p class="banner ok" role="status">
    {t("restore.done")}
    <button class="link" onclick={() => openFolder("backups")}>{t("backup.openFolder")}</button>
    <button class="link" onclick={() => (restoredFrom = "")}>{t("updates.dismiss")}</button>
  </p>
{/if}
{#if restoreError}
  <p class="banner" role="alert">
    {t("restore.startFailed", { msg: restoreError })}
    <button class="link" onclick={() => (restoreError = "")}>{t("crash.dismiss")}</button>
  </p>
{/if}
{#if closedBadly}
  <div class="banner closed-badly" role="alert">
    <span>{t("crash.closedBadly")}</span>
    <button class="link" onclick={() => logDialog?.open()}>{t("log.show")}</button>
    <button class="link" onclick={() => openFolder("logs")}>{t("about.openLogs")}</button>
    <button class="icon dismiss" onclick={() => (closedBadly = false)} title={t("crash.dismiss")} aria-label={t("crash.dismiss")}>
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path fill="currentColor" d="M18.3 5.71 12 12l6.3 6.29-1.41 1.42L12.59 13.4 6.3 19.71 4.89 18.3 11.17 12 4.89 5.71 6.3 4.29l6.29 6.3 6.3-6.3z" />
      </svg>
    </button>
  </div>
{/if}
<LogDialog bind:this={logDialog} />
<RestoreDialog bind:this={restoreDialog} />

<CrashToasts />

<!-- The boundary wraps <main class:fit> (not its content), because snippets declared directly inside a boundary become its props. -->
<svelte:boundary onerror={(e) => reportCrash(e, "render")}>
<main class:fit>
  {#if dbError}
    <section class="narrow">
      <h2>{t(isNewerDatabase(dbError) ? "db.newerTitle" : "db.title")}</h2>
      <p class="error" role="alert">{dbError}</p>
      {#if isNewerDatabase(dbError)}
        <p class="hint">{t("db.newerHint")}</p>
      {:else}
        <p class="hint">{t("db.migrationHint")}</p>
        {#if updateBackup}<p class="hint">{t("db.backupAt", { path: updateBackup })}</p>{/if}
        <p class="hint">
          {t("db.hintBefore")} <code>npm run tauri dev</code> {t("db.hintAfter")}
        </p>
      {/if}
      <div class="row">
        <button type="button" onclick={() => openFolder("backups")}>{t("backup.openFolder")}</button>
        <button type="button" onclick={() => restoreDialog?.open()}>{t("restore.open")}</button>
      </div>
    </section>
  {:else if !ready}
    <!-- The loading screen covers the window, see below. -->
  {:else if view === "settings"}
    <section class="settings">
      <h2>{t("settings.title")}</h2>
      <p class="lede">{t("settings.lede")}</p>
      <div class="settings-grid">
        <section class="group wide" aria-labelledby="conn-title">
          <div class="group-head">
            <h3 id="conn-title">{t("settings.connTitle")}</h3>
            <span class="conn" data-state={conn}><span class="dot"></span>{connLabel}</span>
          </div>
          <p class="lede">{t("settings.connLede")}</p>
          {#if conn === "connected" && board !== "unknown"}
            <p class="detection" data-board={board}>
              {t("settings.detection", { status: boardLabel })}
              {#if canStartDetection}
                <button type="button" class="primary small" onclick={toggleDetection}>{t("board.start")}</button>
              {/if}
            </p>
          {/if}
          <div class="conn-split">
            <form onsubmit={saveSettings}>
              <div class="fields">
                <label class="host">
                  {t("settings.host")}
                  <input type="text" bind:value={draft.host} autocomplete="off" spellcheck="false" />
                </label>
                <label class="port">
                  {t("settings.port")}
                  <input type="number" min="1" max="65535" bind:value={draft.port} />
                </label>
              </div>
              <div class="url-line">
                <p class="url">{autodartsUrl(draft.host.trim() || "…", draft.port || 0)}</p>
                <button type="button" class="link" onclick={useDefaults}>{t("settings.reset")}</button>
              </div>
              {#if formError}<p class="error" role="alert">{formError}</p>{/if}
              {#if conn !== "connected" && !formError}
                <p class="hint">{t("settings.unreachable")}</p>
              {/if}
              <div class="row">
                <button type="submit" class="primary">{t("settings.save")}</button>
                <button type="button" class="ghost" onclick={searchBoards} disabled={searching}>
                  {t(searching ? "settings.searching" : "settings.search")}
                </button>
              </div>
              {#if found && !searching}
                {#if found.length === 0}
                  <p class="hint">{t("settings.foundNone")}</p>
                {:else if found.length === 1}
                  <p class="hint">{t("settings.foundOne", { name: found[0].name })}</p>
                {:else}
                  <p class="hint">{t("settings.foundMany")}</p>
                  <div class="row found">
                    {#each found as b (b.id)}
                      <button
                        type="button"
                        class="ghost small"
                        class:picked={draft.host === b.host && draft.port === b.port}
                        onclick={() => pickBoard(b)}
                      >
                        {b.name} · {b.host}:{b.port}{b.cams ? ` · ${t("settings.cams", { n: b.cams })}` : ""}
                      </button>
                    {/each}
                  </div>
                {/if}
              {/if}
            </form>
            <!-- The connection check: darts thrown now show up here. -->
            <div class="recent-box">
              <h4>{t("settings.recentTitle")}</h4>
              {#if recent.length}
                <p class="recent">{recent.join("  ")}</p>
              {:else}
                <p class="hint">{t("settings.recentEmpty")}</p>
              {/if}
            </div>
          </div>
        </section>

        <section class="group" aria-labelledby="lang-title">
          <h3 id="lang-title">{t("settings.languageTitle")}</h3>
          <label>
            {t("settings.language")}
            <Select
              value={getLocale()}
              options={LOCALES.map((l) => ({ value: l.id, label: l.name, icon: l.flag }))}
              onchange={(id) => changeLanguage(id)}
            />
          </label>
        </section>

        <section class="group" aria-labelledby="display-title">
          <h3 id="display-title">{t("settings.displayTitle")}</h3>
          <label>
            {t("settings.animations")}
            <Select
              value={fx.enabled ? "on" : "off"}
              options={[
                { value: "on", label: t("settings.animationsOn") },
                { value: "off", label: t("settings.animationsOff") },
              ]}
              onchange={(v) => setAnimations(v === "on")}
            />
          </label>
          <p class="hint">{t("settings.animationsHint")}</p>
        </section>

        <section class="group" aria-labelledby="playing-title">
          <h3 id="playing-title">{t("settings.playingTitle")}</h3>
          <label>
            {t("game.counting")}
            <Select
              value={prefs.instantCount ? "on" : "off"}
              options={[
                { value: "off", label: t("game.countingVisit") },
                { value: "on", label: t("game.countingInstant") },
              ]}
              onchange={(v) => setInstantCount(v === "on")}
            />
          </label>
          <p class="hint">{t("settings.countingHint")}</p>
        </section>

        <section class="group wide" aria-labelledby="updates-title">
          <h3 id="updates-title">{t("updates.title")}</h3>
          <p>
            {t("updates.current", { v: __APP_VERSION__ })}
            {#if updates.channel === "preview"}<span class="preview-pill">{t("developer.previewLabel")}</span>{/if}
          </p>
          <label>
            {t("updates.auto")}
            <Select
              value={updates.autoCheck ? "on" : "off"}
              options={[
                { value: "on", label: t("updates.autoOn") },
                { value: "off", label: t("updates.autoOff") },
              ]}
              onchange={(v) => setAutoCheck(v === "on")}
            />
          </label>
          <p class="hint">{t("updates.privacy")}</p>
          <div class="row">
            <button class="ghost" disabled={updates.status === "checking" || updates.status === "downloading" || updates.status === "installing"} onclick={() => checkForUpdate({ manual: true })}>
              {t(updates.status === "checking" ? "updates.checking" : "updates.check")}
            </button>
          </div>
          {#if updates.status === "upToDate"}
            <p class="hint" role="status">{t("updates.upToDate", { v: __APP_VERSION__ })}</p>
          {:else if updates.status === "error"}
            <p class="error" role="alert">{t("updates.error")}</p>
            <p class="hint">{updates.error}</p>
            <p><ExternalLink href={releasesUrl()} text={t("updates.manual")} /></p>
          {:else if updates.status === "available" || updates.status === "downloading" || updates.status === "installing"}
            {@render updatePanel(false)}
          {/if}
        </section>

        <section class="group" aria-labelledby="data-title">
          <h3 id="data-title">{t("settings.dataTitle")}</h3>
          <p>{lastBackupAt ? t("backup.last", { when: dateTime(lastBackupAt) }) : t("backup.none")}</p>
          <p class="hint">{t("backup.hint")}</p>
          <div class="row">
            <button class="ghost" onclick={() => openFolder("backups")}>{t("backup.openFolder")}</button>
            <button class="ghost" disabled={inRun} onclick={exportData}>{t("export.button")}</button>
            <button class="ghost" disabled={inRun} onclick={() => restoreDialog?.open()}>{t("restore.open")}</button>
          </div>
          <p class="hint">{t("export.hint")}</p>
          {#if exportNote}<p class={exportNote.failed ? "error" : "hint"} role="status">{exportNote.text}</p>{/if}
        </section>

        <section class="group" aria-labelledby="routines-title">
          <h3 id="routines-title">{t("settings.routinesTitle")}</h3>
          <p class="hint">{t("builtin.restoreHint")}</p>
          <div class="row">
            <button class="ghost" onclick={restoreBuiltins}>{t("builtin.restore")}</button>
          </div>
          {#if restoreNote}<p class="hint" role="status">{restoreNote}</p>{/if}
        </section>

        <section class="group" aria-labelledby="stats-title">
          <h3 id="stats-title">{t("settings.statsTitle")}</h3>
          <label>
            {t("settings.sample")}
            <input class="short" type="number" min="1" max={MAX_SAMPLE} value={statsSample} oninput={changeSample} />
          </label>
          <p class="hint">{t("settings.sampleHint", { n: statsSample })}</p>
        </section>

        <!-- Always the last group: the one button that can't be taken back. -->
        <section class="group wide" aria-labelledby="developer-title">
          <h3 id="developer-title">{t("developer.title")}</h3>
          <p class="hint">{t("developer.hint")}</p>
          <label class="check-row">
            <input
              type="checkbox"
              checked={updates.developer}
              disabled={updates.status === "downloading" || updates.status === "installing"}
              onclick={toggleDeveloper}
            />
            {t("developer.mode")}
          </label>
          {#if updates.developer}
            <label>
              {t("developer.channel")}
              <Select
                value={updates.channel}
                options={[
                  { value: "stable", label: t("developer.channelStable") },
                  { value: "preview", label: t("developer.channelPreview") },
                ]}
                onchange={async (v) => {
                  await setChannel(v === "preview" ? "preview" : "stable");
                  checkForUpdate({ manual: true });
                }}
              />
            </label>
            <p class="hint">{t(updates.channel === "preview" ? "developer.previewHint" : "developer.stableHint")}</p>
          {/if}
        </section>

        <section class="group danger-zone" aria-labelledby="erase-title">
          <h3 id="erase-title">{t("erase.title")}</h3>
          <p class="hint">{t("erase.hint")}</p>
          <div class="row">
            <button class="danger-solid" disabled={inRun} onclick={askErase}>{t("erase.button")}</button>
          </div>
        </section>
      </div>
    </section>
  {:else if view === "about"}
    <section class="settings about">
      <h2>{t("about.title")}</h2>
      <p class="lede">{t("about.lede")}</p>
      <div class="settings-grid">
        <section class="group wide about-hero" aria-labelledby="about-app">
          <Logo height={44} />
          <div>
            <h3 id="about-app">
              {t("about.version", { v: __APP_VERSION__ })}
              {#if updates.channel === "preview"}<span class="preview-pill">{t("developer.previewLabel")}</span>{/if}
            </h3>
            <p>{t("about.what")}</p>
            <p class="hint">{t("about.independent")}</p>
          </div>
        </section>

        <section class="group" aria-labelledby="about-links">
          <h3 id="about-links">{t("about.linksTitle")}</h3>
          <ul class="links">
            {#each [[GITHUB_URL, "about.github", "about.githubHint"], [ISSUES_URL, "about.issues", "about.issuesHint"], [AUTODARTS_URL, "about.autodarts", "about.autodartsHint"], [COFFEE_URL, "footer.coffee", "about.coffeeHint"]] as const as [url, label, hint]}
              <li>
                <ExternalLink href={url} text={t(label)} />
                <span class="hint">{t(hint)}</span>
              </li>
            {/each}
          </ul>
        </section>

        <section class="group" aria-labelledby="about-licenses">
          <h3 id="about-licenses">{t("about.licensesTitle")}</h3>
          <p>
            {t("about.license")}
            <ExternalLink href={LICENSE_URL} text={t("about.licenseLink")} />
          </p>
          <p class="hint">{t("about.thirdParty")}</p>
          <div class="row">
            <button class="ghost" onclick={() => sbomDialog?.open()}>{t("about.sbom")}</button>
          </div>
        </section>

        <section class="group" aria-labelledby="about-logs">
          <h3 id="about-logs">{t("about.logsTitle")}</h3>
          <p class="hint">{t("about.logsHint")}</p>
          <div class="row">
            <button class="ghost" onclick={() => openFolder("logs")}>{t("about.openLogs")}</button>
          </div>
        </section>
      </div>
      <SbomDialog bind:this={sbomDialog} />
    </section>
  {:else if view === "history"}
    <section class="history">
      <h2>{t("history.title")}</h2>
      <div class="history-filters">
        <label>
          {t("history.from")}
          <input type="date" bind:value={historyFrom} max={historyTo} onchange={loadHistory} />
        </label>
        <label>
          {t("history.to")}
          <input type="date" bind:value={historyTo} min={historyFrom} onchange={loadHistory} />
        </label>
        <div class="toggle" role="tablist" aria-label={t("history.kind")}>
          {#each [["all", "history.kindAll"], ["routines", "history.kindRoutines"], ["quick", "history.kindQuick"]] as const as [kind, key]}
            <button role="tab" aria-selected={historyKind === kind} onclick={() => (historyKind = kind)}>{t(key)}</button>
          {/each}
        </div>
      </div>
      {#if shownHistory.length === 0}
        <p class="hint">{t(history.length === 0 && dpiResults.length === 0 ? "history.empty" : "history.emptyFiltered")}</p>
      {/if}
      <ul class="sessions">
        {#each shownHistory as s (s.id)}
          <li class="session">
            <div class="session-title">
              <strong>{sessionName(s)}</strong>
              {#if s.status === "aborted"}
                <span class="badge">{t("history.aborted")}</span>
              {:else if s.status === "running"}
                <span class="badge live">{t("history.running")}</span>
              {/if}
              <span class="plan-meta">
                {dateTime(s.startedAt)} · {t(s.rows.length === 1 ? "history.game" : "history.games", { n: s.rows.length })}
              </span>
            </div>
            <!-- Its own column, so the labels line up whatever the name. -->
            <span class="session-dpi">
              {#if dpi?.bySession.has(s.id)}
                <span class="badge dpi-badge">{t("dpi.short")} {num(dpi.bySession.get(s.id)!)}</span>
              {/if}
            </span>
            <button class="ghost small" onclick={() => showDetails(s)}>{t("history.details")}</button>
            <button class="icon delete" aria-label={t("history.delete")} title={t("history.delete")} onclick={() => askDelete(s)}>
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                <path fill="currentColor" d="M9 3v1H4v2h1v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6h1V4h-5V3H9Zm-2 3h10v13H7V6Zm2 2v9h2V8H9Zm4 0v9h2V8h-2Z" />
              </svg>
            </button>
          </li>
        {/each}
      </ul>
    </section>
  {:else if view === "stats"}
    {#snippet arrow(tr: Trend)}
      {@const dir = trendDir(tr)}
      {#if dir !== "none"}
        <svg class="arrow" data-dir={dir} viewBox="0 0 16 16" width="18" height="18" aria-hidden="true">
          <path
            d={dir === "up" ? "M4 12 12 4M6 4h6v6" : dir === "down" ? "M4 4l8 8M12 6v6H6" : "M2.5 8h11M9.5 4l4 4-4 4"}
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      {/if}
    {/snippet}
    {#snippet level(p: Performance)}
      <div class="dpi-overall">
        <div class="dpi-score">
          <span class="big">{p.current === null ? "–" : num(p.current)}</span>
          <span class="cap">{t("dpi.of")}</span>
        </div>
        <!-- Motivating is what the app is about: the line on the trend is the hero, the change sits under it. -->
        <div class="motivation">
          <p class="motto" class:quiet={p.trend.kind !== "trend"}>
            {p.current === null ? t("dpi.noneInRange") : trendText(p.trend)}
          </p>
          {#if p.trend.kind === "trend"}
            <p class="trend" data-dir={trendDir(p.trend)}>
              {@render arrow(p.trend)}<span class="trend-value">{trendShort(p.trend)}</span>
            </p>
          {/if}
        </div>
      </div>
    {/snippet}
    <section class="statistics">
      <div class="stats-head">
        <h2>
          {t("stats.title")}
          <button class="info" aria-label={t("dpi.helpOpen")} title={t("dpi.helpOpen")} onclick={() => dpiHelp?.showModal()}>
            <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true">
              <circle cx="8" cy="8" r="6.6" fill="none" stroke="currentColor" stroke-width="1.4" />
              <circle cx="8" cy="4.9" r="0.95" fill="currentColor" />
              <path d="M8 7.3v4.4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
            </svg>
          </button>
        </h2>
        {#if dpi.hasData}
          <div class="stats-controls">
            <div class="range" role="group" aria-label={t("range.label")}>
              {#if statsRange.unit !== "all"}
                <span>{t("range.last")}</span>
                <input
                  type="number"
                  min="1"
                  max="999"
                  value={rangeAmount}
                  oninput={changeRangeAmount}
                  aria-label={t("range.amount")}
                />
              {/if}
              <Select
                label={t("range.unit")}
                value={statsRange.unit as RangeUnit}
                options={RANGE_UNITS.map((u) => ({ value: u, label: rangeUnitLabel(u) }))}
                onchange={(u) => setRange(u)}
              />
            </div>
            <div class="toggle" role="tablist" aria-label={t("dpi.title")}>
              <button role="tab" aria-selected={statsView === "overall"} onclick={() => (statsView = "overall")}>
                {t("dpi.overallIndex")}
              </button>
              <button role="tab" aria-selected={statsView === "games"} onclick={() => (statsView = "games")}>
                {t("dpi.gameIndex")}
              </button>
            </div>
          </div>
        {/if}
      </div>
      {#if !dpi.hasData}
        <div class="dpi">
          <h3>{t("dpi.title")}</h3>
          <p class="hint">{t("dpi.empty")}</p>
        </div>
      {:else if statsView === "overall"}
        <div class="dpi">
          <h3>{t("dpi.overallIndex")}</h3>
          {@render level(dpi.overall)}
          <h4>{t("dpi.chartTitle")}</h4>
          {#if dpi.overallSeries.length}
            <DpiChart points={dpi.overallSeries} pointLabel={t("dpi.pointSession")} window={statsSample} />
          {:else}
            <p class="hint">{t("dpi.chartEmpty")}</p>
          {/if}
        </div>
      {:else}
        <div class="dpi">
          <h3>{t("dpi.gameIndex")}</h3>
          <div class="game-split">
            <ul class="dpi-games" aria-label={t("dpi.games")}>
              {#each dpi.games as g (g.gameId)}
                <li>
                  <button class="dpi-game" aria-pressed={g.gameId === statsGame?.gameId} onclick={() => (statsGameId = g.gameId)}>
                    <span class="game-label">
                      <span class="plan-name">{gameById(g.gameId).name}</span>
                      <span class="plan-meta">{t(`dpi.area.${g.area}`)} · {t("dpi.gameBasedOn", { n: g.performance.count })}</span>
                    </span>
                    <span class="dpi-value">{g.performance.current === null ? "–" : num(g.performance.current)}</span>
                    <span class="trend small" data-dir={trendDir(g.performance.trend)} title={trendText(g.performance.trend)}>
                      {@render arrow(g.performance.trend)}{trendShort(g.performance.trend)}
                    </span>
                  </button>
                </li>
              {/each}
            </ul>
            <div class="game-detail">
              {#if statsGame}
                <h4>{gameById(statsGame.gameId).name}</h4>
                {@render level(statsGame.performance)}
                <div class="chart-head">
                  <span class="chart-title">{t(statsChart === "raw" ? "dpi.rawTitle" : "dpi.chartTitle")}</span>
                  <div class="chart-controls">
                    {#if statsChart === "raw" && statsRaw && statsGame.raw.length > 1}
                      <Select
                        label={t("dpi.metric")}
                        value={statsRaw.key}
                        options={statsGame.raw.map((r) => ({ value: r.key, label: t(metricOf(r.key).label) }))}
                        onchange={(k) => (statsMetric = k)}
                      />
                    {/if}
                    <div class="toggle small" role="tablist" aria-label={t("dpi.chartKind")}>
                      <button role="tab" aria-selected={statsChart === "index"} onclick={() => (statsChart = "index")}>
                        {t("dpi.chartIndex")}
                      </button>
                      <button role="tab" aria-selected={statsChart === "raw"} onclick={() => (statsChart = "raw")}>
                        {t("dpi.chartRaw")}
                      </button>
                    </div>
                  </div>
                </div>
                {#if !statsGame.series.length}
                  <p class="hint">{t("dpi.chartEmpty")}</p>
                {:else if statsChart === "raw" && statsRaw}
                  <DpiChart
                    points={statsRaw.series}
                    pointLabel={t(metricOf(statsRaw.key).label)}
                    window={statsSample}
                    max={metricOf(statsRaw.key).percent ? 100 : undefined}
                    format={metricFormat(statsRaw.key)}
                  />
                {:else}
                  <DpiChart points={statsGame.series} pointLabel={t("dpi.pointGame")} window={statsSample} />
                {/if}
              {/if}
            </div>
          </div>
        </div>
      {/if}
    </section>
  {:else if view === "precision"}
    <Precision />
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
          <button class="icon" aria-label={t("share.export")} title={t("share.export")} onclick={() => exportRoutine(r)}>
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path fill="currentColor" d="M12 3 7 8l1.4 1.4L11 6.8V16h2V6.8l2.6 2.6L17 8l-5-5ZM5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5h-2v5H7v-5H5Z" />
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
        <button class="ghost small quick" onclick={openQuick} title={t("quick.hint")}>
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M13 2 4 14h7l-1 8 9-12h-7z" /></svg>
          {t("quick.name")}
        </button>
        <h2>{t("train.title")}</h2>
        <div class="pick-actions">
          <button class="ghost small" onclick={importRoutine} title={t("share.importHint")}>
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <path fill="currentColor" d="m12 16 5-5-1.4-1.4-2.6 2.6V3h-2v9.2L8.4 9.6 7 11l5 5Zm-7-2v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5h-2v5H7v-5H5Z" />
            </svg>
            {t("share.import")}
          </button>
          <button class="ghost small new" onclick={addRoutine}>
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z" /></svg>
            {t("routines.new")}
          </button>
        </div>
      </div>
      <RoutineCarousel {routines} bind:selectedId {lastPlayed} {offline} onstart={startRoutine} onedit={() => go("routines")} />
      <AddGameDialog bind:this={quickDialog} quick {offline} onadd={startQuick} />
    </section>
  {:else if phase === "countdown" && run && item && def}
    <section class="countdown">
      <p class="progress">{run.routine.name}</p>
      {#key countdownLeft}
        <div class="count" aria-live="assertive">{countdownLeft}</div>
      {/key}
      <p class="lede">{run.quick ? def.name : t("run.firstUp", { name: def.name })}</p>
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
          {@render gameIntro(def)}
          <p class="settings-line">{settingsLine(item)}</p>
        </div>
      </div>
      {#if !canStart}
        {@render waitHint()}
      {/if}
    </section>
  {:else if phase === "ready" && run && item && def}
    <section class="narrow">
      <p class="progress">{run.quick ? t("quick.name") : t("run.progress", { n: run.index + 1, total: run.routine.items.length })}</p>
      <h2>{def.name}</h2>
      {@render gameIntro(def)}
      <p class="settings-line">{settingsLine(item)}</p>
      {#if !canStart}
        {@render waitHint()}
      {/if}
    </section>
  {:else if phase === "running" && session && result && run && def}
    <section class="stage">
      <div class="panel">
        <p class="progress">
          {run.quick
            ? t("quick.progress", { name: def.name })
            : t("run.progressNamed", { n: run.index + 1, total: run.routine.items.length, name: def.name })}
        </p>
        <div class="clock" class:paused class:last={lastSeconds} use:useFx={{ effect: "pulse", active: lastSeconds }}>
          {totalMs ? fmt(remaining) : fmt(elapsed, true)}
        </div>
        <p class="note" class:quiet={!waiting && !paused}>
          {#if waiting}
            {t("run.waitingForBoard")}
          {:else if paused}
            {t("run.paused")}
          {:else}
            {t("run.keepThrowing")}
          {/if}
        </p>
        {#if paused && !waiting}
          <Quote />
        {/if}

        {#if result.focus}
          <div class="focus">
            <span class="cap">{result.focus.label}</span>
            <!-- Words ("Single bull", "Success") get a smaller size so they fit the box. -->
            <span class="big" class:long={result.focus.value.length > 4}>{result.focus.value}</span>
            {#if result.focus.hint}<span class="route">{result.focus.hint}</span>{/if}
          </div>
        {/if}

        {#if result.darts}
          <DartMeter {...result.darts} />
        {/if}

        {#if heroes.length === 1}
          <div class="hero">
            <span class="big">{heroes[0].value}</span>
            <span class="cap">{heroes[0].label}</span>
          </div>
        {:else if heroes.length}
          <div class="hero pair">
            {#each heroes as h (h.key)}
              <div><span class="big">{h.value}</span><span class="cap">{h.label}</span></div>
            {/each}
          </div>
        {/if}

        {#if others.length}
          <dl class="stats">
            {#each others as l (l.key)}
              <div><dt>{l.label}</dt><dd>{l.value}</dd></div>
            {/each}
          </dl>
        {/if}
        {#if gridLines.length}
          <dl class="stats stats-grid">
            {#each gridLines as l (l.key)}
              <div class:wide={l.grid === "wide"}><dt>{l.label}</dt><dd>{l.value}</dd></div>
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
            <button class="icon next-turn" title={t("run.nextTurn")} aria-label={t("run.nextTurn")} onclick={nextTurn}>
              <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                <path fill="currentColor" d="M3 11h11.2l-4.6-4.6L11 5l7 7-7 7-1.4-1.4 4.6-4.6H3zM19 5h2v14h-2z" />
              </svg>
            </button>
          {/if}
          {#each [0, 1, 2] as i (i)}
            {@const d = shownDarts[i]}
            {#if d}
              <button
                class="dart-box filled"
                class:editing={session.edit === i}
                class:fixed={d.method === "manual"}
                aria-pressed={session.edit === i}
                aria-label={t("run.correctDart", { n: i + 1, dart: dartLabel(d) })}
                onclick={() => session?.toggleEdit(i)}
              >{dartLabel(d)}</button>
            {:else}
              <div class="dart-box" class:closed={i >= bustAt} title={i >= bustAt ? closedHint : undefined}>{i >= bustAt ? "✕" : "–"}</div>
            {/if}
          {/each}
        </div>
        <!-- While a dart is corrected: the fields next to the one it counted, one click each, or a click on the board. -->
        <div class="pick-hint" class:show={session.edit !== null}>
          {#if fixes.length}
            <span class="quick" role="group" aria-label={t("run.quickAria")}>
              {#each fixes as f (dartLabel(f) + (f.zone ?? ""))}
                <button class="chip" onclick={() => session?.correct(f)}>{dartLabel(f)}</button>
              {/each}
            </span>
          {/if}
          <span class="pick-text" aria-live="polite">
            {session.edit !== null ? t(fixes.length ? "run.quickHint" : "run.pickHint", { n: session.edit + 1 }) : ""}
          </span>
        </div>
        <div class="board" bind:this={boardEl}>
          <Board
            turns={session.allTurns.filter((_, k) => k !== session?.shownTurn)}
            current={shownDarts}
            targets={result.targets}
            picking={session.edit !== null || (!paused && session.canAdd)}
            onpick={(d) => (session?.edit !== null ? session?.correct(d) : !paused && session?.add(d))}
          />
          {#if shot}
            <GameShot next={shot.next} moment={shotMoment} pulling={throwPhase === "takeoutInProgress"} />
          {:else if roundEnd}
            <RoundEndOverlay round={roundEnd} moment={shotMoment} pulling={throwPhase === "takeoutInProgress"} />
          {/if}
        </div>
      </div>

      <!-- Without the detection the game is paused: a screen over it says why, until Autodarts is back. -->
      {#if waiting}
        <div class="lost" role="alertdialog" aria-labelledby="lost-title">
          <div class="lost-card">
            <h2 id="lost-title">{t(conn === "connected" ? "run.detectionLost" : "run.connectionLost")}</h2>
            <p class="lede">{t("run.waitingForBoard")}</p>
            {@render waitHint()}
          </div>
        </div>
      {/if}

    </section>
  {:else if phase === "summary" && run}
    {@const picked = run.results[summaryPick]}
    <section class="summary">
      <div class="summary-head">
        <div class="summary-title">
          <h2>{t(run.quick ? "quick.finished" : "summary.title")}</h2>
          <p class="lede">{run.quick && picked ? gameById(picked.gameId).name : run.routine.name}</p>
        </div>
        {#if !run.quick && runIndex !== null}
          <div class="dpi-score" title={t("dpi.helpOpen")}>
            <span class="cap">{t("summary.total")}</span>
            <span class="big" use:useFx={{ effect: "countUp", value: runIndex, format: (n) => num(n) }}></span>
            <span class="cap">{t("dpi.of")}</span>
          </div>
        {/if}
        <div class="row summary-actions">
          {#if run.quick}
            <button class="ghost" onclick={playAgain}>{t("quick.again")}</button>
          {/if}
          <button class="primary" onclick={closeRun}>{t("summary.done")}</button>
        </div>
      </div>
      <p class="closing">{t(closing)}</p>

      <div class="summary-split" class:single={run.quick}>
        {#if !run.quick}
          <ul class="dpi dpi-games summary-games" aria-label={t("summary.games")}>
            {#each run.results as r, i (i)}
              {@const g = gameById(r.gameId)}
              {@const idx = runIndices[i]}
              <li use:useFx={{ effect: "in", delay: i * 80 }}>
                <button class="dpi-game" aria-pressed={i === summaryPick} onclick={() => (summaryPick = i)}>
                  <span class="game-label">
                    <span class="plan-name">
                      {g.name}
                      {#if runBests[i]?.size}<span class="badge best">{t("summary.newBest")}</span>{/if}
                    </span>
                    <span class="plan-meta">{g.describe(r.settings)}</span>
                  </span>
                  {#if idx === null}
                    <span class="dpi-value" title={t("dpi.short")}>–</span>
                  {:else}
                    <span class="dpi-value" title={t("dpi.short")} use:useFx={{ effect: "countUp", value: idx, format: (n) => num(n) }}></span>
                  {/if}
                </button>
              </li>
            {/each}
          </ul>
        {/if}

        {#if picked}
          {@const g = gameById(picked.gameId)}
          {@const idx = runIndices[summaryPick]}
          {@const scores = picked.hasResult ? metricScores(picked.gameId, picked.settings, picked.values) : null}
          <div class="dpi summary-detail" use:useFx={{ effect: "in", delay: 120 }}>
            <h3>{g.name}</h3>
            <p class="hint played">
              {g.describe(picked.settings)} · {playedLine({ ...picked, endedEarly: picked.early })}{#if picked.completed} · {t("summary.completed")}{/if}
            </p>
            {#if !picked.hasResult}
              <p class="hint">{t("summary.noResult")}</p>
            {:else}
              {#if scores}
                <div class="dpi-overall summary-index">
                  <div class="dpi-score">
                    <span class="cap">{t("dpi.short")}</span>
                    {#if idx === null}
                      <span class="big">–</span>
                    {:else}
                      <span class="big" use:useFx={{ effect: "countUp", value: idx, format: (n) => num(n) }}></span>
                    {/if}
                    <span class="cap">{t("dpi.of")}</span>
                  </div>
                  <p class="hint">
                    {#if idx === null}
                      {t("summary.tooShort")}
                    {:else if summaryEarlierIndex !== null}
                      {t("summary.indexAverage", { n: num(summaryEarlierIndex) })}
                    {:else}
                      {t("summary.firstIndex")}
                    {/if}
                  </p>
                </div>
                <h4>{t("summary.breakdown")}</h4>
                <ul class="metrics">
                  {#each scores.metrics as m (m.key)}
                    <li>
                      <span class="metric-name">
                        {t(metricOf(m.key).label)}
                        {#if runBests[summaryPick]?.has(m.key)}<span class="badge best">{t("summary.newBest")}</span>{/if}
                        {#if scores.metrics.length > 1}<span class="cap">· {t("summary.share", { n: num(m.weight * 100) })}</span>{/if}
                      </span>
                      <span class="metric-value">{metricFormat(m.key)(m.value)}</span>
                      <span class="meter" aria-hidden="true"><span style:width="{m.score}%"></span></span>
                      <span class="metric-points">{t("summary.points", { n: num(m.score) })}</span>
                    </li>
                  {/each}
                </ul>
              {/if}
              <h4>{t("summary.stats")}</h4>
              <table class="compare">
                <thead>
                  <tr>
                    <th scope="col"><span class="sr-only">{t("summary.stat")}</span></th>
                    <th scope="col">{t("summary.today")}</th>
                    {#if summaryEarlier.length}<th scope="col">{t("summary.average", { n: summaryEarlier.length })}</th>{/if}
                  </tr>
                </thead>
                <tbody>
                  {#each picked.lines as l (l.key)}
                    <tr>
                      <th scope="row">{l.label}</th>
                      <td class:strong={l.hero}>{l.value}</td>
                      {#if summaryEarlier.length}<td class="avg">{lineAverage(l) || "–"}</td>{/if}
                    </tr>
                  {/each}
                </tbody>
              </table>
              {#if !summaryEarlier.length}<p class="hint">{t("summary.noEarlier")}</p>{/if}
            {/if}
          </div>
        {/if}
      </div>
      {#if run.results.some((r) => r.hasResult)}<p class="hint">{t("summary.saved")}</p>{/if}
    </section>
  {/if}
</main>
  {#snippet failed(_error, reset)}
    <main>
      <section class="narrow">
        <h2>{t("crash.screenTitle")}</h2>
        <p class="hint">{t("crash.screenHint")}</p>
        <button
          class="primary"
          onclick={() => {
            view = "train";
            reset();
          }}>{t("crash.backToTrain")}</button
        >
      </section>
    </main>
  {/snippet}
</svelte:boundary>

<FxLayer />

<!-- "Erase all data", asked twice. Escape or the backdrop cancels, except while it runs. -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<dialog
  class="confirm erase"
  bind:this={eraseDialog}
  aria-labelledby="erase-dialog-title"
  oncancel={(e) => erasing && e.preventDefault()}
  onclick={(e) => {
    if (e.target === eraseDialog && !erasing) eraseDialog.close();
  }}
>
  <h3 id="erase-dialog-title">{t(eraseStep === 1 ? "erase.step1Title" : "erase.step2Title")}</h3>
  {#if eraseStep === 1}
    <p class="warning">{t("erase.step1Lost")}</p>
    <p class="lede">{t("erase.step1Body")}</p>
  {:else}
    <p class="warning">{t("erase.step2Body")}</p>
    <p class="hint">{t("erase.backupNote")}</p>
  {/if}
  {#if eraseError}<p class="error" role="alert">{eraseError}</p>{/if}
  <div class="foot">
    <button class="ghost" disabled={erasing} onclick={() => eraseDialog?.close()}>{t("erase.cancel")}</button>
    {#if eraseStep === 1}
      <button class="danger-solid" onclick={() => (eraseStep = 2)}>{t("erase.step1Yes")}</button>
    {:else}
      <button class="danger-solid" disabled={erasing} onclick={eraseAll}>{erasing ? t("erase.erasing") : t("erase.step2Yes")}</button>
    {/if}
  </div>
</dialog>

<!-- Asked before developer mode goes on: betas can change the data so that a stable version can't read it. -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<dialog
  class="confirm erase"
  bind:this={developerDialog}
  aria-labelledby="developer-dialog-title"
  onclick={(e) => {
    if (e.target === developerDialog) developerDialog.close();
  }}
>
  <h3 id="developer-dialog-title">{t("developer.confirmTitle")}</h3>
  <p class="warning">{t("developer.confirmWarning")}</p>
  <p class="lede">{t("developer.confirmBody")}</p>
  <p class="hint">{t("developer.confirmBackup")}</p>
  <div class="foot">
    <button class="ghost" onclick={() => developerDialog?.close()}>{t("developer.confirmCancel")}</button>
    <button class="danger-solid" onclick={confirmDeveloper}>{t("developer.confirmYes")}</button>
  </div>
</dialog>

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

<!-- How the performance index is worked out, in words. Escape, the backdrop or the button closes it. -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<dialog
  class="confirm help"
  bind:this={dpiHelp}
  aria-labelledby="dpi-help-title"
  onclick={(e) => {
    if (e.target === dpiHelp) dpiHelp.close();
  }}
>
  <h3 id="dpi-help-title">{t("dpi.helpTitle")}</h3>
  <p>{t("dpi.helpIntro")}</p>
  <h4>{t("dpi.helpGameTitle")}</h4>
  <p>{t("dpi.helpGame")}</p>
  <h4>{t("dpi.helpOverallTitle")}</h4>
  <p>{t("dpi.helpOverall")}</p>
  <h4>{t("dpi.helpLevelTitle")}</h4>
  <p>{t("dpi.helpLevel", { n: statsSample })}</p>
  <h4>{t("dpi.helpTrendTitle")}</h4>
  <p>{t("dpi.helpTrend", { n: statsSample })}</p>
  <p class="hint">{t("dpi.helpVersion", { v: dpi.version })}</p>
  <div class="foot">
    <button class="primary" onclick={() => dpiHelp?.close()}>{t("dpi.helpClose")}</button>
  </div>
</dialog>

<!-- The games of one session. Escape, the backdrop or the button closes it. -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<!-- The update: what is new, read in the app, and the choice to install now, later or never. -->
<dialog
  class="confirm update-dialog"
  bind:this={updateDialog}
  aria-labelledby="update-title"
  onclick={(e) => {
    if (e.target === updateDialog) updateDialog?.close();
  }}
>
  <div class="update-head">
    <span class="update-badge">{@render updateIcon(22)}</span>
    <div>
      <h3 id="update-title">{t("updates.available", { v: updates.version })}</h3>
      <p class="hint">{t("updates.current", { v: __APP_VERSION__ })}</p>
    </div>
    <button class="close" aria-label={t("history.close")} title={t("history.close")} onclick={() => updateDialog?.close()}>
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M6 6l12 12M18 6 6 18" />
      </svg>
    </button>
  </div>
  {#if updates.status === "available" || updates.status === "downloading" || updates.status === "installing"}
    {@render updatePanel(true)}
  {/if}
</dialog>

<dialog
  class="confirm details"
  bind:this={detailDialog}
  aria-labelledby="details-title"
  onclick={(e) => {
    if (e.target === detailDialog) detailDialog.close();
  }}
  onclose={() => (detailSession = null)}
>
  {#if detailSession}
    {@const s = detailSession}
    <h3 id="details-title">{sessionName(s)}</h3>
    <p class="lede">
      {dateTime(s.startedAt)}
      {#if dpi?.bySession.has(s.id)}
        <span class="badge dpi-badge">{t("dpi.short")} {num(dpi.bySession.get(s.id)!)}</span>
      {/if}
    </p>
    {#if s.rows.length === 0}
      <p class="hint">{t("history.noGames")}</p>
    {:else}
      <ul class="plan">
        {#each s.rows as r (r.id)}
          {@const g = gameById(r.gameId)}
          <li>
            <!-- The stored name is in the language of the day it was played, unless the game still exists. -->
            <span class="plan-name">{g.id === r.gameId ? g.name : r.gameName}</span>
            <span class="plan-meta">
              {#if dpi?.byResult.has(r.id)}
                <span class="badge dpi-badge">{t("dpi.short")} {num(dpi.byResult.get(r.id)!)}</span>
              {:else if hasIndex(r.gameId)}
                <span class="badge dpi-badge skipped" title={t("dpi.tooShort")}>{t("dpi.short")}</span>
              {/if}
            </span>
            <span class="plan-desc">{playedLine(r)} · {g.describe(r.settings)}</span>
            <span class="plan-desc strong">{g.summary(r.values)}</span>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
  <div class="foot">
    <button class="primary" onclick={() => detailDialog?.close()}>{t("history.close")}</button>
  </div>
</dialog>

<!-- Deleting a session changes the index, so it is asked for. Escape or the backdrop aborts. -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<dialog
  class="confirm"
  bind:this={deleteDialog}
  aria-labelledby="delete-title"
  onclick={(e) => {
    if (e.target === deleteDialog) deleteDialog.close();
  }}
  onclose={() => (deleteTarget = null)}
>
  <h3 id="delete-title">{t("history.deleteTitle")}</h3>
  {#if deleteTarget}
    <p class="lede">{t("history.deleteBody", { name: sessionName(deleteTarget), date: dateTime(deleteTarget.startedAt) })}</p>
  {/if}
  <p class="hint">{t("history.deleteDpi")}</p>
  <div class="foot">
    <button class="ghost" onclick={() => deleteDialog?.close()}>{t("common.cancel")}</button>
    <button class="primary destructive" onclick={confirmDelete}>{t("history.deleteConfirm")}</button>
  </div>
</dialog>

{#if !ready && !dbError}
  <!-- Filled a little before the minimum time is up, so the full bar shows for a moment. -->
  <LoadingScreen progress={loadDone / LOAD_STEPS} label={t(loadLabel)} fillMs={MIN_LOADING_MS - 250} />
{/if}

<footer class:compact={fit}>
  <div class="meta">
    <span>D³ v{__APP_VERSION__}</span>
    <a class="coffee" href={COFFEE_URL} onclick={(e) => openExternal(e, COFFEE_URL)}>
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d={COFFEE_ICON} /></svg>
      {t("footer.coffee")}
    </a>
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
  {#if conn === "connected"}
    <div class="board-actions" role="group" aria-label={t("board.actions")}>
      <button
        class="icon"
        class:go={canStartDetection}
        aria-label={t(canStopDetection ? "board.stop" : "board.start")}
        title={t(canStopDetection ? "board.stop" : "board.start")}
        disabled={!canStartDetection && !canStopDetection}
        onclick={toggleDetection}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          {#if canStopDetection}
            <path fill="currentColor" d="M7 6h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z" />
          {:else}
            <path fill="currentColor" d="M8 5.14v13.72a1 1 0 0 0 1.52.85l10.8-6.86a1 1 0 0 0 0-1.7L9.52 4.29A1 1 0 0 0 8 5.14Z" />
          {/if}
        </svg>
      </button>
      <button class="icon" aria-label={t("board.reset")} title={t("board.reset")} disabled={!canReset} onclick={() => resetBoard()}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path fill="currentColor" d="M12 5V2L7 6l5 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7Z" />
        </svg>
      </button>
      <button class="icon" aria-label={t("board.calibrate")} title={t("board.calibrate")} disabled={!canCalibrate} onclick={calibrateBoard}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path fill="currentColor" d="M11 2h2v3.07A7 7 0 0 1 18.93 11H22v2h-3.07A7 7 0 0 1 13 18.93V22h-2v-3.07A7 7 0 0 1 5.07 13H2v-2h3.07A7 7 0 0 1 11 5.07V2Zm1 5a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm0 3a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z" />
        </svg>
      </button>
      <!-- Whether the last reset or calibration worked, over the buttons. -->
      {#if boardNote}
        <span class="confirm-bubble up" class:ok={!boardNote.failed} role="status">{boardNote.text}</span>
      {/if}
    </div>
  {/if}
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
      linear-gradient(rgb(6 13 18 / 0.5), rgb(6 13 18 / 0.5)) fixed,
      url("./assets/brand/art/backdrop.webp") var(--backdrop-pos, center) / var(--backdrop-size, cover) no-repeat fixed,
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
  button.icon[aria-current="page"], button.icon.fullscreen.active { color: var(--accent); background: var(--panel); }
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
    justify-content: flex-end;
    align-items: center;
    gap: 1rem;
    padding: 0.6rem 1.5rem;
    border-top: 1px solid var(--line);
    font-size: 0.85rem;
    color: var(--dim);
  }
  .meta { display: flex; gap: 1.25rem; align-items: center; margin-right: auto; }
  .meta a { color: var(--dim); text-decoration: none; }
  .meta a:hover { color: var(--accent); }
  .meta .coffee { display: inline-flex; align-items: center; gap: 0.4rem; }
  /* The cup takes the Buy Me a Coffee yellow on hover. */
  .meta .coffee:hover svg { color: #ffdd00; }
  .conn { display: flex; align-items: center; gap: 0.5rem; color: var(--dim); font-size: 0.9rem; }
  .dot { width: 0.6rem; height: 0.6rem; border-radius: 50%; background: var(--dim); }
  .conn[data-state="connected"] { color: var(--chalk); }
  .conn[data-state="connected"] .dot { background: var(--ok); }
  .conn[data-state="connecting"] .dot { background: var(--dart); }
  /* Connected, but the client doesn't detect darts right now. */
  .conn[data-board="idle"] .dot { background: var(--dart); }
  .board-icon { display: inline-flex; color: var(--dart); cursor: help; }
  /* Pulled up against the status, so the buttons read as part of it. */
  .board-actions { position: relative; display: flex; gap: 0.15rem; margin-left: -0.65rem; }
  .board-actions button.icon { width: 1.9rem; height: 1.9rem; }
  .board-actions button.icon.go { color: var(--accent); }
  .confirm-bubble.up { top: auto; bottom: calc(100% + 0.6rem); right: -0.6rem; }
  .confirm-bubble.up::before { bottom: auto; top: 100%; border-bottom-color: transparent; border-top-color: #ff9b8f; }
  .confirm-bubble.ok { border-color: var(--accent); background: #0f2a31; color: #d4f6fc; }
  .confirm-bubble.up.ok::before { border-top-color: var(--accent); }
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
  .progress { color: var(--dim); margin: 0 0 0.35rem; font-size: 0.95rem; }
  .settings-line { margin: 0 0 1rem; }
  .wait-hint button { margin-left: 0.5rem; vertical-align: baseline; }

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
  .pick-head .pick-actions { grid-column: 3; justify-self: end; display: flex; gap: 0.5rem; }
  .pick-actions button { display: inline-flex; align-items: center; gap: 0.35rem; }
  .pick-head .quick { grid-column: 1; grid-row: 1; justify-self: start; display: inline-flex; align-items: center; gap: 0.35rem; }
  @media (max-width: 640px) {
    .pick-head { grid-template-columns: 1fr auto auto; }
    .pick-head h2 { grid-column: 1; text-align: left; }
    .pick-head .quick { grid-column: 2; }
    .pick-head .pick-actions { grid-column: 3; }
  }
  /* Shared form controls and buttons, also used by components in lib/. */
  :global {
    /* Text, dialogs and the pill toggle. */
    .lede { color: var(--dim); max-width: 56ch; line-height: 1.5; margin: 0 0 1.25rem; }
    .error { color: #ff9b8f; }
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
    .toggle { display: flex; gap: 0.25rem; padding: 0.2rem; border: 1px solid var(--line); border-radius: 999px; background: var(--panel); }
    .toggle button { padding: 0.35rem 1rem; border: none; border-radius: 999px; background: none; color: var(--dim); font: inherit; cursor: pointer; }
    .toggle button:hover { color: var(--chalk); }
    .toggle button[aria-selected="true"] { background: var(--accent); color: var(--on-accent); font-weight: 600; }
    .toggle.small button { padding: 0.2rem 0.75rem; font-size: 0.9rem; }
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
    .found { margin-top: 0.5rem; }
    .found .picked { border-color: var(--chalk); }
    .row { display: flex; gap: 0.75rem; margin-top: 1.25rem; flex-wrap: wrap; align-items: center; }
    button.primary, button.ghost, button.danger-solid {
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
    button.danger-solid { border: 1px solid #ff6b5b; background: #b3261e; color: #fff; font-weight: 700; }
    button.danger-solid:hover:not(:disabled) { background: #d0342a; }
    button.danger-solid:disabled { opacity: 0.5; cursor: not-allowed; }
    .confirm.erase { border-color: #ff6b5b; }
    .confirm.erase h3 { color: #ff9b8f; }
    .confirm.erase .warning { padding: 0.6rem 0.8rem; border-left: 3px solid #ff6b5b; background: rgb(179 38 30 / 0.18); color: #ffd9d3; font-weight: 600; }
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

  /* Paused for the lost detection: covers the game, so no dart is set by hand meanwhile. */
  .lost {
    position: absolute;
    inset: -1rem;
    z-index: 6;
    display: grid;
    place-items: center;
    border-radius: 1rem;
    background: rgb(6 13 18 / 0.82);
    backdrop-filter: blur(3px);
  }
  .lost-card {
    max-width: 30rem;
    padding: 2rem 2.5rem;
    border: 1px solid var(--dart);
    border-radius: 0.9rem;
    background: var(--panel);
    text-align: center;
  }
  .lost-card h2 { margin: 0 0 0.75rem; color: var(--dart); }

  .stage .panel { display: flex; flex-direction: column; align-items: center; text-align: center; }
  .clock { font-size: 4.5rem; font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1; }
  .clock.paused { color: var(--dart); opacity: 0.75; }
  .clock.last { color: var(--accent); }
  .classic-name { margin: -0.35rem 0 0.75rem; color: var(--dim); font-size: 0.8rem; letter-spacing: 0.06em; text-transform: uppercase; }
  .game-goal { margin: 0 0 1rem; color: var(--chalk); line-height: 1.45; }
  .game-goal strong { color: var(--accent); margin-right: 0.25rem; }
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
  .focus .route { margin-top: 0.4rem; color: var(--dim); letter-spacing: 0.04em; }
  .focus .big { font-size: 6.5rem; line-height: 1; }
  .focus .big.long { font-size: 3.6rem; line-height: 1.2; }
  .hero { display: flex; align-items: baseline; justify-content: center; gap: 0.75rem; margin-bottom: 1.25rem; }
  /* Two headline numbers side by side, each with its label under it. */
  .hero.pair { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; text-align: center; }
  .hero.pair > div { display: flex; flex-direction: column; align-items: center; }
  .big { font-size: 3.2rem; font-weight: 700; font-variant-numeric: tabular-nums; }
  .cap { color: var(--dim); }
  .stats { margin: 0; border-top: 1px solid var(--line); }
  .stage .stats { width: min(100%, 24rem); text-align: left; }
  .stats div { display: flex; justify-content: space-between; padding: 0.55rem 0; border-bottom: 1px solid var(--line); }
  /* Small counts side by side (Ton Machine's visit bands), the wide one across both columns. */
  .stats-grid { display: grid; grid-template-columns: 1fr 1fr; column-gap: 1.5rem; border-top: 0; }
  .stats-grid div.wide { grid-column: 1 / -1; }
  dt { color: var(--dim); }
  dd { margin: 0; font-weight: 600; font-variant-numeric: tabular-nums; }

  /* The summary: the actions and the total up top, the games on the left, the picked one beside them. */
  .summary-head { display: flex; align-items: center; gap: 1rem 2rem; flex-wrap: wrap; }
  .summary-title { flex: 1 1 16rem; }
  .summary-title h2 { margin: 0; }
  .summary-title .lede { margin: 0.25rem 0 0; }
  .summary-head .dpi-score .big { color: var(--accent); }
  .summary-actions { margin: 0; }
  .closing { margin: 1rem 0 1.5rem; padding-left: 1rem; border-left: 3px solid var(--accent); font-size: 1.35rem; font-weight: 700; line-height: 1.3; text-wrap: balance; }
  .summary-split { display: grid; gap: 1.25rem 2rem; align-items: start; }
  .summary-games { margin: 0; padding: 0.5rem; }
  .summary-games li:last-child { border-bottom: 0; }
  .summary-detail { min-width: 0; }
  .summary-detail h3 { margin-bottom: 0.25rem; }
  .summary-detail .played { margin: 0 0 1rem; }
  .summary-detail h4 { margin: 1.25rem 0 0.5rem; }
  .summary-index { margin-bottom: 0; }
  .summary-index .big { color: var(--accent); }
  .summary-index .hint { margin: 0; }
  .metrics { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--line); }
  .metrics li { display: grid; grid-template-columns: minmax(8rem, 1fr) auto minmax(5rem, 1.2fr) 5.5rem; align-items: center; gap: 0.75rem; padding: 0.55rem 0; border-bottom: 1px solid var(--line); }
  .metric-name { color: var(--dim); }
  .badge.best { margin-left: 0.4rem; color: var(--dart); border-color: var(--dart); font-size: 0.75rem; font-weight: 600; white-space: nowrap; }
  .metric-value, .metric-points { font-weight: 600; font-variant-numeric: tabular-nums; text-align: right; }
  .metric-points { color: var(--accent); }
  .meter { height: 6px; border-radius: 3px; background: var(--line); overflow: hidden; }
  .meter span { display: block; height: 100%; border-radius: 3px; background: var(--accent); }
  .compare { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
  .compare th, .compare td { padding: 0.5rem 0; border-bottom: 1px solid var(--line); text-align: right; }
  .compare thead th { color: var(--dim); font-size: 0.85rem; font-weight: 400; border-top: 1px solid var(--line); }
  .compare th[scope="row"] { color: var(--dim); font-weight: 400; text-align: left; }
  .compare td { font-weight: 600; padding-left: 1rem; }
  .compare td.strong { color: var(--dart); }
  .compare td.avg { color: var(--dim); font-weight: 400; }
  @media (min-width: 720px) {
    .summary-split { grid-template-columns: minmax(14rem, 2fr) 3fr; }
    .summary-split.single { grid-template-columns: minmax(0, 46rem); }
  }

  button.icon { position: relative; }
  .banner.ok { background: #1f4a2c; color: #d8f5e0; }
  /* Release notes: a recessed card, darker than the panel around it, scrolling on its own. */
  .notes {
    max-height: 16rem;
    overflow: auto;
    margin: 0.75rem 0 0;
    padding: 0.1rem 1rem 0.7rem;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--bg);
    scrollbar-color: var(--line) transparent;
  }
  .notes-link { margin: 0.6rem 0 0; font-size: 0.9rem; }
  .update-progress { margin-top: 1.25rem; }
  .update-progress progress { accent-color: var(--accent); }
  .update-progress .hint { margin: 0.4rem 0 0; }
  .update-dialog { width: min(36rem, calc(100vw - 2rem)); max-height: calc(100vh - 4rem); overflow-y: auto; padding: 1.5rem 1.75rem; }
  .update-dialog .notes { max-height: 50vh; }
  .update-head { display: flex; align-items: flex-start; gap: 0.9rem; padding-bottom: 1rem; border-bottom: 1px solid var(--line); }
  .update-head > div { flex: 1; min-width: 0; }
  .update-head h3 { margin: 0.1rem 0 0.15rem; font-size: 1.2rem; }
  .update-head .hint { margin: 0; }
  .update-badge {
    flex: none;
    display: grid;
    place-items: center;
    width: 2.6rem;
    height: 2.6rem;
    border: 1px solid var(--accent);
    border-radius: 50%;
    background: rgb(34 211 238 / 0.14);
    color: var(--accent);
  }
  .update-head .close { flex: none; display: grid; place-items: center; margin: -0.25rem -0.5rem 0 0; padding: 0.35rem; border: 0; border-radius: 50%; background: none; color: var(--dim); cursor: pointer; }
  .update-head .close:hover { background: var(--line); color: var(--chalk); }
  .update-dialog .notes-link { margin-bottom: 0; }
  .update-actions { margin-top: 1.25rem; padding-top: 1rem; border-top: 1px solid var(--line); flex-wrap: wrap; }
  .update-actions .spacer { flex: 1; }
  /* In the top navigation, so a new version is hard to miss; a click opens the notes. */
  .update-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.35rem 0.8rem;
    border: 1px solid var(--accent);
    border-radius: 999px;
    background: rgb(34 211 238 / 0.14);
    color: var(--accent);
    font: inherit;
    font-size: 0.85rem;
    font-weight: 700;
    white-space: nowrap;
    cursor: pointer;
    animation: update-glow 2.4s ease-in-out infinite;
  }
  .update-btn:hover { background: var(--accent); color: var(--bg); }
  /* Developer mode: a plain checkbox; the label makes a preview install unmistakable. */
  .check-row { display: flex; flex-direction: row; align-items: center; gap: 0.6rem; cursor: pointer; }
  .check-row input { width: 1.1rem; height: 1.1rem; margin: 0; accent-color: var(--accent); cursor: pointer; }
  .preview-pill {
    display: inline-block;
    margin-left: 0.5rem;
    padding: 0.1rem 0.55rem;
    border: 1px solid #f5b942;
    border-radius: 999px;
    color: #f5b942;
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    vertical-align: middle;
  }
  @keyframes update-glow { 50% { box-shadow: 0 0 0.9rem rgb(34 211 238 / 0.55); } }
  progress { width: 100%; }
  .banner { flex: none; margin: 0; padding: 0.6rem 1.5rem; background: #5a2420; color: #ffd9d3; }
  .closed-badly { display: flex; align-items: center; gap: 0.5rem 1.25rem; flex-wrap: wrap; padding-right: 0.75rem; }
  .closed-badly span { flex: 1 1 18rem; }
  .closed-badly .dismiss { display: grid; place-items: center; padding: 0.3rem; border: 0; border-radius: 50%; background: none; color: inherit; cursor: pointer; }
  .closed-badly .dismiss:hover { background: rgb(255 255 255 / 0.12); }
  code { font-family: ui-monospace, Consolas, monospace; background: var(--panel); padding: 0.1rem 0.35rem; border-radius: 4px; }
  .narrow { max-width: 34rem; }
  .about-hero { display: flex; gap: 1.5rem; align-items: flex-start; flex-wrap: wrap; }
  .about-hero p { margin: 0 0 0.5rem; max-width: 60ch; line-height: 1.5; }
  .about-hero .hint { margin: 0; }
  .links { margin: 0; padding: 0; list-style: none; }
  .links li { display: flex; flex-direction: column; gap: 0.1rem; padding: 0.5rem 0; border-bottom: 1px solid var(--line); }
  .links li:last-child { border-bottom: 0; padding-bottom: 0; }
  .settings-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1.25rem; }
  .group { padding: 1.25rem 1.5rem; border: 1px solid var(--line); border-radius: 12px; background: var(--panel); }
  .group.wide { grid-column: 1 / -1; }
  /* Across the whole width, below everything else in Settings. */
  .group.danger-zone { grid-column: 1 / -1; border-color: rgb(255 107 91 / 0.6); background: rgb(179 38 30 / 0.14); }
  .group.danger-zone h3 { color: #ff9b8f; }
  .group h3 { margin: 0 0 0.75rem; }
  .group > :last-child, .group label:last-child { margin-bottom: 0; }
  .group-head { display: flex; justify-content: space-between; align-items: baseline; gap: 1rem; }
  .group-head h3 { margin-bottom: 0.35rem; }
  .group .lede { margin-bottom: 1.25rem; }
  .detection { display: flex; align-items: center; gap: 0.75rem; margin: -0.5rem 0 1.25rem; color: var(--dim); }
  .detection[data-board="stopped"] { color: var(--dart); }
  .conn-split { display: grid; grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); gap: 1.5rem; }
  .fields { display: grid; grid-template-columns: minmax(0, 1fr) 7rem; gap: 0 0.75rem; }
  .fields label { margin-bottom: 0.5rem; }
  .group .row { margin-top: 0.75rem; }
  .url-line { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: 0.25rem 1rem; }
  .url-line .url { margin: 0; }
  button.link { padding: 0; border: 0; background: none; color: var(--accent); font: inherit; font-size: 0.85rem; cursor: pointer; }
  button.link:hover { text-decoration: underline; }
  .recent-box { padding: 1rem 1.25rem; border: 1px dashed var(--line); border-radius: 8px; align-self: start; }
  .recent-box h4 { margin: 0 0 0.5rem; }
  .recent-box p { margin: 0; }
  input.short { width: 7rem; }
  @media (max-width: 760px) {
    .conn-split, .settings-grid { grid-template-columns: 1fr; }
  }
  .history-filters { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 0.75rem 1rem; margin-bottom: 1.5rem; }
  .history-filters label { margin: 0; }
  .history-filters .toggle { margin-left: auto; }
  .sessions { padding: 0; margin: 0; list-style: none; border-top: 1px solid var(--line); }
  /* Not a table, but the DPI label, the details button and the bin each keep their own column. */
  .session {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 6.5rem auto auto;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 0;
    border-bottom: 1px solid var(--line);
  }
  .session-title .plan-meta { display: block; font-size: 0.9rem; text-align: left; margin-top: 0.15rem; }
  .session-title .badge { margin-left: 0.5rem; }
  .session-dpi .badge, .details .plan-meta .badge { margin-left: 0; }
  .details { width: min(36rem, calc(100vw - 2rem)); }
  .details .plan { max-height: 60vh; overflow-y: auto; }
  .details .lede .badge { margin-left: 0.5rem; }
  button.primary.destructive { background: #ff9b8f; border-color: #ff9b8f; color: #1b0c0a; }
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
  .badge.dpi-badge { color: var(--accent); border-color: var(--accent); }
  /* Too short to count towards the stats. */
  .badge.dpi-badge.skipped { color: var(--dim); border-color: var(--line); text-decoration: line-through; cursor: help; }

  .dpi { padding: 1.25rem 1.5rem; border: 1px solid var(--line); border-radius: 12px; background: var(--panel); }
  .dpi h3 { margin: 0 0 0.75rem; }
  .dpi h4 { margin: 1.5rem 0 0.75rem; }
  /* Wide enough: the games on the left, the picked one with its chart beside them. */
  .game-split { display: grid; gap: 0 2rem; }
  .game-detail { min-width: 0; }
  @media (min-width: 1000px) {
    .game-split { grid-template-columns: minmax(20rem, 2fr) 3fr; align-items: start; }
    .game-split .dpi-games { margin-top: 0; }
    .game-detail h4 { margin-top: 0; }
  }
  .stats-head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; margin-bottom: 1.25rem; }
  .stats-head h2 { margin: 0; }
  .stats-controls { display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; }
  .range { display: flex; align-items: center; gap: 0.5rem; color: var(--dim); }
  .range input { width: 4.5rem; }
  .chart-head { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 0.75rem; }
  .chart-title { font-weight: 700; }
  .chart-controls { display: flex; align-items: center; gap: 0.75rem; }
  .dpi-overall { display: flex; align-items: center; gap: 1.5rem; flex-wrap: wrap; margin-bottom: 1.25rem; }
  .dpi-score { display: flex; align-items: baseline; gap: 0.5rem; }
  .dpi-score .big { color: var(--accent); }
  /* The arrow carries the direction and its colour; the words stay in the text colour, encouraging either way. */
  .trend { display: flex; align-items: center; gap: 0.4rem; margin: 0; font-weight: 600; color: var(--chalk); }
  .trend[data-dir="none"] { color: var(--dim); font-weight: 400; }
  .motivation { flex: 1 1 18rem; display: flex; flex-direction: column; gap: 0.4rem; padding-left: 1.25rem; border-left: 3px solid var(--accent); }
  .motto { margin: 0; font-size: 1.65rem; font-weight: 700; line-height: 1.25; color: var(--chalk); text-wrap: balance; }
  /* Not enough data yet: a plain note, not a headline. */
  .motto.quiet { font-size: 1.05rem; font-weight: 400; color: var(--dim); }
  .motivation .trend { font-size: 1.05rem; }
  .trend-value { font-variant-numeric: tabular-nums; }
  .arrow { flex: none; }
  .arrow[data-dir="up"] { color: var(--ok); }
  .arrow[data-dir="down"] { color: #ff6b5b; }
  .arrow[data-dir="steady"] { color: var(--dim); }
  .trend.small { justify-content: flex-end; min-width: 5rem; cursor: help; font-variant-numeric: tabular-nums; }
  .trend.small .arrow { width: 15px; height: 15px; }
  .stats-head h2 { display: flex; align-items: center; gap: 0.4rem; }
  .stats-head .info { display: grid; place-items: center; padding: 0.2rem; border: 0; border-radius: 50%; background: none; color: var(--dim); cursor: pointer; }
  .stats-head .info:hover { color: var(--accent); }
  .help { width: min(34rem, calc(100vw - 2rem)); max-height: calc(100vh - 4rem); overflow-y: auto; line-height: 1.5; }
  .help h4 { margin: 1.1rem 0 0.25rem; }
  .help p { margin: 0.25rem 0; color: var(--dim); }
  .help .foot { margin-top: 1.25rem; }
  .dpi-games { list-style: none; margin: 1rem 0 0.75rem; padding: 0; border-top: 1px solid var(--line); }
  .dpi-games li { border-bottom: 1px solid var(--line); }
  .dpi-game { display: flex; align-items: center; gap: 0.75rem; width: 100%; padding: 0.55rem 0.75rem; border: none; border-radius: 6px; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; }
  .dpi-game:hover { background: rgb(34 211 238 / 0.06); }
  .dpi-game[aria-pressed="true"] { background: rgb(34 211 238 / 0.12); box-shadow: inset 3px 0 0 var(--accent); }
  .game-label { flex: 1; display: flex; flex-direction: column; gap: 0.1rem; min-width: 0; }
  .game-label .plan-meta { text-align: left; font-size: 0.85rem; }
  .dpi-value { font-weight: 700; font-variant-numeric: tabular-nums; }

  .views { display: flex; flex-direction: column; gap: 1.25rem; align-items: center; padding-inline: 3.6rem; }
  .board, .darts { max-width: 400px; width: 100%; }
  .board { position: relative; }
  .darts { position: relative; display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem; }
  /* Beside the boxes, so they stay lined up with the board. */
  .darts .next-turn {
    position: absolute;
    top: 50%;
    left: calc(100% + 0.75rem);
    transform: translateY(-50%);
    width: 2.6rem;
    height: 2.6rem;
    border: 1.5px solid var(--accent);
    background: var(--panel);
    color: var(--accent);
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
  .darts .next-turn:hover { color: var(--bg); background: var(--accent); }
  /* A fixed height, the same for a box with or without a dart, a button or not, and in any font:
     a box that grew by a pixel would push the board (and its backdrop) down. */
  .dart-box {
    box-sizing: border-box;
    display: grid;
    place-items: center;
    height: 3.1rem;
    margin: 0;
    padding: 0;
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
  button.dart-box { appearance: none; font: inherit; font-size: 1.5rem; font-weight: 700; line-height: 1; cursor: pointer; }
  button.dart-box:hover { background: rgb(242 193 78 / 0.08); }
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
  .dart-box.closed { color: #ff6b5b; opacity: 0.55; border-style: dashed; font-size: 1.2rem; }
  .dart-box.editing { opacity: 1; color: var(--accent); border-color: var(--accent); box-shadow: 0 0 0 3px rgb(34 211 238 / 0.25); }
  /* Always takes its height, so the board doesn't jump when a correction starts. */
  .pick-hint { max-width: 400px; width: 100%; height: 2rem; margin: -0.5rem 0; display: flex; align-items: center; justify-content: center; gap: 0.6rem; overflow: hidden; color: var(--accent); font-size: 0.9rem; white-space: nowrap; visibility: hidden; }
  .pick-hint.show { visibility: visible; }
  .pick-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .quick { display: flex; gap: 0.35rem; flex: none; }
  .quick .chip { appearance: none; min-width: 2.6rem; padding: 0.2rem 0.5rem; border: 1px solid var(--accent); border-radius: 999px; background: rgb(34 211 238 / 0.1); color: var(--chalk); font: inherit; font-weight: 700; line-height: 1.3; cursor: pointer; }
  .quick .chip:hover, .quick .chip:focus-visible { background: rgb(34 211 238 / 0.25); }

  /* ------------------------------------------------------------------------------------------------
     Nothing scrolls inside a routine (countdown, game, break): main.fit is exactly as high as the window
     allows, both columns are as high as main, and the board and the left panel scale with their own size
     (container query units) instead of fixed rem sizes. See docs/responsive-layout-plan.md. */
  header.compact { padding: 0.4rem 1.5rem; gap: 1.5rem; }
  footer.compact { padding: 0.35rem 1.5rem; }
  footer.compact .meta { display: none; }

  main.fit {
    display: flex;
    flex-direction: column;
    overflow: hidden;
    padding: 0.75rem max(1rem, calc((100% - 1600px) / 2 + 1rem));
  }
  main.fit > section { flex: 1; min-height: 0; }

  main.fit .stage {
    height: 100%;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr);
    gap: 1.5rem;
    align-items: stretch;
  }
  .lost { inset: -0.5rem; }
  .lost-card { max-height: calc(100% - 2rem); overflow: auto; }

  /* The board takes what's left of its column: the dart boxes above it keep their fixed height. */
  main.fit .views {
    /* The padding (3.6rem a side) leaves room beside the dart boxes for the phase icon and the next-turn button. */
    --bs: min(100cqw, calc(100cqh - 6.4rem), 800px);
    container-type: size;
    min-height: 0;
    justify-content: center;
    gap: 0.5rem;
  }
  main.fit .board, main.fit .darts, main.fit .pick-hint { width: var(--bs); max-width: none; }
  main.fit .pick-hint { height: 2rem; margin: 0; }

  /* The left panel: sizes follow its own height, with floors so text stays readable. */
  main.fit .stage .panel { container-type: size; min-height: 0; justify-content: center; }
  main.fit .panel .progress { margin: 0 0 0.2rem; font-size: clamp(0.8rem, 2.4cqh, 0.95rem); }
  main.fit .panel .clock { font-size: clamp(2.2rem, 11cqh, 5rem); }
  main.fit .panel .note { margin: 0.25rem 0 clamp(0.25rem, 1.8cqh, 1.25rem); font-size: clamp(0.8rem, 2.4cqh, 1rem); }
  main.fit .panel .focus {
    margin: clamp(0.15rem, 1cqh, 0.5rem) 0 clamp(0.4rem, 2cqh, 1.25rem);
    padding: clamp(0.35rem, 2cqh, 1rem) clamp(1rem, 6cqw, 2.5rem) clamp(0.45rem, 2.4cqh, 1.25rem);
  }
  main.fit .panel .focus .big { font-size: clamp(2.6rem, 17cqh, 6.5rem); }
  main.fit .panel .focus .big.long { font-size: clamp(1.8rem, 9cqh, 3.6rem); line-height: 1.15; }
  main.fit .panel .focus :global(.route) { margin-top: 0.15rem; font-size: clamp(0.75rem, 2.2cqh, 1rem); }
  main.fit .panel :global(.meter) { margin-bottom: clamp(0.25rem, 1.6cqh, 1.25rem); gap: clamp(0.15rem, 1cqh, 0.45rem); }
  main.fit .panel :global(.meter .dart) { height: clamp(24px, 6.5cqh, 50px); width: auto; }
  main.fit .panel .hero { margin-bottom: clamp(0.25rem, 1.6cqh, 1.25rem); }
  main.fit .panel .hero .big { font-size: clamp(1.8rem, 8cqh, 3.2rem); }
  main.fit .panel .stats div { padding: clamp(0.15rem, 0.9cqh, 0.55rem) 0; }

  /* What gives way when the panel is still too short, in this order:
     1. the stats become one wrapped line of numbers, 2. the dart meter loses its label,
     3. the quiet "Keep throwing" note goes (paused / waiting stay). */
  @container (max-height: 470px) {
    .stage .stats { display: flex; flex-wrap: wrap; justify-content: center; gap: 0.1rem 1rem; border-top: 0; }
    .stage .stats div { border: 0; padding: 0; gap: 0.35rem; }
    .stage .stats dt::after { content: ":"; }
  }
  @container (max-height: 400px) {
    main.fit .panel :global(.meter .cap) { display: none; }
  }
  @container (max-height: 340px) {
    main.fit .panel .note.quiet { display: none; }
  }

  /* Countdown: the number grows with the window. */
  main.fit .countdown { width: 100%; height: 100%; justify-content: center; padding-top: 0; container-type: size; }
  main.fit .count { font-size: clamp(5rem, 40cqh, 14rem); }

  /* Break: the cards sit in one row, the clock and "Next game" stay visible. */
  main.fit .break { width: 100%; height: 100%; max-width: 70rem; justify-content: center; container-type: size; }
  main.fit .break .clock { font-size: clamp(2.2rem, 12cqh, 4rem); }
  main.fit .cards { grid-template-columns: repeat(2, minmax(0, 1fr)); min-height: 0; margin-top: 0.25rem; }
  main.fit .card { min-height: 0; overflow: hidden; padding: 0.75rem 1rem 0.25rem; }
  main.fit .card h2 { font-size: clamp(1.1rem, 3.4cqh, 1.6rem); }
  main.fit .card .lede, main.fit .card .game-goal { font-size: 0.9rem; margin-bottom: 0.4rem; }
  /* At most three lines of the goal; the full text is in the add-game dialog and before the game. */
  main.fit .card .lede, main.fit .card .game-goal {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    overflow: hidden;
  }
</style>
