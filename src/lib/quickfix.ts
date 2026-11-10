// Quick corrections: the detection is mostly off by a few millimetres, so the field it should have counted touches the
// one it did. While a dart is being corrected, the fields touching it are offered as buttons; a field further away
// (D20 for a T20) is so unlikely that it is left to a click on the board.
import type { Dart } from "./autodarts";
import { missSegment } from "./autodarts";
import { ORDER, R, segmentAngle } from "./precision";

/** The two numbers beside a segment, the one further left on the board first (the upper one at the sides). */
export function neighbours(n: number): [number, number] {
  const i = ORDER.indexOf(n);
  const pair = [ORDER[(i + 19) % 20], ORDER[(i + 1) % 20]];
  const pos = (m: number) => {
    const a = (segmentAngle(m) * Math.PI) / 180;
    return { x: Math.sin(a), y: Math.cos(a) };
  };
  pair.sort((a, b) => pos(a).x - pos(b).x || pos(b).y - pos(a).y);
  return pair as [number, number];
}

/**
 * The fields touching the one a dart counted, as darts that replace it, the same number first:
 * - outer single: treble and double of the number, the singles beside it
 * - inner single: treble of the number, the 25, the singles beside it
 * - treble: the single of the number on the dart's side, the trebles beside it, and those singles beside it
 * - double: the outer single of the number, a miss, the doubles beside it, the outer singles beside it
 * - a miss beside a number (M4): double and outer single of the number, the doubles and outer singles beside it
 * - bull and 25: each other
 * They keep the spot the cameras saw (a few millimetres off at most) and are marked "manual", like every dart
 * corrected by hand.
 *
 * Order, left to right: the segment counted first (with a miss, the 25 or the bull that touch it), then the numbers
 * beside it, the lower number first; within a number the higher score first. For M20: D20 S20 D1 S1 D5 S5.
 */
export function quickFixes(d: Dart): Dart[] {
  const own = d.kind === "miss" ? missSegment(d) : d.number;
  const group = (f: Dart) => (f.number === null || f.number === own ? 0 : f.number);
  return touching(d).sort((a, b) => group(a) - group(b) || b.score - a.score);
}

function touching(d: Dart): Dart[] {
  const base = { x: d.x, y: d.y, radius: d.radius, bouncer: false, failed: false, method: "manual" };
  const single = (n: number, zone: "inner" | "outer"): Dart => ({ ...base, kind: "single", number: n, zone, score: n });
  const double = (n: number): Dart => ({ ...base, kind: "double", number: n, zone: null, score: n * 2 });
  const triple = (n: number): Dart => ({ ...base, kind: "triple", number: n, zone: null, score: n * 3 });
  const miss: Dart = { ...base, kind: "miss", number: null, zone: null, score: 0 };
  const bull: Dart = { ...base, kind: "bull", number: null, zone: null, score: 50 };
  const outerBull: Dart = { ...base, kind: "outerBull", number: null, zone: null, score: 25 };
  const n = d.number ?? 0;
  switch (d.kind) {
    case "single": {
      const [l, r] = neighbours(n);
      return d.zone === "inner"
        ? [triple(n), outerBull, single(l, "inner"), single(r, "inner")]
        : [triple(n), double(n), single(l, "outer"), single(r, "outer")];
    }
    case "triple": {
      const [l, r] = neighbours(n);
      const zone = d.radius < (R.tri0 + R.tri1) / 2 ? "inner" : "outer";
      return [single(n, zone), triple(l), triple(r), single(l, zone), single(r, zone)];
    }
    case "double": {
      const [l, r] = neighbours(n);
      return [single(n, "outer"), miss, double(l), double(r), single(l, "outer"), single(r, "outer")];
    }
    case "outerBull":
      return [bull];
    case "bull":
      return [outerBull];
    default: {
      const m = missSegment(d);
      if (!m) return [];
      const [l, r] = neighbours(m);
      return [double(m), single(m, "outer"), double(l), double(r), single(l, "outer"), single(r, "outer")];
    }
  }
}
