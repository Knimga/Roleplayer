// The combat engine's public surface. See README.md in this folder for the
// flow end to end and the game module contract each app implements.
export {
  buildStartCombatTool,
  validateHandoff,
  withBaseEnemyFields,
  gameFieldsOf,
  BASE_ENEMY_PROPERTIES,
  BASE_ENEMY_REQUIRED,
  END_COMBAT_TOOL,
  validateOutcome,
  COMBAT_OUTCOMES,
  OBJECTIVE_RESULTS,
  ENEMY_END_STATES,
} from "./tools.js";
export { loadCombatDmCore, buildCombatContext, renderCombatOutcome } from "./context.js";
export { createCombatGenerator } from "./generator.js";
export { createCombatsRouter, COMBAT_OUTCOME_SENDER } from "./router.js";
