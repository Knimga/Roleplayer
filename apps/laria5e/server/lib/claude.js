import "dotenv/config";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { users } from "@roleplayer/server-core/users.js";
import { createChapterSummaryGenerator } from "@roleplayer/server-core/chapterSummary.js";
import { getMcpTools, callMcpTool } from "./mcpClient.js";

const MAX_TOOL_ROUNDTRIPS = 5;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Render sets NODE_ENV=production explicitly (see specs/laria5e/render-hosting.md);
// locally it's unset, so this defaults to Sonnet in dev and Opus in prod without
// needing a dedicated env var. ANTHROPIC_MODEL overrides either default if needed.
const MODEL =
  process.env.ANTHROPIC_MODEL || (process.env.NODE_ENV === "production" ? "claude-opus-5" : "claude-sonnet-5");
const PROMPT_PATH = fileURLToPath(new URL("../config/dm-system-prompt.txt", import.meta.url));

// Read fresh on every call rather than cached at startup, so editing the
// prompt file takes effect on the next reply with no server restart needed.
function loadSystemPrompt() {
  return readFileSync(PROMPT_PATH, "utf-8").trim();
}

// `characterNames` is the Story `{ username: characterName }` map when
// the conversation is one — Claude gets told the in-fiction names instead of
// real usernames so it stays in-character. Regular conversations pass
// `null` and get the existing real-username behavior. `characterDetails` is
// the matching `{ username: { playerClass, level } }` map, if present — only
// the class is folded into the roster line (not level), so Claude knows what
// kind of character it's addressing without a player ever having to say so.
// `characterDescriptions`/`characterGear` are the matching `{ username: text }`
// maps — each appended as its own block via `formatFieldBlock`, skipping
// anyone who hasn't saved one, so an empty party doesn't add empty noise to
// every prompt.
function formatFieldBlock(heading, characterNames, fieldValues) {
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

function buildPlayerRoster(characterNames, characterDetails, characterDescriptions, characterGear, characterHp) {
  if (!characterNames) {
    return `The two players are ${users.map((u) => u.username).join(" and ")}.`;
  }
  const names = Object.entries(characterNames).map(([username, name]) => {
    const playerClass = characterDetails?.[username]?.playerClass;
    return playerClass ? `${name} (${playerClass})` : name;
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

export async function generateReply(
  history,
  characterNames = null,
  characterDetails = null,
  characterDescriptions = null,
  characterGear = null,
  characterHp = null,
) {
  const systemText = `${loadSystemPrompt()}\n\n${buildPlayerRoster(characterNames, characterDetails, characterDescriptions, characterGear, characterHp)}`;
  const system = [{ type: "text", text: systemText, cache_control: CACHE_CONTROL }];

  const tools = await getMcpTools();
  if (tools.length > 0) {
    tools[tools.length - 1] = { ...tools[tools.length - 1], cache_control: CACHE_CONTROL };
  }

  const messages = toAnthropicMessages(history);
  // Cache everything through the prior exchange — only the newest turn (and
  // this call's reply) needs to be processed fresh each time, since the
  // full transcript gets resent on every "Ask the DM" click.
  if (messages.length > 1) {
    const idx = messages.length - 2;
    messages[idx] = {
      ...messages[idx],
      content: [{ type: "text", text: messages[idx].content, cache_control: CACHE_CONTROL }],
    };
  }

  for (let round = 0; round < MAX_TOOL_ROUNDTRIPS; round++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system,
      messages,
      tools,
    });

    const toolUses = response.content.filter((block) => block.type === "tool_use");
    if (toolUses.length === 0) {
      const text = response.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("");
      // Guards against the rare empty completion (model variance, not
      // specific to tool use) so a blank message never lands in the chat.
      return text.trim() || "The DM pauses for a moment, gathering their thoughts — try asking again.";
    }

    // Claude wants to look something up (e.g. a lore file via the MCP
    // server) before finishing its turn — run the tool call(s), feed the
    // results back, and let it continue.
    messages.push({ role: "assistant", content: response.content });
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

  return "The DM got lost in their notes and couldn't finish that thought — try asking again.";
}

export const generateChapterSummary = createChapterSummaryGenerator({
  client,
  model: MODEL,
  gameLabel: "DnD campaign in the homebrew world of Laria",
});

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
