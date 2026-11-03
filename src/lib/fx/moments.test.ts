import { describe, expect, it } from "vitest";
import { turns } from "../games/test-helpers";
import { pickMoments } from "./moments";

const great = (turn: number) => ({ key: `great:${turn}`, turn, effect: "stamp" as const, priority: 1 });

describe("pickMoments", () => {
  it("a 180 plays for every game", () => {
    const { play } = pickMoments({}, turns("T20 T20 T20"));
    expect(play.map((m) => m.text)).toEqual(["180"]);
  });
  it("a 180 beats a great turn in the same turn", () => {
    const { play, skip } = pickMoments({ moments: [great(0)] }, turns("T20 T20 T20"));
    expect(play[0].text).toBe("180");
    expect(skip.map((m) => m.key)).toEqual(["great:0"]);
  });
  it("No Score beats a 180 that went past the rest", () => {
    const { play } = pickMoments({ noScore: { turn: 0, darts: 3 } }, turns("T20 T20 T20"));
    expect(play).toHaveLength(1);
    expect(play[0].key).toBe("noscore:0");
  });
  it("different turns each get their own stamp", () => {
    expect(pickMoments({ moments: [great(1)] }, turns("S1 S1 S1 | S1 S1 S1 | T20 T20 T20")).play).toHaveLength(2);
  });
});
