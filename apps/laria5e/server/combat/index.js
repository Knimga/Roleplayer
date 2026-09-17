import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { enemySchema } from "./enemy-schema.js";
import { generateCoreStats } from "./enemy-stats.js";
import { buildRollMessage } from "./roll-message.js";

// Laria's combat game module - everything the shared combat engine
// (packages/server-core/src/combat/, see its README) needs to know about
// this game, in one object. This folder is where Laria-specific combat
// content lives: what an enemy is, how it's statted, how its dice read, and
// the mechanics prompt. The tables in enemy-stats.js are groundwork with
// placeholder values, pending Laria's combat rules
// (specs/combat-encounters.md §9).
//
// Read fresh per call like every other prompt loader in this codebase, so
// editing system-prompt.md takes effect on the next combat turn.
const SYSTEM_PROMPT_PATH = fileURLToPath(new URL("./system-prompt.md", import.meta.url));

export const combatGame = {
  enemySchema,
  generateCoreStats,
  // Ad hoc lookup tools for the long tail - one file each under lookups/,
  // listed here. None yet: skills go through the npc_check MCP tool, which
  // both DMs share (see lookups/README.md).
  adHocLookups: [],
  buildRollMessage,
  loadSystemPrompt: () => readFileSync(SYSTEM_PROMPT_PATH, "utf-8").trim(),
};
