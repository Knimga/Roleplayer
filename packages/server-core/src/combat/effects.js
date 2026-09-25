import { randomInt } from "node:crypto";

// Lasting effects on enemies - a spell's paralysis, a fire that keeps
// burning - tracked by the engine instead of the combat DM's memory.
//
// Prompt-only bookkeeping (the DM writing "burning 1d6 - 3 rounds left" in
// its update_enemy_status note and counting it down each phase) measured
// about two in three in live runs: the model forgot to record the effect,
// rolled the tick late, or never decremented it. So the DM now does two
// simple things and the engine does the rest:
//
//   apply_effect  - when an effect takes hold. Stored on the enemy as
//                   structured data (enemy.effects), rendered in its stat
//                   block every message, untouched by note rewrites.
//   tick_effects  - once at the start of every Enemy Phase. The engine
//                   rolls every ongoing die, counts every effect down, and
//                   drops expired ones, then reports what happened.
//
// Games opt in with `lastingEffects: true` on their combat module (Laria);
// without it neither tool is offered.

// "1d6", "2d6+1", "1d6 fire", "1d8 + 2 radiant" - the same dice shape the
// spell editor validates. Bounded so a typo can't roll a thousand dice.
const DICE_PATTERN = /^([1-9]\d?)d(4|6|8|10|12|20)(?:\s*([+-])\s*(\d{1,2}))?(?:\s+([a-z][a-z -]{0,19}))?$/i;
const MAX_ROUNDS = 20;

export const APPLY_EFFECT_TOOL = {
  name: "apply_effect",
  description:
    "Record a lasting effect that just took hold on an enemy - a spell's condition, ongoing damage, or both - so the engine tracks it for you. Call it the moment the effect lands (the failed save, the confirmed hit, or a no-roll spell), before narrating it. Don't call it when a save negated the spell. Casting the same effect on the same enemy again replaces it.",
  input_schema: {
    type: "object",
    required: ["enemy", "name", "effect"],
    properties: {
      enemy: { type: "string", description: "The enemy's name exactly as it appears in the stat blocks." },
      name: { type: "string", description: "What caused it, e.g. the spell's name: 'Immolate'." },
      effect: { type: "string", description: "What it does to the enemy, briefly: 'burning', 'paralyzed', 'STR -2'." },
      ongoing: {
        type: "string",
        description: "Damage dealt again at the start of each Enemy Phase, e.g. '1d6 fire' - the spell's Ongoing: line. Omit if none.",
      },
      rounds: {
        type: "integer",
        minimum: 1,
        maximum: MAX_ROUNDS,
        description:
          "How many Enemy Phases it lasts, from the spell's Duration: line (a minute is 10). The phase it lands in doesn't count. Omit only for 'until the fight ends'.",
      },
    },
  },
};

export const TICK_EFFECTS_TOOL = {
  name: "tick_effects",
  description:
    "Call once at the very start of every Enemy Phase, before any enemy acts, whenever any enemy's stat block shows a lasting effect. The engine rolls each ongoing damage die, counts every effect down one round, and removes the ones that just ended, then tells you what happened: narrate those ticks as the phase's first beat, and advance each enemy's status (update_enemy_status) for the damage it took.",
  input_schema: { type: "object", properties: {} },
};

function rollDice(spec) {
  const m = DICE_PATTERN.exec(spec.trim());
  const count = Number(m[1]);
  const sides = Number(m[2]);
  const modifier = m[3] ? (m[3] === "-" ? -1 : 1) * Number(m[4]) : 0;
  const rolls = Array.from({ length: count }, () => randomInt(1, sides + 1));
  const total = Math.max(0, rolls.reduce((a, b) => a + b, 0) + modifier);
  const type = m[5] ? ` ${m[5]}` : "";
  const mod = modifier ? ` ${modifier > 0 ? "+" : "-"} ${Math.abs(modifier)}` : "";
  return { total, breakdown: `${count}d${sides} [${rolls.join(", ")}]${mod}`, type };
}

const fail = (content) => ({ result: { content, isError: true }, updates: [] });

// Both return { result: { content, isError }, updates: [{ enemyIndex, path,
// value }] } - updates go through the same persist path as every other
// per-enemy write (see generator.js writeEnemy / router.js).
export function runApplyEffect(input, context, findEnemyIndex) {
  const enemyIndex = findEnemyIndex(context, input?.enemy);
  if (enemyIndex === -1) return fail(`No enemy named "${input?.enemy}" in this fight.`);
  const name = typeof input?.name === "string" ? input.name.trim() : "";
  const effect = typeof input?.effect === "string" ? input.effect.trim() : "";
  if (!name || !effect) return fail("name and effect are required.");
  const ongoing = typeof input?.ongoing === "string" && input.ongoing.trim() ? input.ongoing.trim() : null;
  if (ongoing && !DICE_PATTERN.test(ongoing)) return fail(`ongoing must be dice like "1d6 fire", not "${ongoing}".`);
  const rounds = input?.rounds ?? null;
  if (rounds !== null && !(Number.isInteger(rounds) && rounds >= 1 && rounds <= MAX_ROUNDS)) {
    return fail(`rounds must be a whole number from 1 to ${MAX_ROUNDS}, or omitted for "until the fight ends".`);
  }

  const enemy = context.enemies[enemyIndex];
  const entry = { name, effect, ...(ongoing ? { ongoing } : {}), roundsLeft: rounds };
  const effects = [...(enemy.effects ?? []).filter((e) => e.name.toLowerCase() !== name.toLowerCase()), entry];
  enemy.effects = effects;
  return {
    result: { content: JSON.stringify({ enemy: enemy.name, recorded: entry }), isError: false },
    updates: [{ enemyIndex, path: "effects", value: effects }],
  };
}

export function runTickEffects(context) {
  const lines = [];
  const updates = [];
  context.enemies.forEach((enemy, enemyIndex) => {
    const effects = enemy.effects ?? [];
    if (effects.length === 0) return;
    // A dead enemy's effects end with it; nothing to roll.
    if (enemy.condition?.status === "dead") {
      enemy.effects = [];
      updates.push({ enemyIndex, path: "effects", value: [] });
      return;
    }
    const remaining = [];
    for (const e of effects) {
      const parts = [`${enemy.name} - ${e.name} (${e.effect})`];
      if (e.ongoing) {
        const roll = rollDice(e.ongoing);
        parts.push(`${roll.total}${roll.type} damage (${roll.breakdown})`);
      }
      if (e.roundsLeft === null || e.roundsLeft === undefined) {
        parts.push("lasts until the fight ends");
        remaining.push(e);
      } else if (e.roundsLeft - 1 <= 0) {
        parts.push("ENDS now - this was its last round");
      } else {
        const left = e.roundsLeft - 1;
        parts.push(`${left} round${left === 1 ? "" : "s"} left`);
        remaining.push({ ...e, roundsLeft: left });
      }
      lines.push(parts.join(": "));
    }
    enemy.effects = remaining;
    updates.push({ enemyIndex, path: "effects", value: remaining });
  });
  const content = lines.length > 0 ? lines.join("\n") : "No enemy has a lasting effect - nothing to tick.";
  return { result: { content, isError: false }, updates };
}

// One line for the stat block render (context.js).
export function renderEffects(effects) {
  if (!Array.isArray(effects) || effects.length === 0) return null;
  return effects
    .map((e) => {
      const tick = e.ongoing ? `, ${e.ongoing} at the start of each Enemy Phase` : "";
      const left = e.roundsLeft === null || e.roundsLeft === undefined ? "until the fight ends" : `${e.roundsLeft} round${e.roundsLeft === 1 ? "" : "s"} left`;
      return `${e.name} - ${e.effect}${tick} (${left})`;
    })
    .join("; ");
}
