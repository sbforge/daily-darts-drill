import type { Dart, DartEvent } from "./autodarts";
import type { GameDef, Settings } from "./games";

/** One run of one game. Collects darts into turns and exposes live results. */
export class Session {
  game: GameDef;
  settings: Settings;
  turns = $state<Dart[][]>([]);
  current = $state<Dart[]>([]);
  finished = $state(false);

  constructor(game: GameDef, settings: Settings) {
    this.game = game;
    this.settings = settings;
  }

  handle(e: DartEvent) {
    if (this.finished) return;
    switch (e.kind) {
      case "dart":
        this.current = [...this.current, e.dart];
        break;
      case "correction":
        this.current = e.darts;
        break;
      case "turnEnded":
        // Use our own copy: it already includes corrections, and ignores darts
        // that were on the board before this session began.
        if (this.current.length) this.turns = [...this.turns, this.current];
        this.current = [];
        break;
    }
  }

  get allTurns(): Dart[][] {
    return this.current.length ? [...this.turns, this.current] : this.turns;
  }

  get result() {
    return this.game.compute(this.allTurns, this.settings, { open: this.current.length > 0 });
  }

  finish() {
    this.finished = true;
  }
}
