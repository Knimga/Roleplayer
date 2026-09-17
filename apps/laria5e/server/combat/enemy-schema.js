import { withBaseEnemyFields } from "@roleplayer/server-core/combat/tools.js";
import { CLASSES, CLASS_DESCRIPTION, MELEE_WEAPONS, RANGED_WEAPONS } from "./enemy-stats.js";

// What the narrative DM is asked for per enemy when it calls start_combat -
// the inputs Laria's stat tables consume (enemy-stats.js), on top of the
// engine's name / description / motive / notes. Composed into the tool's
// schema at startup, so the DM is asked for exactly these, no more. The
// enums are read off the tables so the two can't drift.
//
// `creatureType` is kept as free text for the combat DM's benefit (a wolf
// and a bandit are both "fighter, adept" to the tables but fight nothing
// alike); it feeds no table.
export const enemySchema = withBaseEnemyFields({
  required: ["creatureType", "class", "powerLevel", "meleeWeapon", "rangedWeapon"],
  properties: {
    creatureType: {
      type: "string",
      description: "What it is, in 5e terms: 'goblin', 'bandit captain', 'ogre', 'cult fanatic', 'wolf'. Named NPCs: the closest creature or profession.",
    },
    class: {
      type: "string",
      enum: Object.keys(CLASSES),
      description: `How this enemy fights and what it's good at, which sets its ability tiers, skills, saves, and AC: ${CLASS_DESCRIPTION}`,
    },
    powerLevel: {
      type: "integer",
      minimum: 1,
      maximum: 5,
      description:
        "How skilled/dangerous, not how big: 1 untrained (a farmer with a pitchfork), 2 adept (typical bandit, goblin), 3 professional (veteran soldier, bandit captain), 4 elite (a knight, a cult leader), 5 boss (a named foe of the campaign).",
    },
    meleeWeapon: {
      type: "string",
      enum: Object.keys(MELEE_WEAPONS),
      description: "What it fights with up close. Every enemy has one; 'unarmed' or 'natural weapons' if nothing else.",
    },
    rangedWeapon: {
      type: "string",
      enum: Object.keys(RANGED_WEAPONS),
      description: "What it throws or shoots. Every enemy has one; 'none' if it genuinely has nothing.",
    },
  },
});
