import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const PROMPT_PATH = fileURLToPath(new URL("../prompts/leak-check-pass.md", import.meta.url));

function loadLeakCheckPrompt() {
  return readFileSync(PROMPT_PATH, "utf-8").trim();
}

const LEAK_CHECK_TOOL = {
  name: "leak_check_result",
  description:
    "Report whether the drafted response leaks specific active-beat content incidentally/offhand, rather than as the earned result of depicted player action.",
  input_schema: {
    type: "object",
    required: ["leaked"],
    properties: {
      leaked: {
        type: "boolean",
        description:
          "true if the response reveals a specific secret fact from the beat's narrative incidentally or offhand; false if there's nothing to leak, or the reveal is earned by action depicted in this same response.",
      },
    },
  },
};

export function createLeakCheckPass({ client, model }) {
  return async function runLeakCheckPass({ replyText, activeBeat }) {
    if (!activeBeat) return false;

    const systemText = loadLeakCheckPrompt();

    const userContent = `Active beat:
Title: ${activeBeat.title}
Narrative: ${activeBeat.narrative}

Drafted response to check:

${replyText}`;

    const response = await client.messages.create({
      model,
      max_tokens: 256,
      system: systemText,
      messages: [{ role: "user", content: userContent }],
      tools: [LEAK_CHECK_TOOL],
      tool_choice: { type: "tool", name: "leak_check_result" },
    });

    const call = response.content.find((block) => block.type === "tool_use" && block.name === "leak_check_result");
    const leaked = call?.input?.leaked === true;

    if (leaked) {
      console.warn(`[leakCheck] possible premature reveal of beat ${activeBeat.id} ("${activeBeat.title}") in drafted response`);
    }

    return leaked;
  };
}
