import { describe, expect, it } from "vitest";
import { Session } from "./session.svelte";
import { oneTwentyOne } from "./games";
import { scoring } from "./games";
import { dart, darts } from "./games/test-helpers";

const feed = (s: Session, codes: string) => darts(codes).forEach((d, i) => s.handle({ kind: "dart", dart: d, indexInTurn: i }));

describe("Session", () => {
  it("collects darts into turns when the board is cleared", () => {
    const s = new Session(scoring, {});
    feed(s, "T20 T20 T20");
    s.handle({ kind: "turnEnded", darts: darts("T20 T20 T20") });
    feed(s, "S1");
    expect(s.turns).toHaveLength(1);
    expect(s.allTurns).toHaveLength(2);
    expect(s.result.values.darts).toBe(4);
  });
  it("a hand-made correction survives Autodarts re-sending the same turn", () => {
    const s = new Session(scoring, {});
    feed(s, "S1 S2");
    s.toggleEdit(0);
    s.correct(dart("T20"));
    s.handle({ kind: "correction", darts: darts("S1 S2") });
    expect(s.current[0].score).toBe(60);
  });
  it("Autodarts' own change of a corrected dart wins", () => {
    const s = new Session(scoring, {});
    feed(s, "S1 S2");
    s.toggleEdit(0);
    s.correct(dart("T20"));
    s.handle({ kind: "correction", darts: darts("S5 S2") });
    expect(s.current[0].score).toBe(5);
  });
  it("next turn fills the empty boxes with misses", () => {
    const s = new Session(scoring, {});
    feed(s, "T20");
    s.endTurn();
    expect(s.turns[0]).toHaveLength(3);
    expect(s.turns[0].slice(1).every((d) => d.kind === "miss")).toBe(true);
  });
  it("a busted turn takes no more darts", () => {
    const s = new Session(oneTwentyOne, { ...oneTwentyOne.defaultSettings });
    feed(s, "T20 T20");
    expect(s.busted).toBe(true);
    expect(s.canAdd).toBe(false);
  });
  it("darts can be set by hand when no scorer is connected", () => {
    const s = new Session(scoring, {});
    s.add(dart("D5"));
    s.add(dart("D5"));
    s.add(dart("D5"));
    s.add(dart("D5")); // a full hand-made turn makes way for the next
    expect(s.allTurns).toHaveLength(2);
  });
});
