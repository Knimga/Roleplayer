import { withBaseEnemyFields } from "@roleplayer/server-core/combat/tools.js";
import { MELEE_WEAPONS, RANGED_WEAPONS, ARCHETYPES, ARCHETYPE_DESCRIPTION } from "./enemy-stats.js";

// What the narrative DM is asked for per enemy when it calls start_combat -
// the inputs Cyberpunk's stat tables consume (enemy-stats.js), on top of the
// engine's name / description / motive / notes. Composed into the tool's
// schema at startup, so the DM is asked for exactly these, no more. The
// enums are read off the tables so the two can't drift.
//
// Expected to grow: nature (human / cyborg / drone / animal) is the obvious
// next field once a table consumes it.
export const enemySchema = withBaseEnemyFields({
  required: ["tier", "archetype", "meleeWeapon", "rangedWeapon"],
  properties: {
    tier: {
      type: "integer",
      minimum: 1,
      maximum: 5,
      description:
        "How skilled/dangerous, not how tough: 1 untrained (panicked civilian), 2 mook (typical ganger), 3 professional (bodyguard, beat cop), 4 elite (veteran solo, black-ops), 5 boss (named nemesis, cyberpsycho).",
    },
    archetype: {
      type: "string",
      enum: Object.keys(ARCHETYPES),
      description: `How this enemy fights, which sets its attack/defense split and its STAT profile: ${ARCHETYPE_DESCRIPTION}`,
    },
    meleeWeapon: {
      type: "string",
      enum: Object.keys(MELEE_WEAPONS),
      description: "What it fights with up close. Every enemy has one; 'unarmed' if nothing else.",
    },
    rangedWeapon: {
      type: "string",
      enum: Object.keys(RANGED_WEAPONS),
      description: "What it shoots with. Every enemy has one; 'none' only if it genuinely has nothing to shoot.",
    },
  },
});
