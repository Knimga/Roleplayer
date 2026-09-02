// Calibrated against a real prod chapter (137,717 characters, ~34k tokens at
// the standard ~4 chars/token estimate) that the user judged to be right at
// the edge of "high cost". Character count, not a real token count, since
// Anthropic's exact per-turn usage isn't persisted anywhere - good enough as
// a rough proxy, not meant to be precise.
export const CHAPTER_HIGH_COST_CHARS = 140_000;

// Percent is intentionally unclamped past 100 - a chapter well past the
// threshold should say so (e.g. "142% to high-cost"), not cap out silently.
export function getChapterCostPercent(totalChars) {
  return Math.round(((totalChars ?? 0) / CHAPTER_HIGH_COST_CHARS) * 100);
}

// Color, unlike the percent shown in the tooltip, clamps at 0/100 - hue
// interpolates green (120) at 0% down to red (0) at 100%, and holds solid
// red past that rather than continuing to change.
export function getChapterCostColor(percent) {
  const clamped = Math.max(0, Math.min(100, percent));
  const hue = 120 - (120 * clamped) / 100;
  return `hsl(${hue}, 80%, 45%)`;
}
