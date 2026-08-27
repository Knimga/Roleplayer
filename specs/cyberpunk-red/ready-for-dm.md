# Spec: Mark Ready / Ready for DM

## Status
Planned

## Summary
A per-player, per-conversation toggle: a player marks themselves "ready" once they're done with their part of the current turn, so the other player can see (in the Party panel, live) that they're just waiting on them. Purely a signal between the two players — it has no effect on "Ask the DM," which remains available (or not) exactly as it already is today, to either player, regardless of either player's ready state. Replaces the earlier, purely-decorative "Mark Ready"/party-status placeholder (see [ready-status-placeholder.md](../ui/ready-status-placeholder.md)) with the real thing.

## Requirements
- [ ] Clicking "Mark Ready" (next to "Ask the DM") toggles the current player's ready state for the active conversation on; clicking it again toggles it off
- [ ] The other player, if they have the same conversation open, sees the toggling player's ready status in the Party panel — live, no refresh needed
- [ ] A player never sees their own ready state reflected back on the Party row (Party only ever shows the *other* player, same as everything else there)
- [ ] Both players' ready state automatically resets to "not ready" the moment the DM replies — a new round starts clean, never carrying a stale "ready" from the round that was just resolved
- [ ] Marking or unmarking ready has no effect on "Ask the DM" — its enabled/disabled state and behavior are completely unchanged by this feature
- [ ] A new Story starts with both players "not ready"; a new chapter also always starts with both players "not ready" (not carried over from the outgoing chapter, unlike HP/SP/avatar/description/gear)
- [ ] The button and Party status use the neon-cyan "ready" visual treatment already documented in the UI handoff (see [ready-status-placeholder.md](../ui/ready-status-placeholder.md)'s Decisions for where those CSS classes already live)

## Decisions
- **Reset trigger: a DM reply, not a sent message.** Asked directly whether ready should reset on the DM's next reply, on the player's own next message, or never automatically — a DM reply was chosen, since that's what actually closes out a round; "ready" always means "ready for *this* round." A player can still send a message and remain marked ready right up until the DM actually responds (e.g. an aside or a follow-up thought after already signaling they're done), which the "reset on own message" option would have prevented.
- **Storage**: a new `character_ready` jsonb column on `conversations`, shaped `{ "<username>": <bool> }` — same per-username map convention as `character_hp`/`character_sp`, always populated for both players from Story creation (no "missing key" state), same reasoning as [character-hp.md](../right-panel/character-hp.md)'s "Initial value" decision.
- **Not carried over to a new chapter, unlike every other character field.** HP/SP/avatar/description/gear all carry forward as "this is still true about my character." Ready is different — it's a signal about the *current round*, and a new chapter starts a fresh scene with no round in progress yet, so both flags are explicitly set to `false` at new-chapter creation rather than copied from the outgoing chapter.
- **Reset implementation**: `POST /:id/respond` writes `characterReady: { [userA]: false, [userB]: false }` in the same `conversations` update that already sets `lastMessageAt` after a successful reply — one write, not a separate round-trip. Both flags are always fully reset (not merged), since "a new round begins" applies to both players identically regardless of who was or wasn't marked ready.
- **Live update reuses the existing `"character-updated"` SSE event** ([party-panel.md](../right-panel/party-panel.md)'s Wound State live-sync mechanism) rather than introducing a new event type — `PATCH /:id/ready` publishes it after a successful toggle, and `POST /:id/respond` doesn't need to publish it separately for the reset, since that request already publishes `{ type: "created", message: saved }` for the DM's reply, which already triggers the same `refreshConversations()` on every open client (see `ChatView.jsx`'s SSE handler) — the reset piggybacks on a broadcast that was happening anyway.
- **Self-only, no admin override**: a player can only toggle their own ready state — same self-directed model as every other per-player field in this app (HP, SP, avatar, description, gear).
- **`PATCH /:id/ready` body is `{ ready: <bool> }`, not an implicit toggle server-side.** The client always knows its own current state (from the already-fetched conversation list) and sends the explicit target value, matching how `saveCharacterHp`/`saveCharacterSp` send explicit values rather than "flip whatever's there" — avoids any double-click/race ambiguity about which state a toggle-without-a-value would land on.
- **Gated the same way as other mutations**: `isMainStory` required, `assertActiveChapter` enforced (can't toggle ready on a locked chapter) — consistent with `PATCH /:id/hp`/`/:id/sp`, even though the button is already hidden client-side whenever the message form itself is (both live inside the same `isActiveChapter` branch in `ChatView.jsx`).
- **Party display reuses the exact CSS already written for the placeholder** ([ready-status-placeholder.md](../ui/ready-status-placeholder.md)) — `.party-ready-dot`/`.party-ready-label` plus their `.active` modifiers. That spec is updated to note it's now driven by real data instead of a hardcoded idle state; the CSS itself doesn't change.

## Open Questions
None currently.
