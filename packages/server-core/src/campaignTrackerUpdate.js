import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const PROMPT_PATH = fileURLToPath(new URL("../prompts/campaign-tracker-update-pass.md", import.meta.url));

// Read fresh on every call rather than cached at startup - same reasoning as
// every other prompt-loading function in this codebase.
function loadTrackerUpdatePrompt() {
  return readFileSync(PROMPT_PATH, "utf-8").trim();
}

// No tool-choice forcing, and deliberately no arguments beyond `reason` -
// unlike create_campaign_bible, "no tool call at all" is the expected,
// common outcome of most turns (see campaign-tracker-update-pass.md's
// Output contract), not a failure to retry against. The only effect this
// tool ever has is fixed and mechanical (advanceBeatsTracker in
// campaignBible.js: mark current beat complete, advance the next) - there's
// nothing else for Claude to specify.
const UPDATE_BEATS_TOOL = {
  name: "update_beats",
  description:
    "Advance the story to the next beat: marks the current active beat complete and the next beat in sequence active. Call this only when the active beat's narrative state has genuinely been reached this response - see your instructions for the judgment criteria. Do not call this if nothing needs to change.",
  input_schema: {
    type: "object",
    required: ["reason"],
    properties: {
      reason: {
        type: "string",
        description:
          "One sentence: what in the recent conversation satisfies the active beat's narrative. Logged for admin review (see the Campaign Management modal's Beats tab) - never shown to players.",
      },
    },
  },
};

// Lives as a shared, plain tool schema/pass here - not registered on either
// app's own mcp/server.js - mirroring how create_campaign_bible was built
// rather than a true MCP-server tool (see specs/campaign-bible.md's Phase 3
// decision (3)).
//
// Runs as its own dedicated call, separate from generateReply's tool-use
// loop (decision (1)) - narration is already drafted by the time this runs.
// Blocks the player-facing response (decision (2)): the caller is expected
// to await this and apply any resulting beatsTracker change *before* saving
// and publishing the narration message, so the very next turn already sees
// the updated beat state, not one turn behind.
export function createTrackerUpdatePass({ client, model }) {
  return async function runTrackerUpdatePass({ recentHistory, activeBeat }) {
    if (!activeBeat) return null; // no active beat - no bible yet, or the arc is exhausted

    const systemText = loadTrackerUpdatePrompt();

    // Wrapped as a single user message, same reasoning as chapterSummary.js:
    // recentHistory ends with the DM's just-drafted (assistant-role) reply,
    // and the Anthropic API rejects a `messages` array ending in `assistant`
    // as unsupported "assistant message prefill".
    const transcript = recentHistory
      .map((row) => `${row.role === "assistant" ? "DM" : row.sender}: ${row.content}`)
      .join("\n\n");

    const userContent = `Current active beat:
ID: ${activeBeat.id}
Title: ${activeBeat.title}
Narrative: ${activeBeat.narrative}

Recent conversation history (oldest first, most recent turn last):

${transcript}`;

    const response = await client.messages.create({
      model,
      max_tokens: 512,
      system: systemText,
      messages: [{ role: "user", content: userContent }],
      tools: [UPDATE_BEATS_TOOL],
      tool_choice: { type: "auto" },
    });

    const call = response.content.find((block) => block.type === "tool_use" && block.name === "update_beats");
    if (!call) return null;

    const reason = call.input?.reason || "(no reason given)";
    console.log(`[trackerUpdate] advancing beat ${activeBeat.id} - reason: ${reason}`);
    return { reason };
  };
}
