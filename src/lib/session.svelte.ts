import { sameDart, type Dart, type DartEvent } from "./autodarts";
import type { GameDef, Settings } from "./games";

/** One run of one game. Collects darts into turns and exposes live results. */
export class Session {
  game: GameDef;
  settings: Settings;
  turns = $state<Dart[][]>([]);
  current = $state<Dart[]>([]);
  finished = $state(false);
  /** The dart being corrected: its turn (an index into allTurns) and its place in that turn. */
  editing = $state<{ turn: number; dart: number } | null>(null);
  // Where each dart of the current turn came from: its place in Autodarts' turn, or null when set by hand.
  // Autodarts doesn't know about darts set by hand, so its updates are matched by these places.
  private source: (number | null)[] = [];
  // The darts Autodarts had detected where the player corrected them, by their place in Autodarts' turn.
  private detected = new Map<number, Dart>();

  constructor(game: GameDef, settings: Settings) {
    this.game = game;
    this.settings = settings;
  }

  handle(e: DartEvent) {
    if (this.finished) return;
    switch (e.kind) {
      case "dart":
        this.current = [...this.current, e.dart];
        this.source = [...this.source, e.indexInTurn];
        break;
      case "correction": {
        // Autodarts sends the whole turn again. A fix stays as long as Autodarts still has
        // the dart we replaced; if it changed that dart itself, its own correction wins.
        // Darts set by hand keep their place; darts Autodarts no longer has are dropped.
        const darts: Dart[] = [];
        const source: (number | null)[] = [];
        this.current.forEach((d, i) => {
          const at = this.source[i];
          if (at === null) {
            darts.push(d);
          } else if (at < e.darts.length) {
            const was = this.detected.get(at);
            if (was && sameDart(was, e.darts[at])) darts.push(d);
            else {
              this.detected.delete(at);
              darts.push(e.darts[at]);
            }
          } else {
            this.detected.delete(at);
            return;
          }
          source.push(at);
        });
        e.darts.forEach((d, at) => {
          if (!source.includes(at)) {
            darts.push(d);
            source.push(at);
          }
        });
        this.current = darts;
        this.source = source;
        break;
      }
      case "turnEnded":
        // Use our own copy: it already includes corrections, and ignores darts
        // that were on the board before this session began.
        this.closeTurn();
        break;
    }
  }

  private closeTurn() {
    if (this.current.length) this.turns = [...this.turns, this.current];
    this.current = [];
    this.source = [];
    this.detected.clear();
  }

  get allTurns(): Dart[][] {
    return this.current.length ? [...this.turns, this.current] : this.turns;
  }

  /**
   * The turn the dart boxes show: the darts on the board, or after the takeout the last
   * turn, until the next dart lands. Both stay correctable while they are shown.
   */
  get shownTurn(): number {
    return this.current.length ? this.turns.length : this.turns.length - 1;
  }

  get shown(): Dart[] {
    return this.allTurns[this.shownTurn] ?? [];
  }

  /** The dart being corrected, if it is still on screen. Once the next turn starts, the edit is dropped. */
  get edit(): number | null {
    const e = this.editing;
    return e && e.turn === this.shownTurn && e.dart < this.shown.length ? e.dart : null;
  }

  /** Starts correcting a dart of the shown turn, or stops when it is picked again. */
  toggleEdit(dart: number) {
    if (dart >= this.shown.length) return;
    this.editing = this.edit === dart ? null : { turn: this.shownTurn, dart };
  }

  /** Replaces the dart being corrected. The game replays all turns, so its result follows. */
  correct(dart: Dart) {
    const i = this.edit;
    if (i === null || this.finished) return;
    if (this.current.length) {
      const at = this.source[i];
      if (at !== null && !this.detected.has(at)) this.detected.set(at, this.current[i]);
      this.current = this.current.map((d, j) => (j === i ? dart : d));
    } else {
      const last = this.turns.length - 1;
      this.turns = this.turns.map((turn, k) => (k === last ? turn.map((d, j) => (j === i ? dart : d)) : turn));
    }
    this.editing = null;
  }

  /**
   * A dart can be set by hand as the next one: it fills up the turn on the board, or after the
   * takeout starts the next turn. A full turn set by hand makes way for the next; a full turn
   * from Autodarts waits for its takeout.
   */
  get canAdd(): boolean {
    return !this.finished && (this.current.length < 3 || this.source.every((at) => at === null));
  }

  /** Adds a dart set by hand, for one Autodarts did not detect or when playing without it. */
  add(dart: Dart) {
    if (!this.canAdd) return;
    if (this.current.length >= 3) this.closeTurn();
    this.current = [...this.current, dart];
    this.source = [...this.source, null];
    this.editing = null;
  }

  get result() {
    return this.game.compute(this.allTurns, this.settings, { open: this.current.length > 0 });
  }

  finish() {
    this.finished = true;
    this.editing = null;
  }
}
