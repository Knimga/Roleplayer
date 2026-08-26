import { randomInt } from "node:crypto";

export function rollDie(sides) {
  return randomInt(1, sides + 1);
}

// A single d20 check (skill or attack roll) — 1 die at flat, 2 at
// advantage/disadvantage, keeping the higher or lower respectively. Crit
// (natural 20) and fumble (natural 1) are read off the KEPT die, not either
// raw roll — e.g. an advantage roll of [14, 20] crits (the 20 is what's
// actually used) while a disadvantage roll of [1, 15] fumbles (the 1 is
// kept), even though the other die in each pair didn't land on 20/1.
export function rollD20Check(advantage) {
  const a = rollDie(20);
  if (advantage !== "adv" && advantage !== "dis") {
    return { rolls: [a], kept: a, isCrit: a === 20, isFumble: a === 1 };
  }
  const b = rollDie(20);
  const kept = advantage === "adv" ? Math.max(a, b) : Math.min(a, b);
  return { rolls: [a, b], kept, isCrit: kept === 20, isFumble: kept === 1 };
}

// A sum of numDice dice of the given sides — used for damage rolls and for
// generic NPC/enemy rolls. `crit` doubles the number of dice rolled (never
// the modifier — callers add that once, on top of `sum`), per 5e's
// critical-hit rule.
export function rollDamage(numDice, sides, crit = false) {
  const n = crit ? numDice * 2 : numDice;
  const rolls = Array.from({ length: n }, () => rollDie(sides));
  return { rolls, sum: rolls.reduce((a, b) => a + b, 0) };
}

// " + n" / " − n" (U+2212 minus, not a hyphen), or "" when 0.
export function formatModifier(modifier) {
  if (modifier === 0) return "";
  return modifier > 0 ? ` + ${modifier}` : ` − ${Math.abs(modifier)}`;
}
