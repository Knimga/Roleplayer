import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { users } from "./users.js";

const PROMPT_PATH = fileURLToPath(new URL("./chapter-summary-prompt.md", import.meta.url));

// Read fresh on every call rather than cached at startup, so editing the
// prompt file takes effect on the next summary with no server restart
// needed - same reasoning as lib/claude.js's loadSystemPrompt.
function loadChapterSummaryPrompt(gameLabel) {
  return readFileSync(PROMPT_PATH, "utf-8").trim().replace("{{GAME_LABEL}}", gameLabel);
}

// Deliberately not the full buildPlayerRoster used for in-character replies
// (lib/claude.js): the chapter-summary call site never passes character
// details/descriptions/gear (see routes/conversations.js's /:id/summarize),
// so this only ever needs the plain "the two players are X and Y" line -
// no Role-vs-Class distinction to parameterize here.
function buildRoster(characterNames) {
  if (!characterNames) {
    return `The two players are ${users.map((u) => u.username).join(" and ")}.`;
  }
  return `The two players are ${Object.values(characterNames).join(" and ")}.`;
}

// Takes the app's own Anthropic client and model choice rather than
// importing them directly, since those are per-app (see lib/claude.js's
// MODEL selection). gameLabel fills in chapter-summary-prompt.md's one
// game-specific line (e.g. "Cyberpunk Red tabletop campaign" vs "DnD
// campaign in the homebrew world of Laria").
//
// A one-shot, tool-free call - summarizing is a fundamentally different task
// from in-character narration, so it gets its own prompt file rather than
// reusing dm-system-prompt.txt. Not cached: this only ever runs once per
// chapter transition, so there's no repeat request to benefit from it.
//
// The transcript is wrapped in a single user message rather than passed as
// history directly - a chapter's history naturally ends with the DM's last
// (assistant-role) reply, and the Anthropic API rejects a `messages` array
// ending in `assistant` as unsupported "assistant message prefill". Framing
// the whole transcript as one user-supplied document sidesteps that:
// there's exactly one user turn, and the summary is Claude's fresh
// assistant response to it.
export function createChapterSummaryGenerator({ client, model, gameLabel }) {
  return async function generateChapterSummary(history, characterNames = null) {
    const systemText = `${loadChapterSummaryPrompt(gameLabel)}\n\n${buildRoster(characterNames)}`;

    const transcript = history.map((row) => `${row.role === "assistant" ? "DM" : row.sender}: ${row.content}`).join("\n\n");

    const response = await client.messages.create({
      model,
      max_tokens: 1500,
      system: systemText,
      messages: [{ role: "user", content: `Here is the chapter transcript:\n\n${transcript}` }],
    });

    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("");

    return text.trim() || "The chapter's events could not be summarized automatically — please write one manually.";
  };
}
