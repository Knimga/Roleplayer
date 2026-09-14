import { rollSkillCheck, rollGeneric, formatModifier, formatDiceBreakdown } from "../../mcp/dice.js";

// Server-side source of truth for what a roll type needs and looks like -
// the frontend's disabled ROLL button is a convenience, this is the guard.
const ROLL_TYPES = {
  SKILL_CHECK: { label: "SKILL CHECK", sides: 10, requiresFreeText: true },
  SKILL_CHECK_OPPOSING: { label: "SKILL CHECK (OPPOSING)", sides: 10, requiresFreeText: true },
  ATTACK_MELEE: { label: "ATTACK ROLL (MELEE)", sides: 10, requiresFreeText: true },
  ATTACK_RANGED: { label: "ATTACK ROLL (RANGED)", sides: 10, requiresFreeText: true },
  DAMAGE: { label: "DAMAGE ROLL", sides: 6, requiresFreeText: true, requiresNumDice: true },
  DEFENSE_MELEE: { label: "DEFENSE ROLL (MELEE)", sides: 10, requiresFreeText: false },
};

// Validates a roll request body and performs the roll, returning the message
// text to post - { content } - or { error } for a 400. Shared by the
// narrative /:id/roll route and the combat /combats/:id/roll route so a roll
// reads identically wherever it lands (specs/combat-encounters.md §5.3).
export function buildRollMessage({ rollType, modifier, freeText, numDice } = {}) {
  const rollDef = ROLL_TYPES[rollType];
  if (!rollDef) {
    return { error: "Invalid roll type" };
  }
  if (typeof modifier !== "number" || !Number.isInteger(modifier)) {
    return { error: "A modifier is required" };
  }
  if (rollDef.requiresFreeText && (typeof freeText !== "string" || !freeText.trim())) {
    return { error: "This roll requires a weapon/skill description" };
  }
  if (rollDef.requiresNumDice && (typeof numDice !== "number" || !Number.isInteger(numDice) || numDice < 1)) {
    return { error: "Number of d6 is required for a damage roll" };
  }

  const effectiveNumDice = rollDef.requiresNumDice ? numDice : 1;
  const isSkillCheckShape = effectiveNumDice === 1 && rollDef.sides === 10;
  const { rolls, diceTotal, critResult } = isSkillCheckShape ? rollSkillCheck() : rollGeneric(effectiveNumDice, rollDef.sides);
  const total = diceTotal + modifier;

  const critSuffix = critResult === "success" ? " CRITICAL SUCCESS!" : critResult === "failure" ? " CRITICAL FAILURE!" : "";
  const freeTextPart = rollDef.requiresFreeText ? ` (${freeText.trim()})` : "";
  const breakdown = formatDiceBreakdown(rolls, rollDef.sides, critResult);
  return { content: `${rollDef.label}${freeTextPart} - ROLLED ${total}!${critSuffix} (${breakdown}${formatModifier(modifier)})` };
}
