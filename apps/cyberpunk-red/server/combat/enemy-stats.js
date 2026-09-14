// Cyberpunk Red's enemy stat tables and generateCoreStats: the numbers every
// fight uses, computed server-side at handoff from the enemy's schema fields
// (enemy-schema.js) and stored on enemy.stats before the first combat turn.
// Pure lookup, no model. See specs/combat-encounters.md §6 and the engine's
// README for the contract.
//
// FIRST CUT - a straight encoding of mcp/docs/npc-modifier-lookup.md (Combat
// Number by tier, archetype tweaks) and mcp/docs/weapon-damage-reference.md
// (damage dice by weapon class). Inputs, outputs and the tables themselves
// are expected to be reworked; this exists so the pipeline runs end to end
// with real numbers. Long-tail values (a specific skill, a special ability)
// belong in lookups/, not here.

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

// Takes the whole enemy object from the handoff and returns its stat block.
// Tolerant of a missing or off-table value (falls back to a mook with a
// medium pistol) rather than failing the handoff over one bad field.
export function generateCoreStats(enemy) {
  const tier = TIERS[Number(enemy?.tier)] ? Number(enemy.tier) : 2;
  const weapon = WEAPONS[enemy?.weapon] ? enemy.weapon : "medium pistol";
  const archetype = ARCHETYPES[enemy?.archetype] ? enemy.archetype : "standard";
  const base = TIERS[tier].combatNumber;
  return {
    tier: `${tier} (${TIERS[tier].label})`,
    attack: base + ARCHETYPES[archetype].attack, // + 1d10 when they attack
    defense: base + ARCHETYPES[archetype].defense, // + 1d10 when a player attacks them
    damage: WEAPONS[weapon], // rolled on a successful hit; not modified by any STAT
    weapon,
  };
}
