import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Combat Encounters: the tools that cross the narrative/combat boundary in
// each direction, the validation and rendering of what crosses it, and the
// combat DM generator. See specs/combat-encounters.md. Everything
// game-specific (enemy stat tables, the app's combat mechanics prompt, the
// dice) comes in through createCombatGenerator's arguments.

const CORE_PROMPT_PATH = fileURLToPath(new URL("../prompts/combat-dm-core.md", import.meta.url));
const MAX_TOOL_ROUNDTRIPS = 8;
const CACHE_CONTROL = { type: "ephemeral" };

export const COMBAT_OUTCOMES = ["victory", "defeat", "escaped", "enemiesFled", "enemiesSurrendered", "standoff"];
// The spec writes this as true | false | partial; a three-value string enum
// is the same information in a shape JSON schema can express cleanly and
// the model can't half-satisfy.
export const OBJECTIVE_RESULTS = ["achieved", "failed", "partial"];
export const ENEMY_END_STATES = ["dead", "fled", "captured", "unconscious", "surrendered", "unharmed-and-gone"];

// Read fresh on every call, like every other prompt loader in this codebase,
// so editing the shared combat prompt takes effect on the next turn.
export function loadCombatDmCore() {
  return readFileSync(CORE_PROMPT_PATH, "utf-8").trim();
}

// ---------------------------------------------------------------------------
// start_combat - the narrative DM's terminal handoff (§5.1, §5.2)
// ---------------------------------------------------------------------------

// `statInputsSchema` is the app's own JSON-schema fragment for what its enemy
// stat tables consume (§6) - composed in here so the narrative DM is asked
// for exactly this game's inputs, no more. The shared fields never change.
export function buildStartCombatTool({ statInputsSchema }) {
  return {
    name: "start_combat",
    description:
      "Call this the instant violence actually begins - a weapon is used or anyone takes a hostile physical action. Not for threats, standoffs, or posturing. Your text before this call is the cut-in only: narrate up to the moment it breaks out and stop. Do not resolve any attack; the combat DM takes over from here. This ends your turn.",
    input_schema: {
      type: "object",
      required: ["location", "enemies", "circumstances", "objective", "openingAction"],
      properties: {
        location: {
          type: "string",
          description:
            "The battlefield, stated once and well: layout, cover, exits, light, distances between everyone. Combat is theatre-of-the-mind and this is all the combat DM has to work with.",
        },
        enemies: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            required: ["name", "description", "statInputs"],
            properties: {
              name: { type: "string", description: "Short, unique within this fight (e.g. 'Ganger with the shotgun', 'Reiko')." },
              description: { type: "string", description: "What the players can see: appearance, weapon, posture, where they are." },
              motive: { type: "string", description: "What this enemy wants out of the fight, if it matters (a named NPC's goal, a hired gun's price)." },
              notes: { type: "string", description: "Known abilities, personality, anything the combat DM needs to play them well. No campaign secrets." },
              statInputs: statInputsSchema,
            },
          },
        },
        circumstances: {
          type: "string",
          description:
            "Time pressure, noise or attention risk, reinforcements possible, environmental hazards - or 'isolated, inconsequential'.",
        },
        objective: {
          type: "string",
          description:
            "What the players are trying to achieve in this fight as best you can tell: escape, kill, capture alive, protect someone, hold a position. Not an exit condition - the fight runs until hostilities end.",
        },
        openingAction: {
          type: "string",
          description: "The players' declared action that started it, verbatim intent, UNRESOLVED. The combat DM's first turn resolves it.",
        },
      },
    },
  };
}

// Never throws: returns { errors, value }. `value` is the normalized handoff
// ready to be persisted as combats.context (minus stats, which the app's
// generateCoreStats adds afterwards).
export function validateHandoff(input) {
  const errors = [];
  const str = (v) => (typeof v === "string" ? v.trim() : "");

  const location = str(input?.location);
  const circumstances = str(input?.circumstances);
  const objective = str(input?.objective);
  const openingAction = str(input?.openingAction);
  if (!location) errors.push("location is required");
  if (!circumstances) errors.push("circumstances is required");
  if (!objective) errors.push("objective is required");
  if (!openingAction) errors.push("openingAction is required");

  const enemies = Array.isArray(input?.enemies) ? input.enemies : [];
  if (enemies.length === 0) errors.push("at least one enemy is required");
  const normalizedEnemies = enemies.map((e, i) => {
    const name = str(e?.name);
    const description = str(e?.description);
    if (!name) errors.push(`enemies[${i}].name is required`);
    if (!description) errors.push(`enemies[${i}].description is required`);
    if (!e?.statInputs || typeof e.statInputs !== "object") errors.push(`enemies[${i}].statInputs is required`);
    return {
      name,
      description,
      ...(str(e?.motive) ? { motive: str(e.motive) } : {}),
      ...(str(e?.notes) ? { notes: str(e.notes) } : {}),
      statInputs: e?.statInputs ?? {},
    };
  });
  const names = normalizedEnemies.map((e) => e.name.toLowerCase());
  if (new Set(names).size !== names.length) errors.push("enemy names must be unique within the fight");

  return {
    errors,
    value: { location, enemies: normalizedEnemies, circumstances, objective, openingAction },
  };
}

// ---------------------------------------------------------------------------
// end_combat - the combat DM's terminal outcome (§5.4)
// ---------------------------------------------------------------------------

export const END_COMBAT_TOOL = {
  name: "end_combat",
  description:
    "Call this only when hostilities have ended: no one is left both able and willing to fight the players (all enemies dead, incapacitated, fled, or surrendered), or the players have disengaged beyond reach or are all down, or both sides have genuinely stopped. The players meeting their objective does NOT end combat on its own. Narrate the wrap in your text, then call this. This ends your turn and the fight.",
  input_schema: {
    type: "object",
    required: ["outcome", "objectiveAchieved", "narrative", "partyStatus", "enemyStatus", "consequences"],
    properties: {
      outcome: { type: "string", enum: COMBAT_OUTCOMES, description: "How hostilities ended." },
      objectiveAchieved: {
        type: "string",
        enum: OBJECTIVE_RESULTS,
        description: "Whether the players' objective was met - independent of outcome. A victory can leave it failed; an escape can leave it achieved.",
      },
      narrative: {
        type: "string",
        description:
          "3-5 sentences, player-facing, narrative tone: that a fight occurred, its key moments, how it ended, and where everyone stands now. This becomes the message the players read back in the main story.",
      },
      partyStatus: {
        type: "array",
        items: {
          type: "object",
          required: ["name", "condition"],
          properties: {
            name: { type: "string" },
            condition: { type: "string", description: "In words. You do not track or state HP numbers - players own those." },
          },
        },
      },
      enemyStatus: {
        type: "array",
        items: {
          type: "object",
          required: ["name", "status"],
          properties: {
            name: { type: "string" },
            status: { type: "string", enum: ENEMY_END_STATES },
          },
        },
      },
      consequences: {
        type: "array",
        items: { type: "string" },
        description:
          "The circumstances that actually fired: alarm raised, noise heard, reinforcements inbound, time lost, a named NPC's fate. What the campaign needs to know. Empty if genuinely nothing.",
      },
    },
  },
};

export function validateOutcome(input) {
  const errors = [];
  const str = (v) => (typeof v === "string" ? v.trim() : "");

  const outcome = input?.outcome;
  const objectiveAchieved = input?.objectiveAchieved;
  const narrative = str(input?.narrative);
  if (!COMBAT_OUTCOMES.includes(outcome)) errors.push(`outcome must be one of ${COMBAT_OUTCOMES.join("/")}`);
  if (!OBJECTIVE_RESULTS.includes(objectiveAchieved)) {
    errors.push(`objectiveAchieved must be one of ${OBJECTIVE_RESULTS.join("/")}`);
  }
  if (!narrative) errors.push("narrative is required");

  const partyStatus = (Array.isArray(input?.partyStatus) ? input.partyStatus : [])
    .map((p) => ({ name: str(p?.name), condition: str(p?.condition) }))
    .filter((p) => p.name && p.condition);
  const enemyStatus = (Array.isArray(input?.enemyStatus) ? input.enemyStatus : [])
    .map((e) => ({ name: str(e?.name), status: ENEMY_END_STATES.includes(e?.status) ? e.status : "" }))
    .filter((e) => e.name && e.status);
  const consequences = (Array.isArray(input?.consequences) ? input.consequences : []).map(str).filter(Boolean);

  return {
    errors,
    value: { outcome, objectiveAchieved, narrative, partyStatus, enemyStatus, consequences },
  };
}

// ---------------------------------------------------------------------------
// Rendering: the handoff as a cached prompt tier, the outcome as a message
// ---------------------------------------------------------------------------

function renderStats(stats) {
  if (!stats || typeof stats !== "object" || Object.keys(stats).length === 0) return "(no stat block - look up what you need)";
  return Object.entries(stats)
    .map(([key, value]) => `${key}: ${typeof value === "object" ? JSON.stringify(value) : value}`)
    .join(", ");
}

function renderEnemy(enemy) {
  const lines = [`### ${enemy.name}`, enemy.description];
  if (enemy.motive) lines.push(`Motive: ${enemy.motive}`);
  if (enemy.notes) lines.push(`Notes: ${enemy.notes}`);
  const inputs = Object.entries(enemy.statInputs ?? {})
    .map(([k, v]) => `${k}: ${v}`)
    .join(", ");
  if (inputs) lines.push(`Type: ${inputs}`);
  lines.push(`Stats: ${renderStats(enemy.stats)}`);
  return lines.join("\n");
}

// The handoff, rendered for the combat DM. Cached as its own tier: it changes
// only when an ad hoc lookup grows a stat block (§5.3.3), which is rare by
// design.
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

// ---------------------------------------------------------------------------
// The combat DM generator (§5.3.3)
// ---------------------------------------------------------------------------

// Same merge rule as the narrative side: the API needs alternating turns, but
// both players share role "user", so consecutive same-role rows fold into one
// turn with the sender prefixed. Kept local rather than imported from an
// app's claude.js since that module is per-app.
function toAnthropicMessages(history) {
  const merged = [];
  for (const row of history) {
    const content = row.role === "user" ? `${row.sender}: ${row.content}` : row.content;
    const last = merged[merged.length - 1];
    if (last && last.role === row.role) {
      last.content += `\n${content}`;
    } else {
      merged.push({ role: row.role, content });
    }
  }
  return merged;
}

// Turns an app's ad hoc lookup definition (§6: { name, description,
// input_schema, resolve }) into the tool the API sees. Every lookup takes an
// `enemy` name so the server can find the right stat block; the rest of the
// schema is the app's.
function lookupToolDef(lookup) {
  return {
    name: lookup.name,
    description: lookup.description,
    input_schema: {
      type: "object",
      required: ["enemy", ...(lookup.input_schema?.required ?? [])],
      properties: {
        enemy: { type: "string", description: "The enemy's name exactly as it appears in the stat blocks." },
        ...(lookup.input_schema?.properties ?? {}),
      },
    },
  };
}

function setPath(target, path, value) {
  const keys = Array.isArray(path) ? path : String(path).split(".");
  let cursor = target;
  for (let i = 0; i < keys.length - 1; i++) {
    if (typeof cursor[keys[i]] !== "object" || cursor[keys[i]] === null) cursor[keys[i]] = {};
    cursor = cursor[keys[i]];
  }
  cursor[keys[keys.length - 1]] = value;
}

const EMPTY_REPLY_FALLBACK = "The combat DM pauses, reading the field — ask again.";

// `loadCombatSystemPrompt` returns the app's own combat mechanics prompt
// (tone + this game's numbers + its always-needed mechanical docs, §5.3.2).
// `buildPlayerRoster` is the app's existing roster builder, reused as-is.
// `adHocLookups` is the app's list from enemyStats.js (may be empty).
export function createCombatGenerator({
  client,
  model,
  getMcpTools,
  callMcpTool,
  loadCombatSystemPrompt,
  adHocLookups = [],
}) {
  const lookupsByName = new Map(adHocLookups.map((l) => [l.name, l]));

  function buildSystem({ context, roster }) {
    const system = [
      { type: "text", text: `${loadCombatDmCore()}\n\n${loadCombatSystemPrompt()}`, cache_control: CACHE_CONTROL },
      { type: "text", text: buildCombatContext(context), cache_control: CACHE_CONTROL },
    ];
    if (roster) system.push({ type: "text", text: roster });
    return system;
  }

  async function buildTools() {
    const mcpTools = await getMcpTools();
    const tools = [...mcpTools, ...adHocLookups.map(lookupToolDef), END_COMBAT_TOOL];
    tools[tools.length - 1] = { ...tools[tools.length - 1], cache_control: CACHE_CONTROL };
    return tools;
  }

  function extractText(response) {
    return response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("")
      .trim();
  }

  // Runs one lookup deterministically against the live context copy, so a
  // second call for the same value within the turn reads what the first one
  // wrote. Returns the tool_result plus the update for the caller to persist.
  function runLookup(lookup, input, context) {
    const enemyIndex = context.enemies.findIndex((e) => e.name.toLowerCase() === String(input?.enemy ?? "").trim().toLowerCase());
    if (enemyIndex === -1) {
      return { result: { content: `No enemy named "${input?.enemy}" in this fight.`, isError: true }, update: null };
    }
    const enemy = context.enemies[enemyIndex];
    try {
      const { path, value } = lookup.resolve(enemy, input);
      enemy.stats = enemy.stats ?? {};
      setPath(enemy.stats, path, value);
      return {
        result: { content: JSON.stringify({ enemy: enemy.name, [Array.isArray(path) ? path.join(".") : path]: value }), isError: false },
        update: { enemyIndex, path: Array.isArray(path) ? path.join(".") : String(path), value },
      };
    } catch (err) {
      return { result: { content: `Lookup failed: ${err.message}`, isError: true }, update: null };
    }
  }

  // One combat turn. Returns { text, outcome, statUpdates }: `outcome` is the
  // validated end_combat input when the DM ended the fight this turn (null
  // otherwise); `statUpdates` is every lookup that landed, for the caller to
  // persist into combats.context.
  async function generateCombatReply({ context, history, roster, onDiceRoll = null }) {
    // Deep copy: lookups mutate stat blocks in place for the rest of this
    // turn, and the caller persists them from statUpdates, not from here.
    const liveContext = structuredClone(context);
    const system = buildSystem({ context: liveContext, roster });
    const tools = await buildTools();
    const messages = toAnthropicMessages(history);
    if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
      // First turn of a fight (nothing said yet), or the API's first-message-
      // must-be-user rule after a dropped row: open the fight from the
      // handoff. Never persisted.
      messages.push({ role: "user", content: "System: Open the fight. Resolve the opening action from the handoff." });
    }
    if (messages.length > 1) {
      const idx = messages.length - 2;
      messages[idx] = { ...messages[idx], content: [{ type: "text", text: messages[idx].content, cache_control: CACHE_CONTROL }] };
    }

    const statUpdates = [];

    for (let round = 0; round < MAX_TOOL_ROUNDTRIPS; round++) {
      const response = await client.messages.create({ model, max_tokens: 1500, system, messages, tools });
      const toolUses = response.content.filter((block) => block.type === "tool_use");

      if (toolUses.length === 0) {
        return { text: extractText(response) || EMPTY_REPLY_FALLBACK, outcome: null, statUpdates };
      }

      const endCall = toolUses.find((t) => t.name === "end_combat");
      if (endCall) {
        const { errors, value } = validateOutcome(endCall.input);
        if (errors.length === 0) {
          return { text: extractText(response), outcome: value, statUpdates };
        }
        // Incomplete - reject it as a tool error and let the DM retry with
        // the full content rather than silently accepting a partial outcome.
        // Any other tool calls in the same response are dropped: the fight
        // is ending, rolls no longer matter.
        messages.push({ role: "assistant", content: response.content });
        messages.push({
          role: "user",
          content: toolUses.map((t) =>
            t.id === endCall.id
              ? { type: "tool_result", tool_use_id: t.id, content: `Incomplete - ${errors.join("; ")}. Call end_combat again with every field.`, is_error: true }
              : { type: "tool_result", tool_use_id: t.id, content: "Skipped - the fight is ending.", is_error: true },
          ),
        });
        continue;
      }

      messages.push({ role: "assistant", content: response.content });
      if (onDiceRoll && toolUses.some((t) => t.name === "roll_dice")) onDiceRoll();

      const toolResults = await Promise.all(
        toolUses.map(async (toolUse) => {
          const lookup = lookupsByName.get(toolUse.name);
          if (lookup) {
            const { result, update } = runLookup(lookup, toolUse.input, liveContext);
            if (update) statUpdates.push(update);
            return { type: "tool_result", tool_use_id: toolUse.id, content: result.content, is_error: result.isError };
          }
          const result = await callMcpTool(toolUse.name, toolUse.input);
          return { type: "tool_result", tool_use_id: toolUse.id, content: result.content, is_error: result.isError ?? false };
        }),
      );
      messages.push({ role: "user", content: toolResults });
    }

    return { text: "The combat DM lost the thread mid-exchange — ask again.", outcome: null, statUpdates };
  }

  // Manual admin override (§5.4): end_combat forced, no other tools. For the
  // DM that keeps fighting past the point of sense.
  async function generateCombatEnd({ context, history, roster }) {
    const system = buildSystem({ context, roster });
    const messages = toAnthropicMessages(history);
    messages.push({
      role: "user",
      content:
        "System: The admin has declared this combat over. From the transcript above, produce the end_combat outcome now - how hostilities stand, who is where, and what the campaign needs to know. If the transcript doesn't settle how it ended, treat it as a standoff.",
    });
    const response = await client.messages.create({
      model,
      max_tokens: 1500,
      system,
      messages,
      tools: [END_COMBAT_TOOL],
      tool_choice: { type: "tool", name: "end_combat" },
    });
    const call = response.content.find((block) => block.type === "tool_use" && block.name === "end_combat");
    if (!call) throw new Error("Combat end produced no end_combat call");
    const { errors, value } = validateOutcome(call.input);
    if (errors.length > 0) throw new Error(`Combat end returned an invalid outcome: ${errors.join("; ")}`);
    return { text: extractText(response), outcome: value };
  }

  return { generateCombatReply, generateCombatEnd };
}
