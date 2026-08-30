import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const CORE_PROMPT_PATH = fileURLToPath(new URL("./dm-system-prompt-core.md", import.meta.url));

// Read fresh on every call rather than cached at startup, so editing the
// shared core prompt takes effect on the next reply with no server restart
// needed - same reasoning as every other prompt-loading function in this
// codebase (loadSystemPrompt, loadChapterSummaryPrompt).
export function loadDmSystemPromptCore() {
  return readFileSync(CORE_PROMPT_PATH, "utf-8").trim();
}
