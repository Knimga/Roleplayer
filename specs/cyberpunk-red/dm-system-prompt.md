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
- Storage: a flat text file, read fresh on every request (not cached at startup) so edits take effect immediately in dev without a restart. "Updated without redeploying the app" is relaxed to mean *a trivial content-only file change, no application code touched* — on Render that's still a redeploy, but a one-line content diff, not a logic change. A DB-backed live-editable config is overkill at this scale.
- **Update: split into three files**, since the DM prompt turned out to be almost entirely identical between Cyberpunk Red and Laria 5e (noticed while adding the Fourth Wall precaution from `specs/campaign-bible.md`'s Phase 2 to only this app's prompt — a live example of exactly the drift this split prevents going forward). `server/config/cyberpunk-system-prompt.md` (this app's own opening line + Narration & Tone — the only genuinely game-specific voice content) and `server/config/cyberpunk-reference-files.md` (this app's own backstory/lore reference-file list, per-app since the filenames differ) are concatenated at request time with `packages/server-core/src/dm-system-prompt-core.md` (everything else — DM role, Player Agency, NPC dialogue, Response Tenets, skill-check/roll/combat mechanics, OOC handling, the Fourth Wall precaution, Physical descriptions, Weapons & Gear — byte-identical between both apps). Assembly order is tone-first (moved out of its original middle position, ahead of the shared core) so the app-specific voice gets top billing in the prompt rather than being sandwiched partway through — see `apps/cyberpunk-red/server/lib/claude.js`'s `loadSystemPrompt()`.
- Player identities are **not** hardcoded into the prompt file — the actual usernames from [server/config/users.js](../../server/config/users.js) are appended at request time (e.g. "The two players are Evan and Nick"). This is what fixes the placeholder prompt inventing a fictional second player.
- No per-conversation-type variation yet — a single prompt applies everywhere, since [conversation-management.md](../conversation-management.md) (main vs. side chats) isn't built. Revisit if/when side conversations need different instructions (e.g. an OOC planning chat vs. the main RP thread).
- Rulebook depth: only the core resolution mechanic goes in the prompt (1d10 + stat + skill vs. DV; crit success/fail rules) — enough for Claude to run checks narratively. Deeper rules content is deferred to [docs-file-access.md](../docs-file-access.md), not yet built.
- No in-app dice roller existed yet at the time this prompt shipped — it instructed Claude to narrate rolls itself as part of the story. Superseded once [npc-dice-roll.md](npc-dice-roll.md) and [player-dice-roller.md](player-dice-roller.md) shipped real dice tooling.
- Turn structure doesn't need to be explained in the prompt itself: Claude is only ever invoked via the explicit "ask the DM" action (see [shared-conversation.md](../shared-conversation.md)), so by construction it only speaks when asked, using everything said since its last turn.

## Open Questions
- How out-of-character messages should be flagged by users (no UI convention exists yet — the prompt will just instruct Claude to use judgment on messages that read as OOC, e.g. starting with "OOC:")
