// Laria's enemy-stat module (specs/combat-encounters.md §6). Same contract
// as cyberpunk-red/server/lib/enemyStats.js:
//
// - statInputsSchema: what the narrative DM names from the scene.
// - generateCoreStats(statInputs): the numbers every fight uses, at handoff.
// - adHocLookups: model-callable lookups for the long tail (a skill bonus,
//   a save), persisted into the enemy's stat block the first time they're
//   derived.
//
// NOT YET AUTHORED. Laria has no combat rules doc yet (§9), so there are no
// tables to encode: generateCoreStats returns an empty block and the combat
// DM works from Claude's general 5e knowledge for this creature type and
// threat tier, exactly as the spec says it should until the tables exist.
// The inputs below are a placeholder shape so the pipeline runs end to end;
// replace them when Laria's combat mechanics are written.
//
// When the tables land, the D&D case is the one the ad hoc contract was
// designed for - ~18 skills per enemy is waste to precompute and trivial to
// derive once. A lookup then looks like:
//
//   {
//     name: "lookup_enemy_skill",
//     description: "The enemy's bonus for one skill, from its stored stats.",
//     input_schema: { required: ["skill"], properties: { skill: { type: "string", enum: SKILLS } } },
//     resolve(enemy, { skill }) {
//       return { path: ["skills", skill], value: proficiency(enemy.stats) + abilityMod(enemy.stats, skill) };
//     },
//   }

export const statInputsSchema = {
  type: "object",
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
};

export function generateCoreStats() {
  // No tables yet - see the header. The inputs are still rendered in the
  // handoff (as "Type: ..."), which is what the combat DM reasons from.
  return {};
}

export const adHocLookups = [];
