# Spec: Prompt Caching

## Status
Implemented

## Summary
Use Anthropic's prompt caching (`cache_control: { type: "ephemeral" }`) in `generateReply` to cut the cost of resending a growing conversation transcript on every "Ask the DM" call. Pure backend cost/latency optimization — no behavior or output change, no UI surface.

## Requirements
- [x] System prompt is sent as a cacheable block
- [x] MCP tool definitions are sent as a cacheable block
- [x] All conversation history except the newest turn is sent as a cacheable block, so only genuinely new content is processed fresh on each call
- [x] A cache miss (prefix doesn't match, e.g. first message in a conversation, or calls more than ~5 minutes apart) behaves identically to today — same output, just no discount that call
- [x] No change to response content/quality — verified by confirming normal DM replies still work correctly with caching enabled, not just that caching activates

## Decisions
- Breakpoint placement: one after the system prompt, one after the last MCP tool definition, one on the second-to-last entry in the merged message history (everything through the prior exchange is cacheable; the newest user turn + this turn's reply are always fresh, since caching a breakpoint that includes content still being modified within this call's tool loop wouldn't help anyway).
- Doc content fetched mid-turn via the MCP doc-reading tool (`read_lore_file` in cyberpunk-red, `read_doc` in laria5e — see [docs-file-access.md](docs-file-access.md)) is *not* specifically targeted by caching — it's never persisted across turns in the first place (only the final text reply is saved to Postgres), so there's nothing recurring there to cache. The real win is the ever-growing persisted transcript.
- No new dependency — `cache_control` is a plain field on existing Anthropic SDK request shapes (system content blocks, tool definitions, message content blocks), not a separate API.

## Open Questions
None currently.
