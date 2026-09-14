import { withBaseEnemyFields } from "@roleplayer/server-core/combat/tools.js";
import { WEAPONS, ARCHETYPES } from "./enemy-stats.js";

// What the narrative DM is asked for per enemy when it calls start_combat -
// the inputs Cyberpunk's stat tables consume (enemy-stats.js), on top of the
// engine's name / description / motive / notes. Composed into the tool's
// schema at startup, so the DM is asked for exactly these, no more.
//
// FIRST CUT, expected to grow: nature (human / cyborg / drone / animal) and
// a combat-role taxonomy (bruiser, skirmisher, ranged, tech, support) are
// the obvious next fields once the tables that consume them exist.
export const enemySchema = withBaseEnemyFields({
  required: ["tier", "weapon"],
  properties: {
    tier: {
      type: "integer",
      minimum: 1,
      maximum: 5,
      description:
        "How skilled/dangerous, not how tough: 1 untrained (panicked civilian), 2 mook (typical ganger), 3 professional (bodyguard, beat cop), 4 elite (veteran solo, black-ops), 5 boss (named nemesis, cyberpsycho).",
    },
    weapon: {
      type: "string",
      enum: Object.keys(WEAPONS),
      description: "The weapon class this enemy is actually using.",
    },
    archetype: {
      type: "string",
      enum: Object.keys(ARCHETYPES),
      description: "Optional lopsidedness: sniper (+2 attack), heavy (-2 defense), dodger (+2 defense), berserker (+2 attack, -2 defense). Default standard.",
    },
  },
});
