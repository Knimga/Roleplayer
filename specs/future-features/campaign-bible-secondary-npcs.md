# Spec: Campaign Bible — Secondary NPC Agendas (Deferred)

## Status

Pulled out of the active Campaign Bible feature entirely — generation,
storage, and review UI all removed. Unlike Villain's Plan (which was
built, then reverted), Secondary NPC Agendas were generated and
admin-reviewable but **never actually wired into gameplay** — nothing in
`buildCampaignBibleContext` (or anywhere else) ever read them back into
a prompt. So removing them changes nothing about actual play; it just
stops asking Claude to generate content that was already inert. See
`specs/campaign-bible.md`'s "Secondary NPC Agendas Deferred" section for
the pointer back from the active spec.

## What it was

2-4 NPCs connected to the Central Conflict, each with:

- `name`
- `wants` — their own goal, independent of the players' actions
- `knowsOrDoesntKnow` — what they know/don't know about the central
  conflict
- `reactionIfPlayersGetClose`

Generated once alongside the rest of the Bible (Central Conflict, beats),
admin-reviewed/editable before persisting, same flow as everything else
in Phase 1.

## The gap that got this deferred

Both the original third-party spec and this codebase's adaptation of it
described the same intended usage: an on-demand, Claude-initiated MCP
resource fetch — `getBibleSection('npc:<name>')` — triggered specifically
when *"a secondary NPC acts independently."* Unlike Central Conflict and
the active beat (which are unconditionally injected into every turn's
context, per Phase 2), NPC agendas were meant to stay out of standing
context and only get pulled in the moment they were needed.

Neither spec ever explained how Claude would know to *make* that fetch.
An on-demand fetch keyed by name presupposes Claude already knows the
NPC exists and that now is a good moment for them to reappear — but if
nothing about the NPC is ever surfaced after Bible creation, there's
nothing left in context to remind Claude they exist at all. A gnome
arcanist named Gizzle, mentioned once during Bible generation and never
again, is functionally forgotten: Claude has no way to spontaneously
recall "Gizzle should show up now" if Gizzle's name was never seen again
in any later prompt. This is a bootstrapping gap in the original design
itself, not an implementation shortcut — building the on-demand fetch
exactly as originally specified would still hit it.

## The fix, sketched (not built)

Apply the same two-tier pattern this codebase already uses for lore
docs (see `cyberpunk-reference-files.md`/`laria-reference-files.md`):
an always-visible **index** pairs with **on-demand full content**.

- **Roster** (new, would live in the tier-2 cached block alongside
  Central Conflict and the active beat, per `specs/campaign-bible.md`
  §4.2): just `name` + the one-line `wants` hook for each NPC — small
  enough to always be in context, so Claude is reminded these NPCs exist
  and can judge for itself when one belongs in a scene. NOT the full
  `knowsOrDoesntKnow`/`reactionIfPlayersGetClose` detail — that stays out
  of standing context, same reasoning as before.
- **Detail fetch** (the originally-planned `getBibleSection('npc:<name>')`
  mechanism, or an equivalent plain tool call matching this feature's
  established pattern of shared tool schemas in `packages/server-core`
  rather than per-app MCP registration): pulled on demand, only once
  Claude — using the roster — has already decided this NPC's moment has
  come.

**New leak-surface this reopens, not yet addressed**: the roster's
`wants` hook is exactly the kind of always-in-context content the active
beat already turned out to be a spoiler risk for (see
`specs/campaign-bible.md` §6's Reiko Ishida example). If/when this gets
built, the roster hook line should be in scope for leak-check alongside
Central Conflict and the active beat — not treated as a separate,
unconsidered risk.

## Open questions (inherited from never having been designed against real code)

- Exact shape of the on-demand fetch mechanism: a true MCP-server
  resource (as both prior specs assumed), or a plain shared tool schema
  in `packages/server-core` matching `create_campaign_bible`/
  `update_beats`'s precedent? The latter fits this feature's established
  pattern better, but wasn't decided here.
- What triggers the fetch in practice — a system-prompt instruction
  telling Claude to consult the roster and reach for a detail fetch when
  it decides an NPC should act? Not drafted.
- Whether the roster itself needs any leak-check coverage before this
  ships, or whether that can follow once the mechanism exists (mirrors
  the same "ship narrowest first" question already resolved once for
  Phase 4's active-beat-only scope).
