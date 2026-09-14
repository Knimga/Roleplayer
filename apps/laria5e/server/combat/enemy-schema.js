import { withBaseEnemyFields } from "@roleplayer/server-core/combat/tools.js";

// What the narrative DM is asked for per enemy when it calls start_combat,
// on top of the engine's name / description / motive / notes.
//
// PLACEHOLDER. Laria has no combat rules doc yet (specs/combat-encounters.md
// §9), so there are no tables for these to feed; the combat DM works from
// general 5e for the named creature type and threat tier. Replace these
// fields when Laria's combat mechanics are written - a 5e creature-type
// enum, size, a combat-role taxonomy, and whatever the stat tables consume.
export const enemySchema = withBaseEnemyFields({
  required: ["creatureType", "threatTier"],
  properties: {
    creatureType: {
      type: "string",
      description: "What it is, in 5e terms: 'goblin', 'bandit captain', 'ogre', 'cult fanatic', 'wolf'. Named NPCs: the closest stat-block equivalent.",
    },
    threatTier: {
      type: "integer",
      minimum: 1,
      maximum: 5,
      description: "How dangerous relative to the party: 1 trivial, 2 minion, 3 a match for one player, 4 outclasses a player, 5 boss.",
    },
  },
});
