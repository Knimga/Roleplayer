import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { enemySchema } from "./enemy-schema.js";
import { generateCoreStats } from "./enemy-stats.js";
import { buildRollMessage } from "./roll-message.js";

// Laria's combat game module - everything the shared combat engine
// (packages/server-core/src/combat/, see its README) needs to know about
// this game, in one object. This folder is where Laria-specific combat
// content lives: what an enemy is, how it's statted, how its dice read, and
// the mechanics prompt. Most of it is still placeholder pending Laria's
// combat rules doc (specs/combat-encounters.md §9).
//
// Read fresh per call like every other prompt loader in this codebase, so
// editing system-prompt.md takes effect on the next combat turn.
const SYSTEM_PROMPT_PATH = fileURLToPath(new URL("./system-prompt.md", import.meta.url));

export const combatGame = {
  enemySchema,
  generateCoreStats,
  // Ad hoc lookup tools for the long tail - one file each under lookups/,
  // listed here. This is where the per-skill / per-save lookups go once the
  // tables exist.
  adHocLookups: [],
  buildRollMessage,
  loadSystemPrompt: () => readFileSync(SYSTEM_PROMPT_PATH, "utf-8").trim(),
};
