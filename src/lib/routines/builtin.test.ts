import { describe, expect, it } from "vitest";
import { GAMES, gameById } from "../games";
import { itemMinutes, totalSeconds, cleanItems } from "../store";
import { BUILTIN_ROUTINES, makeBuiltin, missingBuiltins } from "./builtin";

describe("built-in routines", () => {
  for (const b of BUILTIN_ROUTINES) {
    const r = makeBuiltin(b);
    describe(b.id, () => {
      it("uses games that exist", () => {
        for (const i of r.items) expect(GAMES.some((g) => g.id === i.gameId)).toBe(true);
      });
      it("uses only settings and options the game offers", () => {
        for (const i of r.items) {
          const g = gameById(i.gameId);
          for (const [key, value] of Object.entries(i.settings)) {
            const f = g.fields.find((x) => x.key === key);
            expect(f, `${g.id}.${key}`).toBeDefined();
            if (f?.kind === "select") expect(f.options!.map((o) => String(o.value))).toContain(String(value));
            if (f?.kind === "number") {
              expect(Number(value)).toBeGreaterThanOrEqual(f.min ?? -Infinity);
              expect(Number(value)).toBeLessThanOrEqual(f.max ?? Infinity);
            }
          }
        }
      });
      it("only an uncapped game that can end by itself runs without time cap", () => {
        for (const i of r.items) if (!(i.minutes > 0)) expect(gameById(i.gameId).canEnd?.(i.settings)).toBe(true);
      });
      it("has a 15 second break and survives cleanItems unchanged", () => {
        expect(r.pauseSeconds).toBe(15);
        expect(cleanItems(r.items)).toEqual(r.items);
      });
    });
  }

  it("Everyday Drill is about 65 minutes of games plus four estimated legs", () => {
    const r = makeBuiltin(BUILTIN_ROUTINES[0]);
    expect(r.items.filter((i) => i.minutes > 0).reduce((s, i) => s + i.minutes, 0)).toBe(65);
    expect(itemMinutes(r.items[10])).toBe(12);
    expect(totalSeconds(r)).toBe((65 + 12) * 60 + 10 * 15);
  });

  it("restoring adds a deleted routine, and a changed one as a copy, once", () => {
    const all = BUILTIN_ROUTINES.map((b) => makeBuiltin(b));
    expect(missingBuiltins(all)).toHaveLength(0);
    expect(missingBuiltins(all.slice(1))).toHaveLength(1);
    const changed = structuredClone(all);
    changed[0].items.pop();
    const copy = missingBuiltins(changed);
    expect(copy).toHaveLength(1);
    expect(copy[0].id).not.toBe(changed[0].id);
    expect(copy[0].name).toContain("(original)");
    expect(missingBuiltins([...changed, ...copy])).toHaveLength(0);
  });
});
