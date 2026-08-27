# Spec: DM System Prompt / Model Instructions

## Status
Implemented

## Summary
Claude's behavior as the DM is shaped by a system prompt defining its narration style, tone, game rules awareness, and how it handles player input.

## Requirements
- [x] System prompt is stored in a config file (not hardcoded in app logic)
- [x] Prompt instructs Claude to act as the DM/narrator, not as an assistant
- [x] Prompt includes narration tone guidelines (gritty, cinematic, reactive, etc.)
- [x] Prompt includes awareness of basic Cyberpunk Red rules at MVP (post-MVP: full rules via MCP)
- [x] Prompt establishes how Claude should handle both users' input together
- [x] Prompt can be updated without redeploying the app (relaxed to "without an app code change" — see Decisions)

## Content Areas to Define
- Narration voice and tone
- How to handle player decisions and improvisation
- How to use lore files (via MCP) to ground responses
- Turn structure: does Claude wait for both users before responding?
- How to handle out-of-character messages from users

## Decisions
- Storage: a flat text file (`server/config/dm-system-prompt.txt`), read fresh on every request (not cached at startup) so edits take effect immediately in dev without a restart. "Updated without redeploying the app" is relaxed to mean *a trivial content-only file change, no application code touched* — on Render that's still a redeploy, but a one-line content diff, not a logic change. A DB-backed live-editable config is overkill at this scale.
- Player identities are **not** hardcoded into the prompt file — the actual usernames from [server/config/users.js](../../server/config/users.js) are appended at request time (e.g. "The two players are Evan and Nick"). This is what fixes the placeholder prompt inventing a fictional second player.
- No per-conversation-type variation yet — a single prompt applies everywhere, since [conversation-management.md](../conversations/conversation-management.md) (main vs. side chats) isn't built. Revisit if/when side conversations need different instructions (e.g. an OOC planning chat vs. the main RP thread).
- Rulebook depth: only the core resolution mechanic goes in the prompt (1d10 + stat + skill vs. DV; crit success/fail rules) — enough for Claude to run checks narratively. Deeper rules content is deferred to [lore-file-access.md](../mcp-server/lore-file-access.md), not yet built.
- No in-app dice roller exists yet ([skill-checks-and-dice.md](../post-mvp/skill-checks-and-dice.md) is post-MVP) — the prompt instructs Claude to narrate rolls itself as part of the story for now, since that's already what it does today without being told to.
- Turn structure doesn't need to be explained in the prompt itself: Claude is only ever invoked via the explicit "ask the DM" action (see [shared-conversation.md](../chat/shared-conversation.md)), so by construction it only speaks when asked, using everything said since its last turn.

## Open Questions
- How out-of-character messages should be flagged by users (no UI convention exists yet — the prompt will just instruct Claude to use judgment on messages that read as OOC, e.g. starting with "OOC:")
