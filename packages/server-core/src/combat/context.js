import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { gameFieldsOf } from "./tools.js";

// Everything the combat DM reads that isn't the transcript: the shared
// combat prompt, the handoff rendered as a cached prompt tier, and the
// outcome rendered as the one message that replaces the fight in the main
// chapter. See specs/combat-encounters.md §5.3.3 / §5.4.

const CORE_PROMPT_PATH = fileURLToPath(new URL("../../prompts/combat-dm-core.md", import.meta.url));

// Read fresh on every call, like every other prompt loader in this codebase,
// so editing the shared combat prompt takes effect on the next turn.
export function loadCombatDmCore() {
  return readFileSync(CORE_PROMPT_PATH, "utf-8").trim();
}

function renderValue(value) {
  return typeof value === "object" && value !== null ? JSON.stringify(value) : String(value);
}

function renderStats(stats) {
  if (!stats || typeof stats !== "object" || Object.keys(stats).length === 0) return "(no stat block - look up what you need)";
  return Object.entries(stats)
    .map(([key, value]) => `${key}: ${renderValue(value)}`)
    .join(", ");
}

function renderEnemy(enemy) {
  const lines = [`### ${enemy.name}`, enemy.description];
  if (enemy.motive) lines.push(`Motive: ${enemy.motive}`);
  if (enemy.notes) lines.push(`Notes: ${enemy.notes}`);
  // The game's own fields (tier, creature type, whatever its schema asked
  // the narrative DM for) - rendered without the engine knowing their names.
  const kind = Object.entries(gameFieldsOf(enemy))
    .map(([k, v]) => `${k}: ${renderValue(v)}`)
    .join(", ");
  if (kind) lines.push(`Type: ${kind}`);
  lines.push(`Stats: ${renderStats(enemy.stats)}`);
  return lines.join("\n");
}

// The handoff, rendered for the combat DM. Cached as its own tier: it changes
// only when an ad hoc lookup grows a stat block, which is rare by design.
export function buildCombatContext(context) {
  return `# This Fight
Everything below was handed to you by the narrative DM the moment violence broke out. It is the whole of what you know about this fight; nothing outside it is yours to manage.

## Battlefield
${context.location}

## Enemies
${context.enemies.map(renderEnemy).join("\n\n")}

Every enemy number you use must come from the stat block above or from a lookup tool. Never estimate one, and never state one you weren't given.

## Circumstances
${context.circumstances}

## The players' objective
${context.objective}
(Not an exit condition. If they achieve it while hostilities continue, note it, expect their goal to shift, and keep running phases until hostilities actually end.)

## Opening action (unresolved - your first turn resolves this)
${context.openingAction}`;
}

const OUTCOME_LABELS = {
  victory: "Victory",
  defeat: "Defeat",
  escaped: "The party escaped",
  enemiesFled: "The enemies fled",
  enemiesSurrendered: "The enemies surrendered",
  standoff: "Standoff",
};
const OBJECTIVE_LABELS = { achieved: "achieved", failed: "not achieved", partial: "partially achieved" };

// The one ordinary DM message that replaces the whole combat transcript in
// the main chapter: player-facing narrative, then a compact status block so
// the next narrative turn (and the Situation pass) has the facts.
export function renderCombatOutcome(summary) {
  const lines = [summary.narrative.trim(), ""];
  lines.push(`**Outcome:** ${OUTCOME_LABELS[summary.outcome] ?? summary.outcome} — objective ${OBJECTIVE_LABELS[summary.objectiveAchieved] ?? summary.objectiveAchieved}.`);
  if (summary.partyStatus.length > 0) {
    lines.push(`**Party:** ${summary.partyStatus.map((p) => `${p.name} — ${p.condition}`).join("; ")}.`);
  }
  if (summary.enemyStatus.length > 0) {
    lines.push(`**Enemies:** ${summary.enemyStatus.map((e) => `${e.name} — ${e.status.replace(/-/g, " ")}`).join("; ")}.`);
  }
  if (summary.consequences.length > 0) {
    lines.push(`**Consequences:** ${summary.consequences.join("; ")}.`);
  }
  return lines.join("\n");
}
