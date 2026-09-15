import { END_COMBAT_TOOL, UPDATE_ENEMY_STATUS_TOOL, ENEMY_STATUS_LADDER, validateOutcome } from "./tools.js";
import { loadCombatDmCore, buildCombatContext } from "./context.js";

// The combat DM: one call per combat turn, plus the forced end for the
// admin's manual override. Game-agnostic - everything about a particular
// game comes in through the `game` module (see README.md, "The game
// module contract"). See specs/combat-encounters.md §5.3.3.

// Generous: an Enemy Phase with several shooters is an attack roll, a damage
// roll, and a status note per enemy. The prompt tells the DM it can batch
// roll_dice calls, but a cautious model that makes them one at a time must
// not hit this wall mid-phase.
const MAX_TOOL_ROUNDTRIPS = 16;
const CACHE_CONTROL = { type: "ephemeral" };
const EMPTY_REPLY_FALLBACK = "The combat DM pauses, reading the field — ask again.";

// Same merge rule as the narrative side: the API needs alternating turns, but
// both players share role "user", so consecutive same-role rows fold into one
// turn with the sender prefixed.
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

// Turns a game's ad hoc lookup definition (§6: { name, description,
// input_schema, resolve }) into the tool the API sees. Every lookup takes an
// `enemy` name so the engine can find the right stat block; the rest of the
// schema is the game's.
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

function extractText(response) {
  return response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();
}

// `game` is the app's combat module: { loadSystemPrompt, adHocLookups } are
// what this uses (the rest of the module serves the router and the narrative
// side). `getMcpTools`/`callMcpTool` are the app's MCP client - its doc tools
// stay available to the combat DM as a rare escape hatch, and roll_dice is
// how every enemy roll happens.
export function createCombatGenerator({ client, model, getMcpTools, callMcpTool, game }) {
  const adHocLookups = game.adHocLookups ?? [];
  const lookupsByName = new Map(adHocLookups.map((l) => [l.name, l]));

  // Three tiers (§5.3.3): shared procedure + this game's mechanics (cached,
  // changes only when a prompt file is edited); the handoff (cached, changes
  // only when a lookup grows a stat block); the roster (uncached).
  function buildSystem({ context, roster }) {
    const system = [
      { type: "text", text: `${loadCombatDmCore()}\n\n${game.loadSystemPrompt()}`, cache_control: CACHE_CONTROL },
      { type: "text", text: buildCombatContext(context), cache_control: CACHE_CONTROL },
    ];
    if (roster) system.push({ type: "text", text: roster });
    return system;
  }

  async function buildTools() {
    const mcpTools = await getMcpTools();
    const tools = [...mcpTools, ...adHocLookups.map(lookupToolDef), UPDATE_ENEMY_STATUS_TOOL, END_COMBAT_TOOL];
    tools[tools.length - 1] = { ...tools[tools.length - 1], cache_control: CACHE_CONTROL };
    return tools;
  }

  function findEnemyIndex(context, name) {
    return context.enemies.findIndex((e) => e.name.toLowerCase() === String(name ?? "").trim().toLowerCase());
  }

  // Every write to an enemy during a fight - a lookup landing a number, the
  // DM's status note - goes through here: applied to the live context copy
  // so later tool calls in the same message see it, and returned as an
  // update (path relative to the enemy object) for the router to persist.
  function writeEnemy(context, enemyIndex, path, value) {
    setPath(context.enemies[enemyIndex], path, value);
    return { enemyIndex, path: Array.isArray(path) ? path.join(".") : String(path), value };
  }

  // Runs one lookup deterministically against the live context copy, so a
  // second call for the same value within the message reads what the first
  // one wrote. Returns the tool_result plus the update for the caller to
  // persist.
  function runLookup(lookup, input, context) {
    const enemyIndex = findEnemyIndex(context, input?.enemy);
    if (enemyIndex === -1) {
      return { result: { content: `No enemy named "${input?.enemy}" in this fight.`, isError: true }, update: null };
    }
    const enemy = context.enemies[enemyIndex];
    try {
      const { path, value } = lookup.resolve(enemy, input);
      const statPath = ["stats", ...(Array.isArray(path) ? path : String(path).split("."))];
      const update = writeEnemy(context, enemyIndex, statPath, value);
      return {
        result: { content: JSON.stringify({ enemy: enemy.name, [update.path.slice("stats.".length)]: value }), isError: false },
        update,
      };
    } catch (err) {
      return { result: { content: `Lookup failed: ${err.message}`, isError: true }, update: null };
    }
  }

  // The DM's notepad entry for one enemy (update_enemy_status).
  function runStatusUpdate(input, context) {
    const enemyIndex = findEnemyIndex(context, input?.enemy);
    if (enemyIndex === -1) {
      return { result: { content: `No enemy named "${input?.enemy}" in this fight.`, isError: true }, update: null };
    }
    if (!ENEMY_STATUS_LADDER.includes(input?.status)) {
      return { result: { content: `status must be one of ${ENEMY_STATUS_LADDER.join(", ")}`, isError: true }, update: null };
    }
    const note = typeof input?.note === "string" ? input.note.trim() : "";
    const condition = note ? { status: input.status, note } : { status: input.status };
    const update = writeEnemy(context, enemyIndex, "condition", condition);
    return { result: { content: JSON.stringify({ enemy: context.enemies[enemyIndex].name, ...condition }), isError: false }, update };
  }

  // One combat message. Returns { text, outcome, enemyUpdates }: `outcome` is
  // the validated end_combat input when the DM ended the fight (null
  // otherwise); `enemyUpdates` is every write to an enemy this message - a
  // lookup result under stats.*, or the DM's condition note - as
  // { enemyIndex, path, value } for the caller to persist into
  // combats.context.
  async function generateCombatReply({ context, history, roster, onDiceRoll = null }) {
    // Deep copy: lookups mutate stat blocks in place for the rest of this
    // message, and the caller persists them from enemyUpdates, not from here.
    const liveContext = structuredClone(context);
    const system = buildSystem({ context: liveContext, roster });
    const tools = await buildTools();
    const messages = toAnthropicMessages(history);
    if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
      // First turn of a fight (nothing said yet), or the API's first-message-
      // must-be-user rule after a dropped row: open the fight from the
      // handoff. Never persisted.
      messages.push({
        role: "user",
        content:
          "System: Open the fight. The opening action in the handoff is declared, not rolled: set the scene, decide who goes first from the fiction, and if it's the players, end by requesting the rolls that action needs.",
      });
    }
    if (messages.length > 1) {
      const idx = messages.length - 2;
      messages[idx] = { ...messages[idx], content: [{ type: "text", text: messages[idx].content, cache_control: CACHE_CONTROL }] };
    }

    const enemyUpdates = [];

    for (let round = 0; round < MAX_TOOL_ROUNDTRIPS; round++) {
      const response = await client.messages.create({ model, max_tokens: 1500, system, messages, tools });
      const toolUses = response.content.filter((block) => block.type === "tool_use");

      if (toolUses.length === 0) {
        return { text: extractText(response) || EMPTY_REPLY_FALLBACK, outcome: null, enemyUpdates };
      }

      const endCall = toolUses.find((t) => t.name === "end_combat");
      if (endCall) {
        const { errors, value } = validateOutcome(endCall.input);
        if (errors.length === 0) {
          return { text: extractText(response), outcome: value, enemyUpdates };
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
          if (toolUse.name === "update_enemy_status") {
            const { result, update } = runStatusUpdate(toolUse.input, liveContext);
            if (update) enemyUpdates.push(update);
            return { type: "tool_result", tool_use_id: toolUse.id, content: result.content, is_error: result.isError };
          }
          const lookup = lookupsByName.get(toolUse.name);
          if (lookup) {
            const { result, update } = runLookup(lookup, toolUse.input, liveContext);
            if (update) enemyUpdates.push(update);
            return { type: "tool_result", tool_use_id: toolUse.id, content: result.content, is_error: result.isError };
          }
          const result = await callMcpTool(toolUse.name, toolUse.input);
          return { type: "tool_result", tool_use_id: toolUse.id, content: result.content, is_error: result.isError ?? false };
        }),
      );
      messages.push({ role: "user", content: toolResults });
    }

    return { text: "The combat DM lost the thread mid-exchange — ask again.", outcome: null, enemyUpdates };
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
