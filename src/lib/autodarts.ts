// Turns raw Autodarts websocket messages into clean dart events and the detection status.
// "state" carries the darts and the status, "board" the blockers (e.g. no camera);
// "vantage" (camera debug), "stats", "cams" and "calibration" are ignored.
import { t } from "./i18n/index.svelte";

export type DartKind = "single" | "double" | "triple" | "outerBull" | "bull" | "miss";

export interface Dart {
  kind: DartKind;
  number: number | null; // 1-20 for segment hits, null for bulls and misses
  zone: "inner" | "outer" | null; // which part of a single segment was hit
  score: number; // 0-60
  x: number; // board center is (0,0), +y is up
  y: number;
  radius: number; // 1.0 = outer edge of the double ring
  bouncer: boolean;
  failed: boolean;
  method: string;
}

export type DartEvent =
  | { kind: "dart"; dart: Dart; indexInTurn: number }
  | { kind: "correction"; darts: Dart[] }
  | { kind: "turnEnded"; darts: Dart[] };

export function toDart(t: any): Dart {
  let kind: DartKind;
  let number: number | null = t.segmentNumber;
  let score: number;

  if (t.multiplier === 0 || t.bed === "Outside") {
    kind = "miss";
    number = null;
    score = 0;
  } else if (t.segmentName === "Bull") {
    kind = "bull";
    number = null;
    score = 50;
  } else if (t.segmentName === "25") {
    kind = "outerBull";
    number = null;
    score = 25;
  } else {
    kind = t.multiplier === 3 ? "triple" : t.multiplier === 2 ? "double" : "single";
    score = t.segmentNumber * t.multiplier;
  }

  return {
    kind,
    number,
    zone: t.bed === "SingleInner" ? "inner" : t.bed === "SingleOuter" ? "outer" : null,
    score,
    x: t.coordsX,
    y: t.coordsY,
    radius: Math.hypot(t.coordsX, t.coordsY),
    bouncer: !!t.bouncer,
    failed: !!t.failed,
    method: t.method,
  };
}

export function dartLabel(d: Dart): string {
  switch (d.kind) {
    case "single":
      return `S${d.number}`;
    case "double":
      return `D${d.number}`;
    case "triple":
      return `T${d.number}`;
    case "outerBull":
      return "25";
    case "bull":
      return t("dart.bull");
    default:
      return t("dart.miss");
  }
}

export function sameDart(a: Dart, b: Dart): boolean {
  return a.x === b.x && a.y === b.y && a.score === b.score;
}

/**
 * The `throws` array in a state message is cumulative for the current turn, and
 * the `event` field is unreliable (the first dart can arrive as "takeoutFinished").
 * So we diff the array against what we have already seen.
 */
export class AutodartsNormalizer {
  private seen: Dart[] = [];
  private primed = false;

  reset() {
    this.seen = [];
    this.primed = false;
  }

  handle(msg: any): DartEvent[] {
    if (msg?.type !== "state") return [];
    const darts: Dart[] = (msg.data?.throws ?? []).map(toDart);

    // First state after connecting: remember what is on the board, emit nothing.
    if (!this.primed) {
      this.primed = true;
      this.seen = darts;
      return [];
    }

    const out: DartEvent[] = [];

    if (darts.length === 0) {
      if (this.seen.length > 0) out.push({ kind: "turnEnded", darts: this.seen });
      this.seen = [];
      return out;
    }

    const prefixChanged =
      darts.length < this.seen.length || this.seen.some((s, i) => !sameDart(s, darts[i]));

    if (prefixChanged) {
      out.push({ kind: "correction", darts });
    } else {
      for (let i = this.seen.length; i < darts.length; i++) {
        out.push({ kind: "dart", dart: darts[i], indexInTurn: i });
      }
    }
    this.seen = darts;
    return out;
  }
}

export type ConnState = "disconnected" | "connecting" | "connected";

/**
 * What the Autodarts client itself is doing. A connected websocket only means the client
 * is up; darts are detected only while it is "running" (throw, takeout, takeout in progress).
 */
export type BoardStatus =
  | "unknown"
  | "starting"
  | "running"
  | "calibrating"
  | "stopping"
  | "stopped"
  | "noCamera"
  | "blocked";

/**
 * Where a running detection is in the turn: waiting for darts, waiting for the takeout,
 * or seeing the hand pull them. null while the detection doesn't run or the status is new to us.
 */
export type ThrowPhase = "throw" | "takeout" | "takeoutInProgress" | null;

export interface ClientHandlers {
  onState(state: ConnState): void;
  onBoard(status: BoardStatus): void;
  onPhase(phase: ThrowPhase): void;
  onEvent(event: DartEvent): void;
}

export function autodartsUrl(host: string, port: number): string {
  return `ws://${host}:${port}/api/events/system`;
}

/** Folds the status of a "state" message and the blocker of a "board" message into one. */
export function boardStatus(state: any, blocker: string, calibrating: boolean): BoardStatus {
  const status = String(state?.status ?? "").toLowerCase();
  if (status === "starting") return "starting";
  if (status === "stopping") return "stopping";
  if (calibrating || status.startsWith("calibrat")) return "calibrating";
  if (!state?.running) return "stopped";
  if (blocker === "noCamera") return "noCamera";
  if (blocker && blocker !== "none") return "blocked";
  return "running";
}

/**
 * `state.status` while running: "throw" until the third dart, then "takeout", and
 * "takeoutInProgress" while the hand pulls the darts (also after a manual reset).
 */
export function throwPhase(state: any): ThrowPhase {
  if (!state?.running) return null;
  const status = state.status;
  return status === "throw" || status === "takeout" || status === "takeoutInProgress" ? status : null;
}

const WATCHDOG_INTERVAL_MS = 3000;
const WATCHDOG_TIMEOUT_MS = 2500;

export class AutodartsClient {
  private handlers: ClientHandlers;
  private ws: WebSocket | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private watchdog: ReturnType<typeof setInterval> | undefined;
  private attempt = 0;
  private active = false;
  private host = "";
  private port = 0;
  private norm = new AutodartsNormalizer();
  private lastState: any = null;
  private blocker = "none";
  private calibrating = false;
  private status: BoardStatus = "unknown";
  private phase: ThrowPhase = null;

  constructor(handlers: ClientHandlers) {
    this.handlers = handlers;
  }

  connect(host: string, port: number) {
    this.disconnect();
    this.active = true;
    this.host = host;
    this.port = port;
    this.open();
  }

  disconnect() {
    this.active = false;
    clearTimeout(this.timer);
    clearInterval(this.watchdog);
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null;
      ws.close();
    }
    this.handlers.onState("disconnected");
    this.setStatus("unknown");
    this.setPhase(null);
  }

  private open() {
    this.handlers.onState("connecting");
    this.norm.reset();
    this.lastState = null;
    this.blocker = "none";
    this.calibrating = false;
    this.setStatus("unknown");
    this.setPhase(null);

    let ws: WebSocket;
    try {
      ws = new WebSocket(autodartsUrl(this.host, this.port));
    } catch {
      this.scheduleRetry();
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      this.attempt = 0;
      this.handlers.onState("connected");
      this.fetchStatus(ws);
      this.watch(ws);
    };
    ws.onmessage = (ev) => {
      let msg: any;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (msg?.type === "state") this.lastState = msg.data;
      if (msg?.type === "board") this.readBoard(msg.data?.status);
      if (msg?.type === "state" || msg?.type === "board") this.updateStatus();
      for (const e of this.norm.handle(msg)) this.handlers.onEvent(e);
    };
    ws.onclose = () => this.lost(ws);
  }

  private lost(ws: WebSocket) {
    if (this.ws !== ws) return;
    clearInterval(this.watchdog);
    this.ws = null;
    ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null;
    ws.close();
    this.setStatus("unknown");
    this.setPhase(null);
    this.scheduleRetry();
  }

  /**
   * When the network drops or the Autodarts PC goes off, the websocket isn't closed for minutes
   * and nothing arrives while the board is idle. So the client is asked over HTTP every few
   * seconds; when it doesn't answer twice in a row, the connection counts as lost.
   * Any answer, even an error status, means it is still there.
   */
  private watch(ws: WebSocket) {
    clearInterval(this.watchdog);
    let misses = 0;
    this.watchdog = setInterval(async () => {
      try {
        await fetch(this.httpUrl("/api/state"), { signal: AbortSignal.timeout(WATCHDOG_TIMEOUT_MS) });
        misses = 0;
      } catch {
        if (++misses >= 2) this.lost(ws);
      }
    }, WATCHDOG_INTERVAL_MS);
  }

  /** Start / stop the detection, reset the turn (takeout by hand), auto-calibrate the cameras. */
  start() {
    return this.command("PUT", "/api/start");
  }

  stop() {
    return this.command("PUT", "/api/stop");
  }

  reset() {
    return this.command("POST", "/api/reset");
  }

  calibrate() {
    return this.command("POST", "/api/config/calibration/auto");
  }

  private async command(method: string, path: string) {
    const res = await fetch(this.httpUrl(path), { method });
    if (!res.ok) throw new Error(`${method} ${path}: ${res.status}`);
  }

  private httpUrl(path: string) {
    return `http://${this.host}:${this.port}${path}`;
  }

  /**
   * The websocket only sends a "state" when the status changes, so right after connecting to a
   * client that is idle nothing arrives. The REST API fills that gap once per connection.
   */
  private async fetchStatus(ws: WebSocket) {
    try {
      const [state, system] = await Promise.all(
        ["/api/state", "/api/system"].map((p) => fetch(this.httpUrl(p)).then((r) => r.json())),
      );
      // A message on the socket in the meantime is newer than these answers.
      if (this.ws !== ws || this.lastState) return;
      this.lastState = state;
      this.readBoard(system?.status);
      this.updateStatus();
    } catch {
      // Without the REST API the status stays unknown until the client sends a state.
    }
  }

  private readBoard(status: any) {
    if (!status) return;
    this.blocker = status.blocker ?? "none";
    this.calibrating = (status.calibratingCams ?? 0) > 0;
  }

  private updateStatus() {
    const status = this.lastState ? boardStatus(this.lastState, this.blocker, this.calibrating) : "unknown";
    this.setStatus(status);
    this.setPhase(status === "running" ? throwPhase(this.lastState) : null);
  }

  private setPhase(phase: ThrowPhase) {
    if (phase === this.phase) return;
    this.phase = phase;
    this.handlers.onPhase(phase);
  }

  private setStatus(status: BoardStatus) {
    if (status === this.status) return;
    this.status = status;
    this.handlers.onBoard(status);
  }

  private scheduleRetry() {
    if (!this.active) return;
    this.handlers.onState("connecting");
    const delay = Math.min(10_000, 1000 * 2 ** this.attempt);
    this.attempt++;
    this.timer = setTimeout(() => this.open(), delay);
  }
}
