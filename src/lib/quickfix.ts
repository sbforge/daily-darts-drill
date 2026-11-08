// Quick corrections: the detection is mostly off by a few millimetres, so the field it should have counted is almost
// always right next to the one it did. While a dart is being corrected, these fields are offered as buttons: the other
// beds of the same number, and the same bed of the two numbers beside it.
import type { Dart } from "./autodarts";
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
 * The fields next to the one a dart counted, as darts that replace it. They keep the spot the cameras saw (a few
 * millimetres off at most) and are marked "manual", like every dart corrected by hand.
 */
export function quickFixes(d: Dart): Dart[] {
  const base = { x: d.x, y: d.y, radius: d.radius, bouncer: false, failed: false, method: "manual" };
  const single = (n: number, zone: "inner" | "outer"): Dart => ({ ...base, kind: "single", number: n, zone, score: n });
  const double = (n: number): Dart => ({ ...base, kind: "double", number: n, zone: null, score: n * 2 });
  const triple = (n: number): Dart => ({ ...base, kind: "triple", number: n, zone: null, score: n * 3 });
  const n = d.number ?? 0;
  switch (d.kind) {
    case "single": {
      const [l, r] = neighbours(n);
      const zone = d.zone ?? "outer";
      return [triple(n), double(n), single(l, zone), single(r, zone)];
    }
    case "double": {
      const [l, r] = neighbours(n);
      return [single(n, "outer"), triple(n), double(l), double(r)];
    }
    case "triple": {
      const [l, r] = neighbours(n);
      // The single on the side of the triple where the dart sits.
      return [single(n, d.radius < (R.tri0 + R.tri1) / 2 ? "inner" : "outer"), double(n), triple(l), triple(r)];
    }
    case "outerBull":
      return [{ ...base, kind: "bull", number: null, zone: null, score: 50 }];
    case "bull":
      return [{ ...base, kind: "outerBull", number: null, zone: null, score: 25 }];
    default:
      return [];
  }
}
