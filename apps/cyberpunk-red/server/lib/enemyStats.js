// Cyberpunk Red's enemy-stat module (specs/combat-encounters.md §6). The
// contract every app's module satisfies:
//
// - statInputsSchema: the JSON-schema fragment for enemies[].statInputs in
//   start_combat - what the narrative DM can name from the scene that these
//   tables consume.
// - generateCoreStats(statInputs): the small set of numbers every fight uses,
//   computed server-side at handoff from the tables. Pure lookup, no model.
// - adHocLookups: model-callable lookups for the long tail, each
//   { name, description, input_schema, resolve(enemy, input) -> { path, value } }.
//   The combat generator persists whatever resolve returns into the enemy's
//   stat block, so the second time anyone needs it, it's already there.
//
// FIRST CUT - the tables below are a straight encoding of
// mcp/docs/npc-modifier-lookup.md (Combat Number by tier, archetype tweaks)
// and mcp/docs/weapon-damage-reference.md (damage dice by weapon class).
// Inputs, outputs and the tables themselves are expected to be reworked;
// this exists so the pipeline runs end to end with real numbers.

export const TIERS = {
  1: { label: "Untrained", combatNumber: 5 },
  2: { label: "Mook", combatNumber: 9 },
  3: { label: "Professional", combatNumber: 12 },
  4: { label: "Elite", combatNumber: 15 },
  5: { label: "Boss", combatNumber: 18 },
};

// Damage dice by weapon class, from weapon-damage-reference.md. Values are
// the doc's single-shot figures.
export const WEAPONS = {
  unarmed: "1d6",
  "light melee": "1d6",
  "medium melee": "2d6",
  "heavy melee": "3d6",
  "very heavy melee": "4d6",
  "medium pistol": "2d6",
  "heavy pistol": "3d6",
  "very heavy pistol": "4d6",
  smg: "2d6",
  "heavy smg": "3d6",
  shotgun: "5d6",
  "assault rifle": "5d6",
  "sniper rifle": "5d6",
  "bow/crossbow": "4d6",
  "grenade launcher": "6d6",
  "rocket launcher": "8d6",
};

// Archetype tweaks (npc-modifier-lookup.md, "+/-2 when an enemy is lopsided").
export const ARCHETYPES = {
  standard: { attack: 0, defense: 0 },
  sniper: { attack: 2, defense: 0 },
  heavy: { attack: 0, defense: -2 },
  dodger: { attack: 0, defense: 2 },
  berserker: { attack: 2, defense: -2 },
};

export const statInputsSchema = {
  type: "object",
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
};

export function generateCoreStats(statInputs) {
  const tier = TIERS[Number(statInputs?.tier)] ? Number(statInputs.tier) : 2;
  const weapon = WEAPONS[statInputs?.weapon] ? statInputs.weapon : "medium pistol";
  const archetype = ARCHETYPES[statInputs?.archetype] ? statInputs.archetype : "standard";
  const base = TIERS[tier].combatNumber;
  return {
    tier: `${tier} (${TIERS[tier].label})`,
    attack: base + ARCHETYPES[archetype].attack, // + 1d10 when they attack
    defense: base + ARCHETYPES[archetype].defense, // + 1d10 when a player attacks them
    damage: WEAPONS[weapon], // rolled on a successful hit; not modified by any STAT
    weapon,
  };
}

// Cyberpunk may need none in practice: the Combat Number already covers
// attack and defense, and a skill check for an NPC is rare mid-fight. Left
// empty deliberately; the plumbing is exercised by Laria's eventual set.
export const adHocLookups = [];
