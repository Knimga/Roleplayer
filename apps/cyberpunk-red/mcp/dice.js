import { randomInt } from "node:crypto";

export function rollDie(sides) {
  return randomInt(1, sides + 1);
}

// The classic Cyberpunk Red skill-check shape (1d10) crits: a natural 10
// explodes and adds, a natural 1 explodes and subtracts. No other dice
// shape (e.g. Nd6 damage) has a crit concept in CPR's rules.
export function rollSkillCheck() {
  const rolls = [rollDie(10)];
  if (rolls[0] === 10) {
    let next = rollDie(10);
    rolls.push(next);
    while (next === 10) {
      next = rollDie(10);
      rolls.push(next);
    }
    return { rolls, diceTotal: rolls.reduce((a, b) => a + b, 0), critResult: "success" };
  }
  if (rolls[0] === 1) {
    let next = rollDie(10);
    rolls.push(next);
    while (next === 1) {
      next = rollDie(10);
      rolls.push(next);
    }
    const diceTotal = rolls[0] - rolls.slice(1).reduce((a, b) => a + b, 0);
    return { rolls, diceTotal, critResult: "failure" };
  }
  return { rolls, diceTotal: rolls[0], critResult: null };
}

export function rollGeneric(numDice, sides) {
  const rolls = Array.from({ length: numDice }, () => rollDie(sides));
  return { rolls, diceTotal: rolls.reduce((a, b) => a + b, 0), critResult: null };
}

export function formatModifier(modifier) {
  if (modifier === 0) return "";
  return modifier > 0 ? ` + ${modifier}` : ` - ${Math.abs(modifier)}`;
}

export function formatDiceBreakdown(rolls, sides, critResult) {
  if (critResult === "success") {
    return rolls.map((r) => `1d10 (${r})`).join(" + ");
  }
  if (critResult === "failure") {
    return `1d10 (${rolls[0]})` + rolls.slice(1).map((r) => ` - 1d10 (${r})`).join("");
  }
  return `${rolls.length}d${sides} (${rolls.join("+")})`;
}
