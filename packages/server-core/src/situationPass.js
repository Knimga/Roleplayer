import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { FACTS_CAP, AWARENESS_LEVELS, validateSituationFields } from "./blueprint.js";

// The Situation pass: rewrites the DM's working memory after every turn.
// Replaces the old tracker-update pass outright - milestone advancement is
// one field of this rewrite. See specs/campaign-situation.md §4.2.

const PROMPT_PATH = fileURLToPath(new URL("../prompts/situation-pass.md", import.meta.url));

function loadSituationPrompt() {
  return readFileSync(PROMPT_PATH, "utf-8").trim().replaceAll("{{FACTS_CAP}}", String(FACTS_CAP));
}

const UPDATE_SITUATION_TOOL = {
  name: "update_situation",
  description:
    "Submit the complete rewritten Situation for this turn - every field, every time. See your instructions for what each field means.",
  input_schema: {
    type: "object",
    required: ["objective", "nextMove", "antagonistMove", "antagonistAwareness", "facts", "milestoneReached"],
    properties: {
      objective: { type: "string", description: "What the players are trying to do now, as they'd say it. A problem or goal, never a method." },
      nextMove: { type: "string", description: "The one concrete thing the DM should set up next to move toward the milestone." },
      antagonistMove: { type: "string", description: "What the antagonist is doing now / about to do, given what the players just did." },
      antagonistAwareness: { type: "string", enum: AWARENESS_LEVELS },
      facts: {
        type: "array",
        maxItems: FACTS_CAP,
        items: { type: "string" },
        description: `The full rewritten list of established facts, at most ${FACTS_CAP}, most relevant first.`,
      },
      milestoneReached: {
        type: "boolean",
        description: "true only if the active milestone's narrative state is now actually true. When in doubt, false.",
      },
    },
  },
};

function formatExchange(exchange) {
  return exchange.map((row) => `${row.role === "assistant" ? "DM" : row.sender}: ${row.content}`).join("\n\n");
}

function formatPreviousSituation(s) {
  if (!s) return "(none yet)";
  const facts = s.facts?.length ? s.facts.map((f) => `- ${f}`).join("\n") : "- (none)";
  return `Objective: ${s.objective}
Next move: ${s.nextMove}
Antagonist move: ${s.antagonist?.move ?? ""}
Antagonist awareness: ${s.antagonist?.awareness ?? "unaware"}
Revision: ${s.revision ?? 0}
Facts:
${facts}`;
}

// `model` runs every turn (Haiku). `escalationModel`, if set, re-runs the
// pass when the first model claims the milestone was reached - advancement
// is irreversible, so the cheap model's "yes" is treated as a proposal and
// the stronger model's full rewrite (including its own milestoneReached
// judgment) is what gets used. Costs a second call only on those rare turns.
export function createSituationPass({ client, model, escalationModel = null }) {
  async function runOnce({ useModel, systemText, userContent }) {
    const response = await client.messages.create({
      model: useModel,
      max_tokens: 1500,
      system: systemText,
      messages: [{ role: "user", content: userContent }],
      tools: [UPDATE_SITUATION_TOOL],
      tool_choice: { type: "tool", name: "update_situation" },
    });
    const call = response.content.find((block) => block.type === "tool_use" && block.name === "update_situation");
    if (!call) throw new Error("Situation pass produced no update_situation call");

    const { errors, value } = validateSituationFields(call.input);
    if (errors.length > 0) throw new Error(`Situation pass returned an invalid update: ${errors.join("; ")}`);
    return { ...value, milestoneReached: call.input.milestoneReached === true };
  }

  return async function runSituationPass({ previousSituation, premise, activeMilestone, exchange }) {
    const systemText = loadSituationPrompt();

    const milestoneText = activeMilestone
      ? `ID: ${activeMilestone.id}\nTitle: ${activeMilestone.title}\nNarrative: ${activeMilestone.narrative}`
      : "None - the arc is exhausted. milestoneReached must be false.";

    const userContent = `Premise:
Type: ${premise.type}
Identity: ${premise.identity}
Motivation/Nature: ${premise.motivationOrNature}
Public Face: ${premise.publicFace}
Resources: ${premise.resources}

Active milestone:
${milestoneText}

Previous Situation:
${formatPreviousSituation(previousSituation)}

Latest exchange (every player message since the DM's previous reply, then the DM's drafted response):

${formatExchange(exchange)}`;

    const first = await runOnce({ useModel: model, systemText, userContent });
    if (!first.milestoneReached || !escalationModel || escalationModel === model) return first;

    console.log(`[situation] ${model} proposes advancing milestone ${activeMilestone?.id ?? "?"} - confirming on ${escalationModel}`);
    const confirmed = await runOnce({ useModel: escalationModel, systemText, userContent });
    console.log(`[situation] ${escalationModel} ${confirmed.milestoneReached ? "confirmed" : "declined"} the advance`);
    return confirmed;
  };
}
