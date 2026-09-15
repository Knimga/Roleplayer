// Cyberpunk Red's enemy stat tables and generateCoreStats: the numbers every
// fight uses, computed server-side at handoff from the enemy's schema fields
// (enemy-schema.js) and stored on enemy.stats before the first combat turn.
// Pure lookup, no model. See specs/combat-encounters.md §6 and the engine's
// README for the contract.
//
// Combat Numbers by tier and damage dice by weapon class come from
// mcp/docs/npc-modifier-lookup.md and mcp/docs/weapon-damage-reference.md;
// the archetype table is this module's own (tier-scaled, wider than the
// doc's flat +/-2 tweaks). These tables, not the docs, are what a fight
// runs on. Long-tail values (a specific skill, a special ability) belong in
// lookups/, not here.

// `durability` is how much it takes to move this enemy down the status
// ladder (unharmed -> bruised -> injured -> critical -> dead) - it goes into
// the stat block so the combat DM reads it next to the enemy rather than
// cross-referencing a table.
export const TIERS = {
  1: { label: "Untrained", combatNumber: 5, durability: "drops to almost anything" },
  2: { label: "Mook", combatNumber: 9, durability: "1-2 solid hits, or one big damage roll" },
  3: { label: "Professional", combatNumber: 12, durability: "2-4 meaningful hits; small rolls chip, big rolls wound badly" },
  4: { label: "Elite", combatNumber: 15, durability: "several strong hits; never drops to a scratch" },
  5: { label: "Boss", combatNumber: 18, durability: "absorbs real punishment before critical; a genuine threat" },
};

// Damage dice by weapon class, from weapon-damage-reference.md. Values are
// the doc's single-shot figures. Every enemy carries one of each: a melee
// weapon (unarmed counts) and a ranged one (`none` for an enemy that
// genuinely has nothing to shoot with).
export const MELEE_WEAPONS = {
  unarmed: "1d6",
  "light melee": "1d6",
  "medium melee": "2d6",
  "heavy melee": "3d6",
  "very heavy melee": "4d6",
};

// Ranged weapons carry a to-hit DV as well: when an enemy shoots a player
// there is no opposed roll, its attack + 1d10 simply has to beat the DV of
// the weapon it's using. Pistols/SMGs/shotguns 13, rifles and bows 15,
// sniper rifles and heavy weapons 17.
export const RANGED_WEAPONS = {
  none: { damage: null, dv: null },
  "medium pistol": { damage: "2d6", dv: 13 },
  "heavy pistol": { damage: "3d6", dv: 13 },
  "very heavy pistol": { damage: "4d6", dv: 13 },
  smg: { damage: "2d6", dv: 13 },
  "heavy smg": { damage: "3d6", dv: 13 },
  shotgun: { damage: "5d6", dv: 13 },
  "assault rifle": { damage: "5d6", dv: 15 },
  "bow/crossbow": { damage: "4d6", dv: 15 },
  "sniper rifle": { damage: "5d6", dv: 17 },
  "grenade launcher": { damage: "6d6", dv: 17 },
  "rocket launcher": { damage: "8d6", dv: 17 },
};

// Attack/defense bonuses by archetype, added to the tier's Combat Number,
// plus `behavior`: how this kind of enemy fights, which goes into the stat
// block for the combat DM to play to. `thug` is the balanced middle and the
// fallback when the handoff names an archetype that isn't here.
export const ARCHETYPES = {
  brawler: { attack: 1, defense: 3, behavior: "closes and absorbs; wades in and keeps swinging" },
  assassin: { attack: 3, defense: 1, behavior: "picks the weakest or most exposed target and hits hard" },
  thug: { attack: 1, defense: 1, behavior: "does the obvious thing; shoots or swings at whoever's nearest" },
  sniper: { attack: 3, defense: -1, behavior: "keeps distance, takes angles, repositions rather than trading blows" },
  elite: { attack: 3, defense: 3, behavior: "does all of it well; uses cover, focuses fire, presses an advantage" },
  civilian: { attack: 0, defense: 0, behavior: "mostly tries not to die; runs, hides, or freezes" },
};
const FALLBACK_ARCHETYPE = "thug";

// Everything an enemy might be asked to roll that isn't an attack or a
// defense resolves on one of the seven STATs: the combat DM decides which
// STAT the check falls under and rolls that value + 1d10. Cyberpunk has far
// too many skills to table per archetype, and an NPC will never use most of
// them, so the block carries seven numbers instead of dozens - precomputed
// here, no lookup tool needed.
export const STATS = ["INT", "REF", "DEX", "TECH", "COOL", "WILL", "EMP"];

// Which STAT a check falls under - the one judgment the DM makes instead of
// consulting a skill list. Used verbatim in the npc_check tool's description
// (mcp/server.js) and mirrored in combat/system-prompt.md; keep the two in
// step.
export const STAT_HINTS = {
  REF: "shooting-adjacent actions that aren't an attack roll, driving, drawing under pressure",
  DEX: "athletics, climbing, stealth, dodging a hazard, catching a ledge",
  COOL: "intimidation, bluffing, keeping composure, a facedown",
  EMP: "reading someone's intent, persuasion, sensing a lie",
  INT: "noticing something, recognizing a face, knowing what a device does",
  TECH: "jury-rigging, breaching a lock, disabling a system",
  WILL: "resisting intimidation, fear, or pain; pushing through a wound",
};

// How the archetypes read, for whoever has to pick one from the fiction -
// the narrative DM in start_combat (enemy-schema.js) and either DM in
// npc_check (mcp/server.js). One string so the two can't drift.
export const ARCHETYPE_DESCRIPTION =
  "brawler (hard to put down, hits modestly), assassin or sniper (hits hard, easier to hit back), thug (balanced - the default for an ordinary ganger), elite (strong at everything), civilian (no combat training at all).";

// Skill base by tier, from npc-modifier-lookup.md's competence bands
// (untrained 4-8, ordinary 9-11, trained 12-14, elite 15-17+).
export const TIER_STAT_BASE = { 1: 6, 2: 10, 3: 13, 4: 16, 5: 18 };

// Per-archetype offsets to that base, one per STAT. Tier sets the level;
// this sets the shape, and the shape is meant to be pronounced: an
// archetype's strong STATs sit around +4/+5 over its tier base and its weak
// ones around -4/-5 under, so a sniper's REF and its EMP are ten points
// apart rather than three. Tune freely.
export const STAT_PROFILES = {
  brawler: { INT: -4, REF: -1, DEX: 0, TECH: -4, COOL: 2, WILL: 5, EMP: -4 },
  assassin: { INT: 1, REF: 3, DEX: 5, TECH: -1, COOL: 4, WILL: 0, EMP: -4 },
  thug: { INT: -3, REF: 1, DEX: 0, TECH: -4, COOL: 3, WILL: 0, EMP: -4 },
  sniper: { INT: 3, REF: 5, DEX: 0, TECH: 1, COOL: 4, WILL: 0, EMP: -5 },
  elite: { INT: 3, REF: 4, DEX: 3, TECH: 0, COOL: 4, WILL: 3, EMP: -2 },
  civilian: { INT: 1, REF: -5, DEX: -3, TECH: -2, COOL: -5, WILL: -5, EMP: 3 },
};

// The enemy's total for one STAT (the number it rolls + 1d10 against). Pure
// and importable on its own, so the narrative side can use the same table
// for an NPC outside a fight without going through the combat engine.
export function statTotal({ tier, archetype }, stat) {
  const t = TIER_STAT_BASE[tier] ? tier : 2;
  const profile = STAT_PROFILES[archetype] ?? STAT_PROFILES[FALLBACK_ARCHETYPE];
  return TIER_STAT_BASE[t] + (profile[stat] ?? 0);
}

// Takes the whole enemy object from the handoff and returns its stat block.
// Tolerant of a missing or off-table value (falls back to a mook thug with
// a knife and a medium pistol) rather than failing the handoff over one bad
// field.
export function generateCoreStats(enemy) {
  const tier = TIERS[Number(enemy?.tier)] ? Number(enemy.tier) : 2;
  const meleeWeapon = enemy?.meleeWeapon in MELEE_WEAPONS ? enemy.meleeWeapon : "light melee";
  const rangedWeapon = enemy?.rangedWeapon in RANGED_WEAPONS ? enemy.rangedWeapon : "medium pistol";
  const archetype = ARCHETYPES[enemy?.archetype] ? enemy.archetype : FALLBACK_ARCHETYPE;
  const base = TIERS[tier].combatNumber;
  return {
    tier: `${tier} (${TIERS[tier].label})`,
    durability: TIERS[tier].durability,
    archetype,
    behavior: ARCHETYPES[archetype].behavior,
    // What the enemy rolls with (+ 1d10) when it attacks, melee or ranged.
    attack: base + ARCHETYPES[archetype].attack,
    // A fixed number a player's attack roll must beat, melee or ranged.
    // Enemies never roll to defend.
    defense: base + ARCHETYPES[archetype].defense + 5,
    // Damage is rolled on a successful hit with whichever weapon the enemy
    // used; never modified by a STAT. shootDv is what the enemy's own
    // ranged attack roll must beat (no opposed roll from the player). Both
    // ranged fields are null for an enemy with nothing to shoot.
    meleeWeapon,
    meleeDamage: MELEE_WEAPONS[meleeWeapon],
    rangedWeapon,
    rangedDamage: RANGED_WEAPONS[rangedWeapon].damage,
    shootDv: RANGED_WEAPONS[rangedWeapon].dv,
    // One number per STAT for every non-attack check - see STATS above.
    ...Object.fromEntries(STATS.map((stat) => [stat, statTotal({ tier, archetype }, stat)])),
  };
}
