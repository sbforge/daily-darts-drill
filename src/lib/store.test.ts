import { describe, expect, it } from "vitest";
import { cleanItems, newItem } from "./store";

describe("routine items", () => {
  it("the JDC Challenge never has a time cap, not even from an older routine", () => {
    expect(newItem("jdc-challenge").minutes).toBe(0);
    const [item] = cleanItems([{ gameId: "jdc-challenge", minutes: 25, settings: { visits: 5 } }]);
    expect(item.minutes).toBe(0);
    expect(item.settings.rounds).toBe(1);
  });
  it("other games keep theirs", () => {
    expect(cleanItems([{ gameId: "scoring", minutes: 7, settings: {} }])[0].minutes).toBe(7);
  });
});
