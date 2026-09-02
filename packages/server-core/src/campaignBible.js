import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const PROMPT_PATH = fileURLToPath(new URL("../prompts/campaign-bible-prompt.md", import.meta.url));
// Generous relative to generateReply's MAX_TOOL_ROUNDTRIPS (5) - this call
// can involve several lore-lookup rounds before Claude is ready to finalize,
// especially against a larger doc corpus (Laria 5e's, for instance), plus
// this loop also spends rounds retrying an incomplete create_campaign_bible
// call (see findMissingFields) rather than accepting bad output.
const MAX_TOOL_ROUNDTRIPS = 10;

function loadCampaignBiblePrompt() {
  return readFileSync(PROMPT_PATH, "utf-8").trim();
}

// Forced tool-use with a JSON schema, not free prose + a deterministic parse
// step (see specs/campaign-bible.md's Status section for why) - Claude emits
// valid structured content directly, so there's no fragile parsing layer and
// no drift between narrative text and tracker state to worry about.
const CREATE_BIBLE_TOOL = {
  name: "create_campaign_bible",
  description:
    "Submit the finished Campaign Bible content once you have gathered enough lore/backstory context to ground it in this world. Call this exactly once, when ready - not before you've looked up what you need.",
  input_schema: {
    type: "object",
    required: ["centralConflict", "beats"],
    properties: {
      centralConflict: {
        type: "object",
        required: ["type", "identity", "motivationOrNature", "publicFace", "resources"],
        properties: {
          type: { type: "string", enum: ["Person", "Faction/Organization", "System", "Force", "Hybrid"] },
          identity: { type: "string", description: "Name/description appropriate to the chosen type" },
          motivationOrNature: { type: "string", description: "What drives it, or what it fundamentally is" },
          publicFace: { type: "string", description: "What's visible to the world vs. what's hidden from it" },
          resources: { type: "string", description: "What it can bring to bear against the players" },
        },
      },
      beats: {
        type: "array",
        minItems: 3,
        maxItems: 5,
        items: {
          type: "object",
          required: ["id", "title", "narrative"],
          properties: {
            id: { type: "string", description: 'Sequential: "beat_1", "beat_2", ...' },
            title: { type: "string" },
            narrative: {
              type: "string",
              description:
                "A state the story should reach and why it matters dramatically - not a scripted trigger, required action, or specific scene",
            },
          },
        },
      },
    },
  },
};

// A forced tool_choice guarantees Claude calls *a* tool, and the schema
// guides it, but neither guarantees every "required" field actually landed -
// a rushed or premature call (especially one triggered on an "auto" round
// before Claude has actually finished gathering context) can come back
// missing fields. Checked before ever handing this to the frontend, since an
// incomplete object here previously reached React as valid data and crashed
// the draft editor (BibleDraftEditor assumes the full shape is present).
function findMissingFields(input) {
  const missing = [];
  const cc = input?.centralConflict;
  if (!cc || !cc.type || !cc.identity || !cc.motivationOrNature || !cc.publicFace || !cc.resources) {
    missing.push("centralConflict (type/identity/motivationOrNature/publicFace/resources)");
  }
  if (!Array.isArray(input?.beats) || input.beats.length < 3) {
    missing.push("beats (at least 3 entries)");
  } else if (input.beats.some((b) => !b.id || !b.title || !b.narrative)) {
    missing.push("beats (one or more entries missing id/title/narrative)");
  }
  return missing;
}

// Reuses the same tool-use loop shape lib/claude.js's generateReply already
// runs every DM turn: Claude can freely call the app's existing MCP doc tools
// first to ground the Bible in real lore/backstories, then calls
// create_campaign_bible when ready. tool_choice stays "auto" through most of
// the loop specifically so those lore lookups can happen first - only the
// final round forces create_campaign_bible, as a fallback if Claude hasn't
// called it by then.
export function createCampaignBibleGenerator({ client, model, gameLabel, getMcpTools, callMcpTool }) {
  return async function generateCampaignBible(campaignInput) {
    const systemText = `${loadCampaignBiblePrompt()}\n\nGame: ${gameLabel}`;
    const docTools = await getMcpTools();
    const tools = [...docTools, CREATE_BIBLE_TOOL];

    const messages = [
      {
        role: "user",
        content: `Here are the player's campaign inputs (tone, themes, threats, desired storylines):\n\n${campaignInput}`,
      },
    ];

    for (let round = 0; round < MAX_TOOL_ROUNDTRIPS; round++) {
      const isFinalRound = round === MAX_TOOL_ROUNDTRIPS - 1;
      const roundStart = Date.now();
      const response = await client.messages.create({
        model,
        // Generous: a detailed Central Conflict + up to 4 NPCs + up to 5
        // beats can consume the whole budget before villainPlan (last in
        // the schema's property order) is ever reached - confirmed live at
        // 4096 (always truncated before villainPlan) and even 8192 (still
        // truncated on one attempt in testing, succeeded on retry).
        max_tokens: 16000,
        system: systemText,
        messages,
        tools,
        tool_choice: isFinalRound ? { type: "tool", name: "create_campaign_bible" } : { type: "auto" },
      });
      const roundSeconds = ((Date.now() - roundStart) / 1000).toFixed(1);
      if (response.stop_reason === "max_tokens") {
        console.log(`[campaignBible] round ${round}: hit max_tokens - response was truncated`);
      }

      const bibleCall = response.content.find(
        (block) => block.type === "tool_use" && block.name === "create_campaign_bible",
      );
      if (bibleCall) {
        const missing = findMissingFields(bibleCall.input);
        console.log(
          `[campaignBible] round ${round} (${roundSeconds}s): create_campaign_bible called, ${missing.length === 0 ? "valid" : `INVALID - ${missing.join("; ")}`}`,
        );
        if (missing.length === 0) return bibleCall.input;

        if (isFinalRound) {
          throw new Error(`Campaign Bible generation returned incomplete content. Missing/invalid: ${missing.join("; ")}`);
        }

        // Incomplete but not the last round - reject it as a tool error and
        // let Claude retry with the full content, rather than silently
        // accepting a partial object.
        messages.push({ role: "assistant", content: response.content });
        messages.push({
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: bibleCall.id,
              content: `Incomplete - missing or invalid: ${missing.join("; ")}. Call create_campaign_bible again with the complete content for every field.`,
              is_error: true,
            },
          ],
        });
        continue;
      }

      const otherToolUses = response.content.filter((block) => block.type === "tool_use");
      if (otherToolUses.length === 0) {
        console.log(`[campaignBible] round ${round} (${roundSeconds}s): plain text, no tool call - nudging`);
        // Claude replied with plain text instead of calling a tool - nudge it
        // to actually call create_campaign_bible rather than looping silently.
        messages.push({ role: "assistant", content: response.content });
        messages.push({
          role: "user",
          content: "Please call create_campaign_bible now with your finished Bible content.",
        });
        continue;
      }

      console.log(`[campaignBible] round ${round} (${roundSeconds}s): ${otherToolUses.map((t) => t.name).join(", ")}`);
      messages.push({ role: "assistant", content: response.content });
      const toolResults = await Promise.all(
        otherToolUses.map(async (toolUse) => {
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

    throw new Error("Campaign Bible generation failed to produce structured output after max tool roundtrips.");
  };
}

// Builds the "session/state" cache tier (Phase 2, see specs/campaign-bible.md
// §4) injected into generateReply's system prompt: the active beat's full
// record. Only what's safe to reveal through play is included at all -
// pending beats are never passed in here, so there's nothing spoiler-adjacent
// for the DM to even accidentally lean on.
// Returns null if this Story has no Campaign Bible yet (nothing to inject).
// (Villain's Plan intentionally omitted - deferred, see
// specs/future-features/campaign-bible-villain-plan.md.)
export function buildCampaignBibleContext({ campaignBible, beatsTracker }) {
  if (!campaignBible || !beatsTracker) return null;

  const { centralConflict } = campaignBible;
  const activeBeat = beatsTracker.find((b) => b.status === "active");

  const beatSection = activeBeat
    ? `## Current Beat: ${activeBeat.title}\n${activeBeat.narrative}`
    : "## Current Beat\nNone active - the arc has either not started or is exhausted.";

  return `# Hidden Campaign Context (Campaign Bible)
This is a private planning document for your own use as GM - never shown to players. NEVER mention, name, quote, or summarize any of it to players: no naming a beat, no referencing "the campaign bible" or any tracker/status language at all. Let it silently steer what NPCs do, what complications arise, and what the world reveals - players should only ever experience its effects in the fiction, never see or infer its existence as a mechanism.

## Central Conflict
Type: ${centralConflict.type}
Identity: ${centralConflict.identity}
Motivation/Nature: ${centralConflict.motivationOrNature}
Public Face: ${centralConflict.publicFace}
Resources: ${centralConflict.resources}

${beatSection}`;
}

// Builds the mutable beats tracker from the freshly-generated (or admin-
// edited) beats content, applying the fixed initial-status convention: first
// beat active, everything else pending.
// (Villain's Plan intentionally omitted - deferred, see
// specs/future-features/campaign-bible-villain-plan.md.)
export function initializeTrackers({ beats }) {
  const beatsTracker = beats.map((beat, i) => ({ ...beat, status: i === 0 ? "active" : "pending" }));
  return { beatsTracker };
}

// Applies the one and only effect update_beats has (Phase 3, see
// campaignTrackerUpdate.js): marks the current active beat complete and the
// next beat in sequence active. Pure function, no DB access - the caller
// persists the result. Returns the tracker unchanged if there's no active
// beat (arc already exhausted, or somehow already advanced) or no next beat
// to advance to (arc genuinely exhausted - the tracker just stays with
// nothing active, same as the "arc exhausted" case buildCampaignBibleContext
// already handles).
export function advanceBeatsTracker(beatsTracker) {
  const activeIndex = beatsTracker.findIndex((b) => b.status === "active");
  if (activeIndex === -1) return beatsTracker;

  return beatsTracker.map((beat, i) => {
    if (i === activeIndex) return { ...beat, status: "complete" };
    if (i === activeIndex + 1) return { ...beat, status: "active" };
    return beat;
  });
}
