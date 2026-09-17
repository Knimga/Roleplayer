// Laria's enemy stat tables and generateCoreStats: the numbers every fight
// uses, computed server-side at handoff from the enemy's schema fields
// (enemy-schema.js) and stored on enemy.stats before the first combat turn.
// Pure lookup, no model. See the Cyberpunk module and the engine's README
// for the contract.
//
// GROUNDWORK, NOT TUNED. The shape is settled (below); every number in these
// tables is a placeholder standing in for values not yet authored. Tune
// freely - nothing outside this file depends on the values, only on the
// exports' shapes.
//
// The shape:
// - Six abilities (STR DEX CON INT WIS CHA). An enemy's strength in an
//   ability or skill is a *tier* - untrained / trained / expert / master -
//   not a granular number; each tier maps to one bonus (ABILITY_TIER_BONUS).
// - A class (the eleven 5e classes plus Laria's homebrew Shaman) sets the
//   ability tiers, any skills that exceed their governing ability's tier,
//   which of the three saves it's proficient in, a passive AC bonus, and
//   how it fights.
// - A power level 1-5 (untrained -> boss, like Cyberpunk's tiers) sets the
//   proficiency bonus, a small AC bonus, how far the class's ability tiers
//   shift, and durability on the status ladder.
// - Melee and ranged weapons carry their damage die.
//
// What's precomputed into the block: the six ability bonuses and the three
// save bonuses (cheap, and the combat DM needs them for every check and save
// the players force). Skills are the long tail (18 per enemy, most never
// used) and are not in the block: the npc_check MCP tool (mcp/server.js)
// looks one up from the same tables and rolls it in one call, for either DM
// - the combat DM passes the enemy's class and power level from its block,
// the narrative DM judges them from the fiction.

export const ABILITIES = ["STR", "DEX", "CON", "INT", "WIS", "CHA"];

// The three classic saves and the ability each rolls on. A save's bonus is
// its governing ability's bonus, plus proficiency if the class has it.
export const SAVE_ABILITY = { fortitude: "CON", reflex: "DEX", will: "WIS" };
export const SAVES = Object.keys(SAVE_ABILITY);

// Ordered weakest to strongest; index is what power level shifts along.
export const ABILITY_TIERS = ["untrained", "trained", "expert", "master"];

// PLACEHOLDER values. The bonus an ability or skill at each tier adds to
// 1d20. Note the scale: a d20 against DCs of 10-20 means +15 is close to
// automatic - tune with that in mind.
export const ABILITY_TIER_BONUS = { untrained: 0, trained: 5, expert: 10, master: 15 };

// Power level, 1-5. `proficiency` is added to attacks, proficient saves,
// and skills at trained or better. `abilityShift` moves every one of the
// class's ability tiers that many steps along ABILITY_TIERS (clamped), so
// a boss fighter's STR is master while an untrained one's is trained.
// `durability` goes into the stat block so the combat DM reads it next to
// the enemy rather than cross-referencing a table. PLACEHOLDER values.
export const POWER_LEVELS = {
  1: { label: "Untrained", proficiency: 2, acBonus: 0, abilityShift: -1, durability: "drops to almost anything" },
  2: { label: "Adept", proficiency: 2, acBonus: 0, abilityShift: 0, durability: "1-2 solid hits, or one big damage roll" },
  3: { label: "Professional", proficiency: 4, acBonus: 1, abilityShift: 0, durability: "2-4 meaningful hits; small rolls chip, big rolls wound badly" },
  4: { label: "Elite", proficiency: 6, acBonus: 2, abilityShift: 1, durability: "several strong hits; never drops to a scratch" },
  5: { label: "Boss", proficiency: 8, acBonus: 3, abilityShift: 1, durability: "absorbs real punishment before critical; a genuine threat" },
};
const FALLBACK_POWER_LEVEL = 2;

// Damage dice, standard 5e. Every enemy carries one of each: a melee weapon
// (unarmed counts) and a ranged one (`none` for an enemy with nothing to
// throw or shoot). Spellcasters attack with weapons here too until a
// spell-attack table exists.
export const MELEE_WEAPONS = {
  unarmed: "1d4",
  dagger: "1d4",
  club: "1d4",
  quarterstaff: "1d6",
  spear: "1d6",
  shortsword: "1d6",
  mace: "1d6",
  handaxe: "1d6",
  longsword: "1d8",
  warhammer: "1d8",
  battleaxe: "1d8",
  glaive: "1d10",
  greataxe: "1d12",
  greatsword: "2d6",
  "natural weapons": "1d6",
};

export const RANGED_WEAPONS = {
  none: null,
  sling: "1d4",
  "thrown dagger": "1d4",
  javelin: "1d6",
  shortbow: "1d6",
  "light crossbow": "1d8",
  longbow: "1d8",
  "heavy crossbow": "1d10",
};

// The eighteen 5e skills and the ability each is rolled on. Keep the names
// in step with roll-message.js's SKILLS (the player roller's list) so a
// skill reads the same whichever side rolls it.
export const SKILL_ABILITY = {
  Athletics: "STR",
  Acrobatics: "DEX",
  "Sleight of Hand": "DEX",
  Stealth: "DEX",
  Arcana: "INT",
  History: "INT",
  Investigation: "INT",
  Nature: "INT",
  Religion: "INT",
  "Animal Handling": "WIS",
  Insight: "WIS",
  Medicine: "WIS",
  Perception: "WIS",
  Survival: "WIS",
  Deception: "CHA",
  Intimidation: "CHA",
  Performance: "CHA",
  Persuasion: "CHA",
};
export const SKILLS = Object.keys(SKILL_ABILITY);

// One block per class. PLACEHOLDER values throughout - the shape is what
// matters:
// - abilities: a tier per ability, before the power level's shift.
// - skills: only the skills this class is *better at than its governing
//   ability would suggest* (a rogue's Stealth). Anything not listed rolls
//   on its ability's tier.
// - saves: the saves this class is proficient in (fortitude / reflex /
//   will), which add the proficiency bonus.
// - acBonus: passive, on top of BASE_AC and the power level's bonus.
// - meleeAbility: which ability its melee attacks roll on (ranged is
//   always DEX).
// - behavior: how this kind of enemy fights, for the combat DM to play to.
// - maxTier (optional): a ceiling on every ability and skill tier after the
//   power level's shift - how a class with no training stays modest even
//   at a high power level.
const T = { u: "untrained", t: "trained", e: "expert", m: "master" };
export const CLASSES = {
  fighter: {
    abilities: { STR: T.e, DEX: T.t, CON: T.e, INT: T.u, WIS: T.t, CHA: T.u },
    skills: { Athletics: T.m },
    saves: ["fortitude"],
    acBonus: 6,
    meleeAbility: "STR",
    behavior: "holds a line and trades blows; protects weaker allies and punishes anyone who breaks formation",
  },
  rogue: {
    abilities: { STR: T.u, DEX: T.e, CON: T.t, INT: T.t, WIS: T.t, CHA: T.t },
    skills: { Stealth: T.m, "Sleight of Hand": T.m, Deception: T.e },
    saves: ["reflex"],
    acBonus: 4,
    meleeAbility: "DEX",
    behavior: "avoids fair fights; strikes from hiding or a flank, then disengages",
  },
  barbarian: {
    abilities: { STR: T.m, DEX: T.t, CON: T.m, INT: T.u, WIS: T.u, CHA: T.u },
    skills: { Athletics: T.m, Intimidation: T.e },
    saves: ["fortitude"],
    acBonus: 4,
    meleeAbility: "STR",
    behavior: "charges the biggest threat and keeps swinging; ignores wounds that would stop anyone else",
  },
  monk: {
    abilities: { STR: T.t, DEX: T.m, CON: T.t, INT: T.u, WIS: T.e, CHA: T.u },
    skills: { Acrobatics: T.m, Insight: T.e },
    saves: ["reflex"],
    acBonus: 5,
    meleeAbility: "DEX",
    behavior: "fast and precise; closes, lands several blows, and is gone before the reply",
  },
  ranger: {
    abilities: { STR: T.t, DEX: T.e, CON: T.t, INT: T.u, WIS: T.e, CHA: T.u },
    skills: { Survival: T.m, Perception: T.m, Stealth: T.e },
    saves: ["reflex"],
    acBonus: 4,
    meleeAbility: "DEX",
    behavior: "keeps distance and shoots; uses terrain and cover, picks off the isolated",
  },
  paladin: {
    abilities: { STR: T.e, DEX: T.u, CON: T.e, INT: T.u, WIS: T.t, CHA: T.e },
    skills: { Religion: T.e, Persuasion: T.e },
    saves: ["will"],
    acBonus: 6,
    meleeAbility: "STR",
    behavior: "stands in front; hits hard, holds firm, and calls the fight on its own terms",
  },
  wizard: {
    abilities: { STR: T.u, DEX: T.t, CON: T.u, INT: T.m, WIS: T.t, CHA: T.u },
    skills: { Arcana: T.m, History: T.e, Investigation: T.e },
    saves: ["will"],
    acBonus: 2,
    meleeAbility: "DEX",
    behavior: "stays back behind others; opens with the biggest spell it has and controls the ground",
  },
  cleric: {
    abilities: { STR: T.t, DEX: T.u, CON: T.t, INT: T.u, WIS: T.m, CHA: T.t },
    skills: { Religion: T.m, Medicine: T.e, Insight: T.e },
    saves: ["will"],
    acBonus: 5,
    meleeAbility: "STR",
    behavior: "keeps allies standing first, then strikes; hard to move off its ground",
  },
  druid: {
    abilities: { STR: T.u, DEX: T.t, CON: T.t, INT: T.t, WIS: T.m, CHA: T.u },
    skills: { Nature: T.m, Survival: T.e, "Animal Handling": T.e },
    saves: ["will"],
    acBonus: 3,
    meleeAbility: "STR",
    behavior: "turns the terrain and its creatures against the party; avoids melee unless shapeshifted",
  },
  sorcerer: {
    abilities: { STR: T.u, DEX: T.t, CON: T.t, INT: T.u, WIS: T.u, CHA: T.m },
    skills: { Arcana: T.e, Intimidation: T.e },
    saves: ["fortitude"],
    acBonus: 2,
    meleeAbility: "DEX",
    behavior: "raw and reckless; burns through its strongest magic early and fast",
  },
  bard: {
    abilities: { STR: T.u, DEX: T.t, CON: T.u, INT: T.t, WIS: T.t, CHA: T.m },
    skills: { Persuasion: T.m, Deception: T.m, Performance: T.m },
    saves: ["reflex"],
    acBonus: 3,
    meleeAbility: "DEX",
    behavior: "talks, taunts, and bolsters its allies; fights only from behind them",
  },
  // Anyone with no training at all - farmers, merchants, servants,
  // innkeepers. The class for an NPC who isn't any of the others; chosen
  // by who they are, never by what they happen to be tested on. Modest
  // across the board and capped at trained, so a "boss" commoner (the
  // richest merchant in Kirinar) is shrewd, not superhuman.
  commoner: {
    abilities: { STR: T.t, DEX: T.u, CON: T.t, INT: T.u, WIS: T.t, CHA: T.u },
    skills: {},
    saves: [],
    acBonus: 0,
    meleeAbility: "STR",
    maxTier: "trained",
    behavior: "not a fighter; runs, hides, pleads, or swings wildly if cornered",
  },
  // Laria's homebrew class: the clan Wyrdkin - shamans, witches, seers.
  shaman: {
    abilities: { STR: T.u, DEX: T.u, CON: T.t, INT: T.t, WIS: T.m, CHA: T.e },
    skills: { Religion: T.m, Medicine: T.e, Insight: T.m },
    saves: ["will"],
    acBonus: 3,
    meleeAbility: "STR",
    behavior: "calls on spirits, curses, and the bound dead; keeps clansmen between itself and the party",
  },
};
const FALLBACK_CLASS = "fighter";

// How the classes read, for whoever has to pick one from the fiction - the
// narrative DM in start_combat (enemy-schema.js) and either DM in npc_check
// (mcp/server.js). One string so the two can't drift.
export const CLASS_DESCRIPTION =
  "fighter (the default for any trained soldier or guard), rogue, barbarian, monk, ranger, paladin, wizard, cleric, druid, sorcerer, bard, shaman (Laria's Wyrdkin - a clan's witch, seer, or dark sorcerer), or commoner (anyone with no training - farmers, merchants, servants). Pick the closest fit for who the NPC is and how they'd fight, even for creatures; pick it once per NPC, never per check.";

export const BASE_AC = 10;

function powerLevelOf(enemy) {
  const n = Number(enemy?.powerLevel);
  return POWER_LEVELS[n] ? n : FALLBACK_POWER_LEVEL;
}

function classOf(enemy) {
  return CLASSES[enemy?.class] ? enemy.class : FALLBACK_CLASS;
}

function shiftTier(tier, steps, maxTier) {
  const ceiling = maxTier ? ABILITY_TIERS.indexOf(maxTier) : ABILITY_TIERS.length - 1;
  const index = Math.max(0, Math.min(ceiling, ABILITY_TIERS.indexOf(tier) + steps));
  return ABILITY_TIERS[index];
}

// The tier this enemy holds in one ability after its power level's shift.
export function abilityTier(enemy, ability) {
  const cls = CLASSES[classOf(enemy)];
  return shiftTier(cls.abilities[ability] ?? "untrained", POWER_LEVELS[powerLevelOf(enemy)].abilityShift, cls.maxTier);
}

// The tier in one skill: the class's own entry if it has one (shifted the
// same way), else the governing ability's tier.
export function skillTier(enemy, skill) {
  const cls = CLASSES[classOf(enemy)];
  const own = cls.skills[skill];
  return own ? shiftTier(own, POWER_LEVELS[powerLevelOf(enemy)].abilityShift, cls.maxTier) : abilityTier(enemy, SKILL_ABILITY[skill]);
}

// The three bonuses the block and the lookups are built from. Each is the
// number added to 1d20. Pure and importable on their own, so the narrative
// side (npc_check) can use the same tables for an NPC outside a fight
// without going through the combat engine. `enemy` needs only
// { class, powerLevel }.
export function abilityBonus(enemy, ability) {
  return ABILITY_TIER_BONUS[abilityTier(enemy, ability)];
}

export function saveBonus(enemy, save) {
  const proficient = CLASSES[classOf(enemy)].saves.includes(save);
  return abilityBonus(enemy, SAVE_ABILITY[save]) + (proficient ? POWER_LEVELS[powerLevelOf(enemy)].proficiency : 0);
}

export function skillBonus(enemy, skill) {
  const tier = skillTier(enemy, skill);
  const proficient = tier !== "untrained";
  return ABILITY_TIER_BONUS[tier] + (proficient ? POWER_LEVELS[powerLevelOf(enemy)].proficiency : 0);
}

// Takes the whole enemy object from the handoff and returns its stat block.
// Tolerant of a missing or off-table value (falls back to an adept fighter
// with a shortsword and nothing to shoot) rather than failing the handoff
// over one bad field.
export function generateCoreStats(enemy) {
  const powerLevel = powerLevelOf(enemy);
  const cls = classOf(enemy);
  const level = POWER_LEVELS[powerLevel];
  const meleeWeapon = enemy?.meleeWeapon in MELEE_WEAPONS ? enemy.meleeWeapon : "shortsword";
  const rangedWeapon = enemy?.rangedWeapon in RANGED_WEAPONS ? enemy.rangedWeapon : "none";
  const ref = { class: cls, powerLevel };
  return {
    powerLevel: `${powerLevel} (${level.label})`,
    durability: level.durability,
    class: cls,
    behavior: CLASSES[cls].behavior,
    proficiency: level.proficiency,
    // What a player's attack roll must equal or beat.
    ac: BASE_AC + CLASSES[cls].acBonus + level.acBonus,
    // What the enemy rolls with (+ 1d20) against a player's AC. Damage is
    // rolled on a hit with the weapon used; the ability bonus is not added
    // to damage until the tables say otherwise.
    meleeWeapon,
    meleeAttack: abilityBonus(ref, CLASSES[cls].meleeAbility) + level.proficiency,
    meleeDamage: MELEE_WEAPONS[meleeWeapon],
    rangedWeapon,
    rangedAttack: rangedWeapon === "none" ? null : abilityBonus(ref, "DEX") + level.proficiency,
    rangedDamage: RANGED_WEAPONS[rangedWeapon],
    // One bonus per ability for checks, and one per save (fortitude /
    // reflex / will) against the players' spells and effects.
    abilities: Object.fromEntries(ABILITIES.map((a) => [a, abilityBonus(ref, a)])),
    saves: Object.fromEntries(SAVES.map((s) => [s, saveBonus(ref, s)])),
  };
}
