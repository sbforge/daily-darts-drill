// Turns raw Autodarts websocket messages into clean dart events.
// Only "state" messages matter; "vantage" (camera debug) and "stats" are ignored.
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

function sameDart(a: Dart, b: Dart): boolean {
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

export interface ClientHandlers {
  onState(state: ConnState): void;
  onEvent(event: DartEvent): void;
}

export function autodartsUrl(host: string, port: number): string {
  return `ws://${host}:${port}/api/events/system`;
}

export class AutodartsClient {
  private handlers: ClientHandlers;
  private ws: WebSocket | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private attempt = 0;
  private active = false;
  private host = "";
  private port = 0;
  private norm = new AutodartsNormalizer();

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
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null;
      ws.close();
    }
    this.handlers.onState("disconnected");
  }

  private open() {
    this.handlers.onState("connecting");
    this.norm.reset();

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
    };
    ws.onmessage = (ev) => {
      let msg: unknown;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      for (const e of this.norm.handle(msg)) this.handlers.onEvent(e);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.scheduleRetry();
    };
  }

  private scheduleRetry() {
    if (!this.active) return;
    this.handlers.onState("connecting");
    const delay = Math.min(10_000, 1000 * 2 ** this.attempt);
    this.attempt++;
    this.timer = setTimeout(() => this.open(), delay);
  }
}
