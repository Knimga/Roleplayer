# Spec: Secondary NPC Agendas (Deferred)

## Status

Never built. Originally scoped as part of the Campaign Bible (see
`specs/campaign-situation.md` for the system that replaced it — Blueprint +
Situation). Secondary NPCs were generated and admin-reviewable under that
older system but **never actually wired into gameplay** — nothing ever read
them back into a prompt — so this idea was never live in play and isn't
"replaced" by the Situation system the way beats/villain-plan were; it's
still an open, undecided feature. Renamed from its original
"Campaign Bible — Secondary NPC Agendas" title and its stale references
updated (2026-09-13) to match current terminology, since the file it used to
point to (`specs/campaign-bible.md`) no longer exists.

## What it was

2-4 NPCs connected to the campaign's premise, each with:

- `name`
- `wants` — their own goal, independent of the players' actions
- `knowsOrDoesntKnow` — what they know/don't know about the premise
- `reactionIfPlayersGetClose`

Generated once alongside the rest of the Blueprint (premise, milestones),
admin-reviewed/editable before persisting, same flow as everything else in
Blueprint creation.

## The gap that got this deferred

Both the original third-party spec and this codebase's first adaptation of
it described the same intended usage: an on-demand, Claude-initiated MCP
resource fetch — `getBibleSection('npc:<name>')` — triggered specifically
when *"a secondary NPC acts independently."* Unlike the premise and the
active milestone (which are unconditionally injected into every turn's
context), NPC agendas were meant to stay out of standing context and only
get pulled in the moment they were needed.

Neither spec ever explained how Claude would know to *make* that fetch. An
on-demand fetch keyed by name presupposes Claude already knows the NPC
exists and that now is a good moment for them to reappear — but if nothing
about the NPC is ever surfaced after Blueprint creation, there's nothing
left in context to remind Claude they exist at all. A gnome arcanist named
Gizzle, mentioned once during Blueprint generation and never again, is
functionally forgotten: Claude has no way to spontaneously recall "Gizzle
should show up now" if Gizzle's name was never seen again in any later
prompt. This is a bootstrapping gap in the original design itself, not an
implementation shortcut — building the on-demand fetch exactly as
originally specified would still hit it.

## The fix, sketched (not built)

Apply the same two-tier pattern this codebase already uses for lore docs
(see `cyberpunk-reference-files.md`/`laria-reference-files.md`): an
always-visible **index** pairs with **on-demand full content**.

- **Roster** (new, would live in the tier-2 cached block alongside the
  premise and active milestone — see `specs/campaign-situation.md` §4.1):
  just `name` + the one-line `wants` hook for each NPC — small enough to
  always be in context, so Claude is reminded these NPCs exist and can judge
  for itself when one belongs in a scene. NOT the full
  `knowsOrDoesntKnow`/`reactionIfPlayersGetClose` detail — that stays out of
  standing context, same reasoning as before.
- **Detail fetch**: pulled on demand, only once Claude — using the roster —
  has already decided this NPC's moment has come. Should be a plain shared
  tool schema in `packages/server-core` (matching `create_blueprint`'s
  precedent) rather than a true MCP-server resource, per this feature's
  established pattern of shared-not-per-app tool schemas.

**New leak-surface this reopens, not yet addressed**: the roster's `wants`
hook is exactly the kind of always-in-context content the active milestone
already turned out to be a spoiler risk for (see `leak-check-pass.md`'s
worked example). If/when this gets built, the roster hook line should be in
scope for leak-check alongside the premise and active milestone — not
treated as a separate, unconsidered risk.

## Open questions (inherited from never having been designed against real code)

- What triggers the fetch in practice — a system-prompt instruction telling
  Claude to consult the roster and reach for a detail fetch when it decides
  an NPC should act? Not drafted.
- Whether the roster itself needs any leak-check coverage before this ships,
  or whether that can follow once the mechanism exists (mirrors the same
  "ship narrowest first" question already resolved once for leak-check's
  active-milestone-only scope).
- Whether NPC agendas belong in the Situation's `facts` list instead of a
  separate mechanism now that Situation exists — a currently-relevant NPC's
  agenda could just be a fact, rewritten in and out as it becomes relevant,
  without a whole second roster/fetch system. Worth evaluating before
  building the two-tier design above from scratch.
