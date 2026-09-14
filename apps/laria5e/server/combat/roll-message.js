import { rollD20Check, rollDamage, formatModifier } from "../../mcp/dice.js";

// Mirrors client/src/DiceRoller.jsx's SKILLS - kept in sync manually.
// Server-side re-check regardless of what the client claims, per this
// project's established server-side-enforcement pattern.
const SKILLS = [
  "Athletics",
  "Acrobatics",
  "Sleight of Hand",
  "Stealth",
  "Arcana",
  "History",
  "Investigation",
  "Nature",
  "Religion",
  "Animal Handling",
  "Insight",
  "Medicine",
  "Perception",
  "Survival",
  "Deception",
  "Intimidation",
  "Performance",
  "Persuasion",
];
// Mirrors client/src/DiceRoller.jsx's ABILITIES - same sync-manually pattern.
const ABILITIES = ["Strength", "Dexterity", "Constitution", "Intelligence", "Wisdom", "Charisma"];
const ADVANTAGE_STATES = ["adv", "flat", "dis"];
const DAMAGE_DIE_SIDES = [4, 6, 8, 10, 12, 20];
const MAX_ROLL_DESCRIPTION_LENGTH = 80;

// Skill/Attack rolls: 1d20 flat, or 2d20 (advantage/disadvantage) keeping
// the higher/lower - crit (nat 20) and fumble (nat 1) read off the kept die
// only, called out in the text but with no effect on the numeric total. The
// breakdown always shows just the kept die; which die that was (and why)
// is conveyed by the "(Advantage)"/"(Disadvantage)" suffix on the label
// instead of by also listing the discarded roll.
function formatSkillAttackMessage({ label, kept, advantage, modifier, isCrit, isFumble }) {
  const advSuffix = advantage === "adv" ? " (Advantage)" : advantage === "dis" ? " (Disadvantage)" : "";
  const critNote = isCrit ? " - Critical Success!" : isFumble ? " - Critical Failure!" : "";
  return `${label}${advSuffix} - Rolled ${kept + modifier}! (d20 [${kept}]${formatModifier(modifier)})${critNote}`;
}

// Damage and Misc rolls share this shape: one or more dice rows (e.g. 2d6 +
// 1d8), each independently doubled when Crit is on (rolls.length per row
// already reflects that; Misc rolls never pass crit: true, since there's no
// crit concept for an arbitrary roll) - the modifier is still added only
// once across the whole roll, however many rows there are. `label` is the
// fixed word "Damage" for a Damage Roll, or the player's own free-text
// description for a Misc Roll.
function formatDiceRowsMessage({ label, rowResults, modifier, crit }) {
  const critPrefix = crit ? "CRIT · " : "";
  const rowsText = rowResults.map((r) => `${r.rolls.length}d${r.sides} [${r.rolls.join(", ")}]`).join(" + ");
  const total = rowResults.flatMap((r) => r.rolls).reduce((a, b) => a + b, 0) + modifier;
  return `${label} — Rolled ${total}! (${critPrefix}${rowsText}${formatModifier(modifier)})`;
}

// Validates a roll request body and performs the roll, returning the message
// text to post - { content } - or { error } for a 400. Shared by the
// narrative /:id/roll route and the combat /combats/:id/roll route so a roll
// reads identically wherever it lands (specs/combat-encounters.md §5.3).
export function buildRollMessage({ rollType, skill, ability, advantage, diceRows, crit, description, modifier } = {}) {
  if (!["skill", "attack", "save", "damage", "misc"].includes(rollType)) {
    return { error: "Invalid roll type" };
  }
  const mod = Number.isInteger(modifier) ? modifier : 0;

  if (rollType === "damage" || rollType === "misc") {
    const isMisc = rollType === "misc";
    let label = "Damage";
    if (isMisc) {
      const trimmedDescription = typeof description === "string" ? description.trim() : "";
      if (!trimmedDescription) {
        return { error: "A roll type description is required" };
      }
      if (trimmedDescription.length > MAX_ROLL_DESCRIPTION_LENGTH) {
        return { error: `Roll type description must be ${MAX_ROLL_DESCRIPTION_LENGTH} characters or fewer` };
      }
      label = trimmedDescription;
    }
    if (!Array.isArray(diceRows) || diceRows.length === 0) {
      return { error: "At least one dice row is required" };
    }
    const parsedRows = [];
    for (const row of diceRows) {
      const sides = Number(row?.dieType);
      const count = Number(row?.count);
      if (!DAMAGE_DIE_SIDES.includes(sides)) {
        return { error: "A valid die type is required for every dice row" };
      }
      if (!Number.isInteger(count) || count < 1 || count > 20) {
        return { error: "Dice count must be a whole number from 1 to 20 for every dice row" };
      }
      parsedRows.push({ count, sides });
    }
    // Misc rolls never crit - there's no crit concept for an arbitrary
    // player-described roll, so isCrit is forced false regardless of
    // whatever the request body claims for a non-damage roll type.
    const isCrit = !isMisc && crit === true;
    const rowResults = parsedRows.map(({ count, sides }) => ({ ...rollDamage(count, sides, isCrit), sides }));
    return { content: formatDiceRowsMessage({ label, rowResults, modifier: mod, crit: isCrit }) };
  }

  const isSkill = rollType === "skill";
  const isSave = rollType === "save";
  if (isSkill && !SKILLS.includes(skill)) {
    return { error: "A valid skill is required" };
  }
  if (isSave && !ABILITIES.includes(ability)) {
    return { error: "A valid ability is required" };
  }
  const label = isSkill ? skill : isSave ? `${ability} Save` : "Attack";
  const adv = ADVANTAGE_STATES.includes(advantage) ? advantage : "flat";
  const { kept, isCrit, isFumble } = rollD20Check(adv);
  return { content: formatSkillAttackMessage({ label, kept, advantage: adv, modifier: mod, isCrit, isFumble }) };
}
