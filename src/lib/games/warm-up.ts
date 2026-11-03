import { t } from "../i18n/index.svelte";
import type { GameDef } from "./types";

export const warmUp: GameDef = {
  id: "warm-up",
  get name() {
    return t("warmUp.name");
  },
  get blurb() {
    return t("warmUp.blurb");
  },
  get classic() {
    return t("warmUp.classic");
  },
  get goal() {
    return t("warmUp.goal");
  },
  needsDarts: false,
  hasResult: false,
  defaultMinutes: 5,
  defaultSettings: {},
  fields: [],
  describe: () => t("game.noResult"),
  summary: () => t("game.noResult"),
  compute: () => ({
    values: {},
    lines: [],
    focus: { label: t("warmUp.name"), value: t("warmUp.focus") },
    done: false,
  }),
};
