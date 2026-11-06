import { describe, expect, it } from "vitest";
import type { Routine } from "../store";
import { ImportError, parseShareFile, shareFileName, toShareFile } from "./share";

const routine: Routine = {
  id: "abc",
  name: "Tuesday Doubles",
  description: "Doubles first, then scoring.",
  pauseSeconds: 30,
  items: [
    { gameId: "simple-doubles", minutes: 5, settings: { double: 16 } },
    { gameId: "scoring", minutes: 10, settings: {} },
  ],
};

const problem = (text: string) => {
  try {
    parseShareFile(text);
  } catch (e) {
    return e instanceof ImportError ? e.problem : "other";
  }
  return "none";
};

describe("routine files", () => {
  it("a routine comes back as it went out, with a new id", () => {
    const { routine: back, dropped } = parseShareFile(toShareFile(routine, "0.9.8"));
    expect(dropped).toBe(0);
    expect(back.id).not.toBe("abc");
    expect(back).toMatchObject({ name: "Tuesday Doubles", description: "Doubles first, then scoring.", pauseSeconds: 30 });
    expect(back.items.map((i) => [i.gameId, i.minutes, i.settings.double])).toEqual([
      ["simple-doubles", 5, 16],
      ["scoring", 10, undefined],
    ]);
  });
  it("keeps no id or results in the file", () => {
    expect(toShareFile(routine, "0.9.8")).not.toContain("abc");
  });
  it("leaves out games it doesn't know and counts them", () => {
    const file = JSON.parse(toShareFile(routine, "0.9.8"));
    file.routine.items.push({ gameId: "future-game", minutes: 5, settings: {} });
    const { routine: back, dropped } = parseShareFile(JSON.stringify(file));
    expect(back.items).toHaveLength(2);
    expect(dropped).toBe(1);
  });
  it("fills up missing settings and a missing time cap", () => {
    const file = { format: "d3-routine", version: 1, routine: { name: "x", items: [{ gameId: "simple-doubles" }] } };
    const { routine: back } = parseShareFile(JSON.stringify(file));
    expect(back.items[0].minutes).toBeGreaterThan(0);
    expect(back.items[0].settings.double).toBeDefined();
    expect(back.pauseSeconds).toBe(15);
  });
  it("refuses other files, newer formats and routines without a known game", () => {
    expect(problem("not json")).toBe("notRoutine");
    expect(problem(JSON.stringify({ hello: 1 }))).toBe("notRoutine");
    expect(problem(JSON.stringify({ format: "d3-routine", version: 2, routine: { items: [] } }))).toBe("newer");
    expect(problem(JSON.stringify({ format: "d3-routine", version: 1, routine: { items: [{ gameId: "nope" }] } }))).toBe("noGames");
  });
  it("makes a file name from the routine name", () => {
    expect(shareFileName("Tuesday Doubles")).toBe("Tuesday Doubles.d3-routine.json");
    expect(shareFileName("a/b:c?")).toBe("abc.d3-routine.json");
    expect(shareFileName("???")).toBe("routine.d3-routine.json");
  });
});
