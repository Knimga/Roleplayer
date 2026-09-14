import "dotenv/config";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { users } from "@roleplayer/server-core/users.js";
import { createChapterSummaryGenerator } from "@roleplayer/server-core/chapterSummary.js";
import { createBlueprintGenerator, buildBlueprintContext, buildSituationContext } from "@roleplayer/server-core/blueprint.js";
import { createSituationPass } from "@roleplayer/server-core/situationPass.js";
import { createLeakCheckPass } from "@roleplayer/server-core/leakCheck.js";
import { loadDmSystemPromptCore } from "@roleplayer/server-core/dmSystemPromptCore.js";
import { buildStartCombatTool, validateHandoff, createCombatGenerator } from "@roleplayer/server-core/combat/index.js";
import { getMcpTools, callMcpTool } from "./mcpClient.js";
import { combatGame } from "../combat/index.js";

const MAX_TOOL_ROUNDTRIPS = 5;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Render sets NODE_ENV=production explicitly (see specs/render-hosting.md);
// locally it's unset, so this defaults to Sonnet in dev and Opus in prod without
// needing a dedicated env var. ANTHROPIC_MODEL overrides either default if needed.
const MODEL =
  process.env.ANTHROPIC_MODEL || (process.env.NODE_ENV === "production" ? "claude-opus-5" : "claude-sonnet-5");
// Cheap and fast on purpose - shared by the situation and leak-check passes
// (see situation-pass.md / leak-check-pass.md): bounded, structured
// judgments, not narration or open-ended reasoning.
const REVIEW_PASS_MODEL = process.env.ANTHROPIC_REVIEW_PASS_MODEL || "claude-haiku-4-5-20251001";
// Milestone advancement is irreversible, so when the cheap pass proposes one
// the rewrite is re-run on this model and its verdict is what's used (see
// specs/campaign-situation.md §4.2). Always Sonnet, no dev/prod branch.
const SITUATION_ESCALATION_MODEL = process.env.ANTHROPIC_SITUATION_ESCALATION_MODEL || "claude-sonnet-5";
// Always Sonnet, no dev/prod branch - Blueprint creation is a one-off,
// infrequent, admin-triggered generation, not a per-turn cost like
// narration, so the Opus-in-prod tiering MODEL otherwise uses doesn't apply
// here.
const BLUEPRINT_MODEL = process.env.ANTHROPIC_BLUEPRINT_MODEL || "claude-sonnet-5";
// Always Sonnet, no dev/prod branch (specs/combat-encounters.md §5.3.3 and
// its Open Questions): tactical narration is more structured than open
// narrative, combat turns are the most frequent calls in a session, and
// Opus-in-prod wasn't buying anything there.
const COMBAT_MODEL = process.env.ANTHROPIC_COMBAT_MODEL || "claude-sonnet-5";
const TONE_PROMPT_PATH = fileURLToPath(new URL("../config/cyberpunk-system-prompt.md", import.meta.url));
const REFERENCE_FILES_PATH = fileURLToPath(new URL("../config/cyberpunk-reference-files.md", import.meta.url));

// The narrative DM's terminal handoff into combat mode, with this game's own
// per-enemy schema composed in (see packages/server-core/src/combat/README.md
// and ../combat/enemy-schema.js). Built per call, not once at startup: its
// description is prompts/combat-handoff.md, and like every other prompt
// here an edit should take effect on the next turn without a restart. The
// content is identical between edits, so the cached tools prefix is
// unaffected.
function startCombatTool() {
  return buildStartCombatTool({ enemySchema: combatGame.enemySchema });
}

// Read fresh on every call rather than cached at startup, so editing any of
// the three prompt fragments takes effect on the next reply with no server
// restart needed. Assembled in this order - opening + tone (per-app) first
// for emphasis, then the shared mechanics/behavior core (packages/server-core,
// identical across both apps), then the per-app reference-file list last
// (appendix-style, not tone-setting) - tone was moved out of its original
// middle position specifically to give it top billing once the shared core
// was extracted into its own file.
function loadSystemPrompt() {
  const tone = readFileSync(TONE_PROMPT_PATH, "utf-8").trim();
  const core = loadDmSystemPromptCore();
  const referenceFiles = readFileSync(REFERENCE_FILES_PATH, "utf-8").trim();
  return `${tone}\n\n${core}\n\n${referenceFiles}`;
}

// `characterNames` is the Story `{ username: characterName }` map when
// the conversation is one — Claude gets told the in-fiction names instead of
// real usernames so it stays in-character. Regular conversations pass
// `null` and get the existing real-username behavior. `characterDetails` is
// the matching `{ username: { role, level } }` map, if present — only the
// role is folded into the roster line (not level), so Claude knows what kind
// of character it's addressing without a player ever having to say so.
// `characterDescriptions`/`characterGear` are the matching `{ username: text }`
// maps — each appended as its own block via `formatFieldBlock`, skipping
// anyone who hasn't saved one, so an empty party doesn't add empty noise to
// every prompt.
export function formatFieldBlock(heading, characterNames, fieldValues) {
  const lines = Object.entries(characterNames)
    .map(([username, name]) => [name, fieldValues?.[username]])
    .filter(([, value]) => value)
    .map(([name, value]) => `- ${name}: ${value}`);
  return lines.length > 0 ? `\n\n${heading}:\n${lines.join("\n")}` : "";
}

// Thresholds mirrored client-side in HpTracker.jsx — keep both in sync if
// either changes. `max === 0` is the Story-creation default before a player
// has set a real HP value, not a genuine "0 max HP" reading, so it's treated
// as unset rather than run through the thresholds below.
function computeWoundState(current, max) {
  if (current == null || max == null || max === 0) return null;
  if (current === max) return "Healthy";
  if (current > max / 2) return "Lightly Wounded";
  if (current >= 1) return "Seriously Wounded";
  return "Mortally Wounded";
}

export function buildPlayerRoster(characterNames, characterDetails, characterDescriptions, characterGear, characterHp) {
  if (!characterNames) {
    return `The two players are ${users.map((u) => u.username).join(" and ")}.`;
  }
  const names = Object.entries(characterNames).map(([username, name]) => {
    const role = characterDetails?.[username]?.role;
    return role ? `${name} (${role})` : name;
  });
  let roster = `The two players are ${names.join(" and ")}.`;

  roster += formatFieldBlock(
    "Physical descriptions (for how NPCs might react to their appearance)",
    characterNames,
    characterDescriptions,
  );
  roster += formatFieldBlock("Weapons & Gear", characterNames, characterGear);

  // Only the derived Wound State reaches the model — raw current/max HP
  // numbers are never included in any Claude request (see character-hp.md).
  const characterWoundStates = Object.fromEntries(
    Object.keys(characterNames).map((username) => [
      username,
      computeWoundState(characterHp?.[username]?.current, characterHp?.[username]?.max),
    ]),
  );
  roster += formatFieldBlock("Wound State", characterNames, characterWoundStates);

  return roster;
}

const CACHE_CONTROL = { type: "ephemeral" };

// Everything generateReply and generateCombatHandoff share: the four system
// tiers and the cached, windowed message history. Kept as one builder so the
// manual "Start combat" override sees exactly the scene the narrative DM
// would have.
function buildNarrationRequest({
  history,
  characterNames,
  characterDetails,
  characterDescriptions,
  characterGear,
  characterHp,
  blueprint,
  situation,
}) {
  // Four tiers (see specs/campaign-situation.md §4.1): tier 1 (this app's
  // static DM instructions) almost never changes; tier 2 (premise + active
  // milestone) changes only on milestone advance; both are cached with their
  // own breakpoints. Tier 3 (the Situation) is rewritten every turn and tier
  // 4 (player roster - health, etc.) can change every turn, so both sit
  // after the cached tiers, uncached - a per-turn change there never
  // invalidates tiers 1-2.
  const system = [{ type: "text", text: loadSystemPrompt(), cache_control: CACHE_CONTROL }];

  const blueprintContext = buildBlueprintContext({ blueprint, situation });
  if (blueprintContext) {
    system.push({ type: "text", text: blueprintContext, cache_control: CACHE_CONTROL });
  }
  const situationContext = buildSituationContext(situation);
  if (situationContext) {
    system.push({ type: "text", text: situationContext });
  }

  system.push({
    type: "text",
    text: buildPlayerRoster(characterNames, characterDetails, characterDescriptions, characterGear, characterHp),
  });

  const messages = toAnthropicMessages(windowHistory(history));
  // Cache everything through the prior exchange — only the newest turn (and
  // this call's reply) needs to be processed fresh each time. windowHistory
  // trims in chunks precisely so this cached prefix stays stable across
  // many consecutive turns.
  if (messages.length > 1) {
    const idx = messages.length - 2;
    messages[idx] = {
      ...messages[idx],
      content: [{ type: "text", text: messages[idx].content, cache_control: CACHE_CONTROL }],
    };
  }

  return { system, messages };
}

function extractText(response) {
  return response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();
}

// Returns { text, combatHandoff }. `combatHandoff` is null on an ordinary
// turn; when the DM called start_combat it's the validated handoff and
// `text` is the cut-in - narration up to the instant violence breaks out
// (specs/combat-encounters.md §5.1). start_combat is terminal: the loop ends
// there, nothing after the cut is resolved by this DM.
export async function generateReply(
  history,
  characterNames = null,
  characterDetails = null,
  characterDescriptions = null,
  characterGear = null,
  characterHp = null,
  blueprint = null,
  situation = null,
  onDiceRoll = null,
) {
  const { system, messages } = buildNarrationRequest({
    history,
    characterNames,
    characterDetails,
    characterDescriptions,
    characterGear,
    characterHp,
    blueprint,
    situation,
  });

  // The tool list is a cached prefix too, so its order must be stable:
  // MCP tools in the order the server lists them, then start_combat last
  // with the breakpoint.
  const tools = [...(await getMcpTools()), startCombatTool()];
  tools[tools.length - 1] = { ...tools[tools.length - 1], cache_control: CACHE_CONTROL };

  for (let round = 0; round < MAX_TOOL_ROUNDTRIPS; round++) {
    const response = await client.messages.create({
      model: MODEL,
      // A ceiling, not a target - prose length is governed by the prompt.
      // Raised from 1024 because a start_combat handoff (battlefield, every
      // enemy, circumstances, objective, opening action) on top of the
      // cut-in text was observed truncating at 1024, which surfaced as
      // "incomplete handoff" tool errors and cost two extra roundtrips.
      max_tokens: 2048,
      system,
      messages,
      tools,
    });
    if (response.stop_reason === "max_tokens") {
      console.warn(`[narration] round ${round}: hit max_tokens - response was truncated`);
    }

    const toolUses = response.content.filter((block) => block.type === "tool_use");
    if (toolUses.length === 0) {
      // Guards against the rare empty completion (model variance, not
      // specific to tool use) so a blank message never lands in the chat.
      return {
        text: extractText(response) || "The DM pauses for a moment, gathering their thoughts — try asking again.",
        combatHandoff: null,
      };
    }

    const startCall = toolUses.find((t) => t.name === "start_combat");
    if (startCall) {
      const { errors, value } = validateHandoff(startCall.input);
      if (errors.length === 0) {
        return { text: extractText(response), combatHandoff: value };
      }
      // Incomplete - reject it as a tool error and let the DM retry with a
      // full handoff rather than dropping the players into a fight with
      // half a battlefield. Any other tool calls in the same response are
      // dropped: the turn is ending at the cut.
      console.warn(`[combat] start_combat rejected: ${errors.join("; ")}`);
      messages.push({ role: "assistant", content: response.content });
      messages.push({
        role: "user",
        content: toolUses.map((t) =>
          t.id === startCall.id
            ? { type: "tool_result", tool_use_id: t.id, content: `Incomplete - ${errors.join("; ")}. Call start_combat again with every field.`, is_error: true }
            : { type: "tool_result", tool_use_id: t.id, content: "Skipped - combat is starting.", is_error: true },
        ),
      });
      continue;
    }

    // Claude wants to look something up (e.g. a lore file via the MCP
    // server) before finishing its turn — run the tool call(s), feed the
    // results back, and let it continue.
    messages.push({ role: "assistant", content: response.content });
    // Fired before the roll actually runs (though roll_dice itself is
    // near-instant either way) so the caller can surface a live "DM is
    // rolling..." status - it stays visible for however long Claude takes
    // to continue after seeing the result, not just the roll itself.
    if (onDiceRoll && toolUses.some((t) => t.name === "roll_dice")) {
      onDiceRoll();
    }
    const toolResults = await Promise.all(
      toolUses.map(async (toolUse) => {
        const result = await callMcpTool(toolUse.name, toolUse.input);
        return {
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: result.content,
          is_error: result.isError ?? false,
        };
      }),
    );
    messages.push({ role: "user", content: toolResults });
  }

  return { text: "The DM got lost in their notes and couldn't finish that thought — try asking again.", combatHandoff: null };
}

// Manual "Start combat" override (specs/combat-encounters.md §5.1): the
// narrative DM's only job is to produce the handoff from the scene as it
// stands, with start_combat forced and no other tools. For the DM that
// narrated a fight without flagging it. With a forced tool call the model
// usually emits no text, so `text` is often empty here - the caller skips
// the cut-in message in that case.
export async function generateCombatHandoff(
  history,
  characterNames = null,
  characterDetails = null,
  characterDescriptions = null,
  characterGear = null,
  characterHp = null,
  blueprint = null,
  situation = null,
) {
  const { system, messages } = buildNarrationRequest({
    history,
    characterNames,
    characterDetails,
    characterDescriptions,
    characterGear,
    characterHp,
    blueprint,
    situation,
  });
  messages.push({
    role: "user",
    content:
      "System: The admin has declared that combat has begun in the current scene. Call start_combat now with the handoff built from the scene as it stands. The players' most recent declared hostile action (or, if none was declared, the enemies' first move) is the opening action; leave it unresolved.",
  });

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system,
    messages,
    tools: [startCombatTool()],
    tool_choice: { type: "tool", name: "start_combat" },
  });
  const call = response.content.find((block) => block.type === "tool_use" && block.name === "start_combat");
  if (!call) throw new Error("Combat handoff produced no start_combat call");
  const { errors, value } = validateHandoff(call.input);
  if (errors.length > 0) throw new Error(`Combat handoff was incomplete: ${errors.join("; ")}`);
  return { text: extractText(response), combatHandoff: value };
}

export const { generateCombatReply, generateCombatEnd } = createCombatGenerator({
  client,
  model: COMBAT_MODEL,
  getMcpTools,
  callMcpTool,
  game: combatGame,
});

export const generateChapterSummary = createChapterSummaryGenerator({
  client,
  model: MODEL,
  gameLabel: "Cyberpunk Red tabletop campaign",
});

export const generateBlueprint = createBlueprintGenerator({
  client,
  model: BLUEPRINT_MODEL,
  gameLabel: "Cyberpunk Red tabletop campaign",
  getMcpTools,
  callMcpTool,
});

export const runSituationPass = createSituationPass({
  client,
  model: REVIEW_PASS_MODEL,
  escalationModel: SITUATION_ESCALATION_MODEL,
});

export const runLeakCheckPass = createLeakCheckPass({ client, model: REVIEW_PASS_MODEL });

// Bounded recent window (specs/campaign-situation.md §4.3). Hysteresis, not a
// sliding window: nothing is trimmed until the chapter exceeds WINDOW_MAX
// messages, then it's cut back to the last WINDOW_MIN. A window that slid by
// one message every turn would change the cached prefix every turn and cost
// more than sending the full history, not less; trimming in chunks keeps the
// prefix stable for ~10 turns at a time. The API requires the first message
// to be a user turn, so any DM rows left at the front after trimming are
// dropped too. Anything trimmed away is the Situation's job to remember.
const WINDOW_MIN = 30;
const WINDOW_MAX = 40;
function windowHistory(history) {
  let rows = history.length > WINDOW_MAX ? history.slice(-WINDOW_MIN) : history;
  const firstUser = rows.findIndex((r) => r.role === "user");
  if (firstUser > 0) rows = rows.slice(firstUser);
  return rows;
}

// The Anthropic API requires strictly alternating user/assistant turns, but
// both players share role "user" — merge consecutive same-role DB rows into
// one turn so back-to-back player messages (before anyone asks the DM to
// respond) don't violate that, and prefix user content with the sender's
// username since Anthropic has no per-message speaker field.
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
