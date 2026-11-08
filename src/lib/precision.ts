// Precision: how far darts land from the centre of the field they were thrown at.
//
// Only games whose rules fix each dart's target count (GameDef.fixedTargets): Around the Clock, the doubles games,
// Bob's 27, Bull-X and the doubles part of the JDC Challenge. The target of every stored dart is found by replaying
// the game: the game is computed with the darts before it, and its `targets` then name the field. Nothing new is
// stored, so every game played so far counts, and a game whose rules change is measured the new way at once.
import type { Dart } from "./autodarts";
import type { Bed, BoardField, GameDef, Settings } from "./games";

/** Board radii relative to the outer edge of the double ring (as Autodarts reports them, and as Board.svelte draws). */
export const R = { dbl1: 1, dbl0: 0.953, tri1: 0.629, tri0: 0.582, ob: 0.0935, b: 0.0374 };
/** The outer edge of the double ring is 170 mm from the centre on a regulation board. */
export const MM = 170;
/** Segment numbers clockwise from the top. */
export const ORDER = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];

/** The radii of a bed, inner to outer. */
export function bedRadii(bed: Bed): [number, number] {
  return {
    bull: [0, R.b],
    outerBull: [R.b, R.ob],
    innerSingle: [R.ob, R.tri0],
    triple: [R.tri0, R.tri1],
    outerSingle: [R.tri1, R.dbl0],
    double: [R.dbl0, R.dbl1],
  }[bed] as [number, number];
}

/** The angle of a segment's middle, in degrees clockwise from the top (0 for the bulls). */
export function segmentAngle(n: number | undefined): number {
  const i = ORDER.indexOf(n ?? 0);
  return i < 0 ? 0 : i * 18;
}

/** The centre of a field in board units, +y up. The bulls (also the 25 ring) centre on the middle of the board. */
export function fieldCenter(f: BoardField): { x: number; y: number } {
  if (f.bed === "bull" || f.bed === "outerBull") return { x: 0, y: 0 };
  const [r0, r1] = bedRadii(f.bed);
  const r = (r0 + r1) / 2;
  const a = (segmentAngle(f.number) * Math.PI) / 180;
  return { x: r * Math.sin(a), y: r * Math.cos(a) };
}

export function fieldKey(f: BoardField): string {
  return f.bed === "bull" || f.bed === "outerBull" ? f.bed : `${f.bed}:${f.number}`;
}

export function fieldFromKey(key: string): BoardField | null {
  const [bed, n] = key.split(":");
  if (bed === "bull" || bed === "outerBull") return { bed };
  const number = Number(n);
  if (!["innerSingle", "outerSingle", "triple", "double"].includes(bed) || !ORDER.includes(number)) return null;
  return { bed: bed as Bed, number };
}

/** Whether a dart landed in a field. */
export function inField(d: Dart, f: BoardField): boolean {
  switch (f.bed) {
    case "bull":
      return d.kind === "bull";
    case "outerBull":
      return d.kind === "outerBull";
    case "double":
    case "triple":
      return d.kind === f.bed && d.number === f.number;
    case "innerSingle":
      return d.kind === "single" && d.zone === "inner" && d.number === f.number;
    case "outerSingle":
      return d.kind === "single" && d.zone === "outer" && d.number === f.number;
  }
}

/** The aim of a dart: one field, and whether the dart counted as a hit (either bull, where the game takes both). */
export interface Aim {
  field: BoardField;
  hit: boolean;
}

/**
 * The fixed target of the next dart, from the game's `targets`: one field, or both bulls (whose centre is the same).
 * Several different fields (any bed of a number, a Shanghai) leave the choice to the player: no aim.
 */
function aimOf(targets: BoardField[] | undefined): BoardField[] | null {
  if (!targets?.length) return null;
  if (targets.length === 1) return targets;
  return targets.every((f) => f.bed === "bull" || f.bed === "outerBull") ? targets : null;
}

/**
 * The aim of every dart of a stored game (null where the rules leave it open), by replaying the game the way the
 * training screen did: before a turn's first dart the turns so far are closed, during a turn the turn is open.
 */
export function aimsOf(def: GameDef, turns: Dart[][], settings: Settings, repeat: boolean): (Aim | null)[][] {
  if (!def.fixedTargets) return turns.map((turn) => turn.map(() => null));
  return turns.map((turn, ti) =>
    turn.map((d, di) => {
      const before = di === 0 ? turns.slice(0, ti) : [...turns.slice(0, ti), turn.slice(0, di)];
      let fields: BoardField[] | null;
      try {
        fields = aimOf(def.compute(before, settings, { open: di > 0, repeat }).targets);
      } catch {
        return null; // a game that can't replay its old settings just doesn't count here
      }
      if (!fields) return null;
      const bulls = fields.length > 1;
      return { field: bulls ? { bed: "bull" } : fields[0], hit: fields.some((f) => inField(d, f)) };
    }),
  );
}

/** One dart measured against its aim. Offsets in mm, +x right and +y up as the player looks at the board. */
export interface AimedDart {
  key: string;
  field: BoardField;
  hit: boolean;
  dx: number;
  dy: number;
  /** Distance to the field's centre, mm. */
  dist: number;
  /** Where the dart landed, board units, +y up. */
  x: number;
  y: number;
  /** The game it was thrown in, and when that started. */
  gameResultId: string;
  startedAt: string;
}

/**
 * Only darts the cameras placed are measured. A dart set or corrected by hand (on the board in D³ or in Autodarts)
 * sits where the click was, not where the dart landed; a failed detection, a bouncer or a dart without a spot has no
 * real position either.
 */
export function measurable(d: Dart): boolean {
  if (d.failed || d.bouncer) return false;
  if (d.method.toLowerCase().includes("manual")) return false;
  if (!Number.isFinite(d.x) || !Number.isFinite(d.y)) return false;
  return !(d.x === 0 && d.y === 0 && d.kind !== "bull");
}

export interface StoredGame {
  id: string;
  gameId: string;
  startedAt: string;
  /** The time cap; a game with one starts over when completed (ComputeContext.repeat). */
  minutes: number;
  settings: Settings;
  turns: Dart[][];
}

export function measureGame(def: GameDef, g: StoredGame): AimedDart[] {
  const aims = aimsOf(def, g.turns, g.settings, g.minutes > 0);
  const out: AimedDart[] = [];
  g.turns.forEach((turn, ti) =>
    turn.forEach((d, di) => {
      const aim = aims[ti][di];
      if (!aim || !measurable(d)) return;
      const c = fieldCenter(aim.field);
      const dx = (d.x - c.x) * MM;
      const dy = (d.y - c.y) * MM;
      out.push({ key: fieldKey(aim.field), field: aim.field, hit: aim.hit, dx, dy, dist: Math.hypot(dx, dy), x: d.x, y: d.y, gameResultId: g.id, startedAt: g.startedAt });
    }),
  );
  return out;
}

/** What a set of darts says about the aim. */
export interface Spread {
  darts: number;
  /** The mean distance to the field's centre, mm. */
  meanDist: number;
  /** The mean offset, mm: where the darts land on average (the bias). */
  biasX: number;
  biasY: number;
  bias: number;
  /** How wide the darts scatter around their own mean, mm (root mean square). */
  scatter: number;
  /** Darts in the field, 0-100. */
  hitRate: number;
}

export function spreadOf(darts: AimedDart[]): Spread | null {
  const n = darts.length;
  if (!n) return null;
  let sx = 0, sy = 0, sd = 0, hits = 0;
  for (const d of darts) {
    sx += d.dx;
    sy += d.dy;
    sd += d.dist;
    if (d.hit) hits++;
  }
  const biasX = sx / n;
  const biasY = sy / n;
  const scatter = Math.sqrt(darts.reduce((s, d) => s + (d.dx - biasX) ** 2 + (d.dy - biasY) ** 2, 0) / n);
  return { darts: n, meanDist: sd / n, biasX, biasY, bias: Math.hypot(biasX, biasY), scatter, hitRate: (hits / n) * 100 };
}

/**
 * The mean offset toward the board's edge (+) or its centre (-), mm, over the darts aimed at a segment (bulls have no
 * such direction); null without any. On a double it tells a miss toward the single from one off the board.
 */
export function radialBias(darts: AimedDart[]): number | null {
  const seg = darts.filter((d) => d.field.number !== undefined);
  if (!seg.length) return null;
  const sum = seg.reduce((s, d) => {
    const a = (segmentAngle(d.field.number) * Math.PI) / 180;
    return s + d.dx * Math.sin(a) + d.dy * Math.cos(a);
  }, 0);
  return sum / seg.length;
}

/**
 * A dart this far from the centre of its field, mm, wasn't really thrown at it (a lapse, a dart thrown at the wrong
 * number): it is left out. 80 mm is far more than a missed field: a double is 8 mm deep, a segment some 45 mm wide.
 */
export const STRAY_MM = 80;
export const counts = (d: AimedDart) => d.dist <= STRAY_MM;

/** Below this many darts the view still shows the figures, but makes no suggestion: the data isn't enough yet. */
export const MIN_DARTS = 30;

/** Below this many darts their own scatter says little (one dart has none), so a typical one is assumed. */
const FEW_DARTS = 10;
const TYPICAL_SCATTER = 15;

/** How far the average point may be off by chance alone, mm (the standard error of the mean). */
export const uncertainty = (s: Spread) =>
  (s.darts < FEW_DARTS ? Math.max(s.scatter, TYPICAL_SCATTER) : s.scatter) / Math.sqrt(s.darts);

/** Above this, the average point is too unsure to read a tendency from it, mm. */
export const UNSURE_MM = 3;

/** What the figures say, as keys of the texts in the view. */
export interface Reading {
  /** The tendency: too few darts to tell, clear (worth correcting), or small next to the scatter. */
  bias: "unsure" | "clear" | "small";
  /**
   * A clear tendency on doubles that points mostly inward (toward the single) or outward (off the board). Only named,
   * never judged: which side is better in a match depends on the double and on the player (see the help).
   */
  doubles?: "inside" | "outside";
  /** The scatter is most of the distance to the centre. */
  scatterRules: boolean;
  /** The verdict: what to work on; "few" below MIN_DARTS, whatever the figures. */
  verdict: "few" | "unsure" | "aim" | "repeat";
}

/**
 * Reads a spread: a tendency is worth correcting when it is at least a third of the scatter and well beyond chance
 * (twice the uncertainty), on every field: the centre is the goal. Otherwise the scatter is the thing to work on.
 * Below MIN_DARTS no tendency is called clear and the verdict only says that more darts are needed.
 */
export function readSpread(s: Spread, radial: number | null, doubles: boolean): Reading {
  const u = uncertainty(s);
  const few = s.darts < MIN_DARTS;
  const clear = !few && s.bias >= s.scatter / 3 && s.bias > 2 * u;
  const bias: Reading["bias"] = (few || u > UNSURE_MM) && !clear ? "unsure" : clear ? "clear" : "small";
  let side: Reading["doubles"];
  if (doubles && clear && radial !== null && Math.abs(radial) >= s.bias * 0.7) side = radial < 0 ? "inside" : "outside";
  const scatterRules = s.scatter >= s.bias * 2;
  const verdict: Reading["verdict"] = few ? "few" : bias === "unsure" ? "unsure" : bias === "clear" ? "aim" : "repeat";
  return { bias, doubles: side, scatterRules, verdict };
}

/**
 * How big a change between two periods can be by chance alone: for distance and scatter (mm) from the scatter and
 * the darts of both, for the share in the field (percentage points) from the two shares.
 */
export function changeNoise(a: Spread, b: Spread): { mm: number; pct: number } {
  const p = (s: Spread) => s.hitRate / 100;
  return {
    mm: Math.sqrt(a.scatter ** 2 / a.darts + b.scatter ** 2 / b.darts),
    pct: 100 * Math.sqrt((p(a) * (1 - p(a))) / a.darts + (p(b) * (1 - p(b))) / b.darts),
  };
}

/** A choice in the precision view: everything, one kind of field (all doubles, ...) or one field. */
export type Scope = { kind: "all" } | { kind: "group"; group: Group } | { kind: "field"; key: string };
export type Group = "double" | "triple" | "outerSingle" | "innerSingle" | "bull";
export const GROUPS: Group[] = ["double", "triple", "outerSingle", "innerSingle", "bull"];

export function groupOf(f: BoardField): Group {
  return f.bed === "outerBull" ? "bull" : f.bed;
}

export function inScope(d: AimedDart, s: Scope): boolean {
  if (s.kind === "all") return true;
  if (s.kind === "group") return groupOf(d.field) === s.group;
  return d.key === s.key;
}

/** Fields in board order: by bed (doubles first), then clockwise from the 20; bulls last. */
export function compareFields(a: BoardField, b: BoardField): number {
  const bed = (f: BoardField) => GROUPS.indexOf(groupOf(f)) * 2 + (f.bed === "outerBull" ? 1 : 0);
  return bed(a) - bed(b) || (a.number ?? 0) - (b.number ?? 0);
}

/** The darts of each field, fields in board order. */
export function byField(darts: AimedDart[]): { key: string; field: BoardField; darts: AimedDart[] }[] {
  const map = new Map<string, { key: string; field: BoardField; darts: AimedDart[] }>();
  for (const d of darts) {
    const e = map.get(d.key) ?? { key: d.key, field: d.field, darts: [] };
    e.darts.push(d);
    map.set(d.key, e);
  }
  return [...map.values()].sort((a, b) => compareFields(a.field, b.field));
}
