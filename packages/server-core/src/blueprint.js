import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Campaign Blueprint (static premise + milestone arc, generated once and
// admin-reviewed) and Situation (the DM's mutable working memory, rewritten
// after every turn by situationPass.js). See specs/campaign-situation.md for
// the design and why the two layers are split the way they are.

const PROMPT_PATH = fileURLToPath(new URL("../prompts/blueprint-prompt.md", import.meta.url));
// Generous relative to generateReply's MAX_TOOL_ROUNDTRIPS (5) - this call
// can involve several lore-lookup rounds before Claude is ready to finalize,
// plus it spends rounds retrying an incomplete create_blueprint call (see
// findMissingFields) rather than accepting bad output.
const MAX_TOOL_ROUNDTRIPS = 10;

// Situation.facts is rewritten (not appended) every turn and hard-capped here
// so drift stays bounded - see specs/campaign-situation.md §3.2 / §5.1.
export const FACTS_CAP = 12;
// Ordered: awareness only ever rises (enforced in applySituationUpdate).
export const AWARENESS_LEVELS = ["unaware", "suspects", "aware", "hunting"];
export const PREMISE_TYPES = ["Person", "Faction/Organization", "System", "Force", "Hybrid"];

function loadBlueprintPrompt() {
  return readFileSync(PROMPT_PATH, "utf-8").trim();
}

// Forced tool-use with a JSON schema, not free prose + a parse step - Claude
// emits valid structured content directly, so there's no fragile parsing
// layer between generation and the admin's review form.
const CREATE_BLUEPRINT_TOOL = {
  name: "create_blueprint",
  description:
    "Submit the finished Campaign Blueprint once you have gathered enough lore/backstory context to ground it in this world. Call this exactly once, when ready - not before you've looked up what you need.",
  input_schema: {
    type: "object",
    required: ["premise", "milestones", "openingSituation"],
    properties: {
      premise: {
        type: "object",
        required: ["type", "identity", "motivationOrNature", "publicFace", "resources"],
        properties: {
          type: { type: "string", enum: PREMISE_TYPES },
          identity: { type: "string", description: "Name/description appropriate to the chosen type" },
          motivationOrNature: { type: "string", description: "What drives it, or what it fundamentally is" },
          publicFace: { type: "string", description: "What's visible to the world vs. what's hidden from it" },
          resources: { type: "string", description: "What it can bring to bear against the players" },
        },
      },
      milestones: {
        type: "array",
        minItems: 3,
        maxItems: 5,
        items: {
          type: "object",
          required: ["id", "title", "narrative"],
          properties: {
            id: { type: "string", description: 'Sequential: "m1", "m2", ...' },
            title: { type: "string" },
            narrative: {
              type: "string",
              description:
                "A state the story should reach and why it matters dramatically - a destination, not a scripted trigger, required action, or specific scene",
            },
          },
        },
      },
      openingSituation: {
        type: "object",
        required: ["objective", "nextMove", "antagonistMove", "antagonistAwareness"],
        properties: {
          objective: {
            type: "string",
            description: "The first problem or goal presented to the players, as they'd understand it - never a method",
          },
          nextMove: { type: "string", description: "The first concrete thing the DM will set up to get the story moving" },
          antagonistMove: { type: "string", description: "What the antagonist is doing as the campaign opens" },
          antagonistAwareness: { type: "string", enum: AWARENESS_LEVELS },
        },
      },
    },
  },
};

// A forced tool_choice guarantees Claude calls *a* tool, and the schema
// guides it, but neither guarantees every "required" field actually landed -
// a rushed or premature call can come back missing fields. Checked before
// ever handing this to the frontend, since an incomplete object reaching the
// draft editor as valid data crashes it.
function findMissingFields(input) {
  const missing = [];
  const p = input?.premise;
  if (!p || !p.type || !p.identity || !p.motivationOrNature || !p.publicFace || !p.resources) {
    missing.push("premise (type/identity/motivationOrNature/publicFace/resources)");
  }
  if (!Array.isArray(input?.milestones) || input.milestones.length < 3) {
    missing.push("milestones (at least 3 entries)");
  } else if (input.milestones.some((m) => !m.id || !m.title || !m.narrative)) {
    missing.push("milestones (one or more entries missing id/title/narrative)");
  }
  const o = input?.openingSituation;
  if (!o || !o.objective || !o.nextMove || !o.antagonistMove || !AWARENESS_LEVELS.includes(o.antagonistAwareness)) {
    missing.push("openingSituation (objective/nextMove/antagonistMove/antagonistAwareness)");
  }
  return missing;
}

// Reuses the same tool-use loop shape lib/claude.js's generateReply runs
// every DM turn: Claude can freely call the app's MCP doc tools first to
// ground the Blueprint in real lore/backstories, then calls create_blueprint
// when ready. tool_choice stays "auto" through most of the loop so those
// lookups can happen first - only the final round forces the call, as a
// fallback if Claude hasn't made it by then.
export function createBlueprintGenerator({ client, model, gameLabel, getMcpTools, callMcpTool }) {
  return async function generateBlueprint(campaignInput) {
    const systemText = `${loadBlueprintPrompt()}\n\nGame: ${gameLabel}`;
    const docTools = await getMcpTools();
    const tools = [...docTools, CREATE_BLUEPRINT_TOOL];

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
        // Generous: a detailed premise + up to 5 milestones + the opening
        // situation can run long; 4096 was confirmed to truncate the
        // predecessor of this schema mid-object.
        max_tokens: 16000,
        system: systemText,
        messages,
        tools,
        tool_choice: isFinalRound ? { type: "tool", name: "create_blueprint" } : { type: "auto" },
      });
      const roundSeconds = ((Date.now() - roundStart) / 1000).toFixed(1);
      if (response.stop_reason === "max_tokens") {
        console.log(`[blueprint] round ${round}: hit max_tokens - response was truncated`);
      }

      const blueprintCall = response.content.find((block) => block.type === "tool_use" && block.name === "create_blueprint");
      if (blueprintCall) {
        const missing = findMissingFields(blueprintCall.input);
        console.log(
          `[blueprint] round ${round} (${roundSeconds}s): create_blueprint called, ${missing.length === 0 ? "valid" : `INVALID - ${missing.join("; ")}`}`,
        );
        if (missing.length === 0) return blueprintCall.input;

        if (isFinalRound) {
          throw new Error(`Blueprint generation returned incomplete content. Missing/invalid: ${missing.join("; ")}`);
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
              tool_use_id: blueprintCall.id,
              content: `Incomplete - missing or invalid: ${missing.join("; ")}. Call create_blueprint again with the complete content for every field.`,
              is_error: true,
            },
          ],
        });
        continue;
      }

      const otherToolUses = response.content.filter((block) => block.type === "tool_use");
      if (otherToolUses.length === 0) {
        console.log(`[blueprint] round ${round} (${roundSeconds}s): plain text, no tool call - nudging`);
        messages.push({ role: "assistant", content: response.content });
        messages.push({ role: "user", content: "Please call create_blueprint now with your finished Blueprint content." });
        continue;
      }

      console.log(`[blueprint] round ${round} (${roundSeconds}s): ${otherToolUses.map((t) => t.name).join(", ")}`);
      messages.push({ role: "assistant", content: response.content });
      const toolResults = await Promise.all(
        otherToolUses.map(async (toolUse) => {
          const result = await callMcpTool(toolUse.name, toolUse.input);
          return { type: "tool_result", tool_use_id: toolUse.id, content: result.content, is_error: result.isError ?? false };
        }),
      );
      messages.push({ role: "user", content: toolResults });
    }

    throw new Error("Blueprint generation failed to produce structured output after max tool roundtrips.");
  };
}

// ---------------------------------------------------------------------------
// Situation: shape, initialization, milestone movement, validation
// ---------------------------------------------------------------------------

// Seeds the Situation from an approved Blueprint's openingSituation. First
// milestone active, no facts yet, revision 0.
export function initializeSituation({ blueprint }) {
  const opening = blueprint?.openingSituation ?? {};
  return {
    objective: String(opening.objective ?? "").trim(),
    nextMove: String(opening.nextMove ?? "").trim(),
    antagonist: {
      move: String(opening.antagonistMove ?? "").trim(),
      awareness: AWARENESS_LEVELS.includes(opening.antagonistAwareness) ? opening.antagonistAwareness : "unaware",
    },
    facts: [],
    activeMilestoneId: blueprint?.milestones?.[0]?.id ?? null,
    revision: 0,
  };
}

export function getActiveMilestone(blueprint, situation) {
  if (!blueprint?.milestones || !situation?.activeMilestoneId) return null;
  return blueprint.milestones.find((m) => m.id === situation.activeMilestoneId) ?? null;
}

// Milestone status is derived, never stored: everything before the active
// one is complete, everything after is pending, and a null active id means
// the arc is exhausted (every milestone complete).
export function milestoneStatuses(blueprint, situation) {
  const milestones = blueprint?.milestones ?? [];
  const activeIndex = milestones.findIndex((m) => m.id === situation?.activeMilestoneId);
  return milestones.map((m, i) => {
    let status;
    if (activeIndex === -1) status = "complete";
    else if (i < activeIndex) status = "complete";
    else if (i === activeIndex) status = "active";
    else status = "pending";
    return { ...m, status };
  });
}

// Moves the active milestone one step forward (the last one advancing to
// "arc exhausted", i.e. null). Pure; the caller persists. Unchanged if the
// arc is already exhausted - the same "no-op at the boundary" shape the old
// beats tracker had.
export function advanceMilestone(situation, blueprint) {
  const milestones = blueprint?.milestones ?? [];
  const activeIndex = milestones.findIndex((m) => m.id === situation.activeMilestoneId);
  if (activeIndex === -1) return situation;
  const next = milestones[activeIndex + 1]?.id ?? null;
  return { ...situation, activeMilestoneId: next, revision: (situation.revision ?? 0) + 1 };
}

// The exact inverse: the most recently completed milestone becomes active
// again. From an exhausted arc that's the last milestone; otherwise the one
// before the active one. Unchanged if still on the first milestone.
export function revertMilestone(situation, blueprint) {
  const milestones = blueprint?.milestones ?? [];
  const activeIndex = milestones.findIndex((m) => m.id === situation.activeMilestoneId);
  const targetIndex = activeIndex === -1 ? milestones.length - 1 : activeIndex - 1;
  if (targetIndex < 0 || !milestones[targetIndex]) return situation;
  return { ...situation, activeMilestoneId: milestones[targetIndex].id, revision: (situation.revision ?? 0) + 1 };
}

// Normalizes and validates the four rewritable fields (from the Situation
// pass or an admin edit). Returns { value, errors } - never throws, so
// callers decide whether an error means "keep the previous Situation"
// (the pass) or "400" (the admin route). facts over the cap are truncated,
// not rejected: a slightly-too-long list from a good rewrite shouldn't cost
// a turn's worth of memory.
export function validateSituationFields(input) {
  const errors = [];
  const str = (v) => (typeof v === "string" ? v.trim() : "");

  const objective = str(input?.objective);
  const nextMove = str(input?.nextMove);
  const antagonistMove = str(input?.antagonistMove ?? input?.antagonist?.move);
  const awareness = input?.antagonistAwareness ?? input?.antagonist?.awareness;
  if (!objective) errors.push("objective is required");
  if (!nextMove) errors.push("nextMove is required");
  if (!antagonistMove) errors.push("antagonistMove is required");
  if (!AWARENESS_LEVELS.includes(awareness)) errors.push(`antagonistAwareness must be one of ${AWARENESS_LEVELS.join("/")}`);

  let facts = Array.isArray(input?.facts) ? input.facts.map(str).filter(Boolean) : [];
  if (facts.length > FACTS_CAP) facts = facts.slice(0, FACTS_CAP);

  return {
    errors,
    value: { objective, nextMove, antagonist: { move: antagonistMove, awareness }, facts },
  };
}

// Merges a validated rewrite onto the previous Situation: bumps revision,
// keeps awareness monotonic (it can only rise), and advances the milestone
// if the pass judged it reached. Pure; the caller persists.
export function applySituationUpdate({ previous, update, blueprint, milestoneReached = false }) {
  const prevAwareness = AWARENESS_LEVELS.indexOf(previous?.antagonist?.awareness ?? "unaware");
  const nextAwareness = AWARENESS_LEVELS.indexOf(update.antagonist.awareness);
  const awareness = AWARENESS_LEVELS[Math.max(prevAwareness, nextAwareness, 0)];

  let situation = {
    ...previous,
    objective: update.objective,
    nextMove: update.nextMove,
    antagonist: { move: update.antagonist.move, awareness },
    facts: update.facts,
    revision: (previous?.revision ?? 0) + 1,
  };
  if (milestoneReached && situation.activeMilestoneId) {
    // advanceMilestone bumps revision again; that's fine - it's a counter,
    // not a version stamp anyone matches against.
    situation = advanceMilestone(situation, blueprint);
  }
  return situation;
}

// ---------------------------------------------------------------------------
// System prompt blocks (see specs/campaign-situation.md §4.1)
// ---------------------------------------------------------------------------

// Cached tier: premise + active milestone. Changes only on milestone
// advance, so it keeps its own cache breakpoint. Null if no Blueprint.
export function buildBlueprintContext({ blueprint, situation }) {
  if (!blueprint?.premise) return null;
  const { premise } = blueprint;
  const milestone = getActiveMilestone(blueprint, situation);

  const milestoneSection = milestone
    ? `## Milestone to Steer Toward: ${milestone.title}\nA destination, not a fact that's already true - narrate the world moving toward this, never as something already in place.\n${milestone.narrative}`
    : "## Milestone to Steer Toward\nNone - the arc is complete. Keep the world consistent with everything that has happened; there is no further destination to steer toward.";

  return `# Hidden Campaign Context
This is private planning material for your own use as DM - never shown to players. NEVER mention, name, quote, or summarize any of it to players: no naming a milestone, no "the campaign plan", no bookkeeping language at all. See "Working the Situation" in your instructions for how to use it. Players should only ever experience its effects in the fiction, never see or infer the mechanism.

## Premise
Type: ${premise.type}
Identity: ${premise.identity}
Motivation/Nature: ${premise.motivationOrNature}
Public Face: ${premise.publicFace}
Resources: ${premise.resources}

${milestoneSection}`;
}

// Uncached tier: the Situation. Rewritten every turn, so it must sit after
// the cached tiers and never share a breakpoint with them. Null if none.
export function buildSituationContext(situation) {
  if (!situation?.objective) return null;
  const facts = situation.facts?.length
    ? situation.facts.map((f) => `- ${f}`).join("\n")
    : "- (none recorded yet)";

  return `# Current Situation (your working memory - rewritten after every turn)
Objective (what the players are pursuing; may surface in the fiction): ${situation.objective}
Your next move (private): ${situation.nextMove}
Antagonist right now (private): ${situation.antagonist?.move ?? "(unknown)"} - awareness of the players: ${situation.antagonist?.awareness ?? "unaware"}
Established facts (authoritative for anything older than the recent messages you can see):
${facts}`;
}
