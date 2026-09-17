# Spec: Combat Encounters — an isolated combat mode with its own DM

## Status

**Implemented end to end, 2026-09-13** (Phase 1 in full; Phase 2's plumbing
in full, with content per app as noted). Builds on
`specs/campaign-situation.md` (Blueprint / Situation) and assumes it. This is
about *where* combat runs, *who* runs it, and *what crosses the boundary* in
each direction.

Decisions made at implementation time, where they differ from the wording
below:

- **`objectiveAchieved` is a three-value string enum** (`achieved | failed |
  partial`), not `true | false | partial` - same information, a shape JSON
  schema expresses cleanly.
- **The active combat is its own fetch** (`GET /conversations/:id/combat`,
  returning `{ id, messages }` only - the handoff context never leaves the
  server), not folded into the messages fetch, so no existing caller changed
  shape.
- **No auto-opening turn.** After the cut-in the combat block appears empty
  and the players click "Ask the DM" once; an empty combat transcript is the
  opening turn (the generator injects a never-persisted kickoff). Keeps one
  model call per request and makes a failed opening a plain retry.
- **Main-chapter player messages and rolls also 409 during combat**, not
  just `/respond` and `/new-chapter` - a stale tab shouldn't be able to split
  the transcript.
- **Manual overrides**: "⚔ Start combat" is in the selected active chapter's
  sidebar menu (admin); "End combat" is in the combat block's own header,
  where the fight is.
- **`combat.md` is now a pointer.** Its procedure moved into
  `combat-dm-core.md`, its mechanics (plus `npc-modifier-lookup.md`,
  `weapon-damage-reference.md`, the mechanical half of
  `player-damage-healing.md`) into `cyberpunk-combat-system-prompt.md`. The
  file stays so a lore lookup of it doesn't error, and it records the
  "hostilities, not objective" correction.
- **Narration `max_tokens` raised 1024 → 2048.** A live check showed a
  full handoff plus cut-in truncating at 1024, surfacing as "incomplete
  handoff" tool errors and two wasted roundtrips; at 2048 it completed in
  one.
- **Laria's combat roster appends Armor Class** (narrative roster never
  carried it; the combat DM resolves attacks against it).
- **Phase 2 content**: Cyberpunk's `enemy-stats.js` is a first-cut encoding of
  its two mechanical docs (`{ tier, weapon, archetype? }` → attack / defense
  / damage), expected to be reworked. Laria's is a placeholder
  (`{ creatureType, threatTier }` → empty block, combat DM works from
  general 5e) pending its combat docs. Both `adHocLookups` lists are empty;
  the lookup → persist → re-render path is built and tested with a fake.

**Reorganized 2026-09-14 into an engine + per-game module** (the layout the
§7 table now shows). The shared engine lives in
`packages/server-core/src/combat/` (`tools.js`, `context.js`,
`generator.js`, `router.js`, with a README that maps the whole flow), and
everything game-specific about combat lives in one folder per app,
`apps/<app>/server/combat/` (`index.js` exporting the module contract,
`enemy-schema.js`, `enemy-stats.js`, `lookups/`, `roll-message.js`,
`system-prompt.md`). Two contract changes came with it: the handoff's
per-enemy object is now **flat** and wholly the game's to define
(`withBaseEnemyFields` composes the game's fields onto the engine's
`name`/`description`/`motive`/`notes`; `generateCoreStats` receives the
whole enemy), replacing the nested `statInputs` fragment this spec
describes below; and the handoff-authoring guidance moved out of the core
narrative prompt into `prompts/combat-handoff.md`, loaded as
`start_combat`'s tool description so it's read at exactly the moment the
model fills the fields, and carrying the "transcribe, don't invent" rule
the live check showed was needed.
- **Testing was model-free** except for two Sonnet narration calls (the
  second after the `max_tokens` fix) confirming the terminal `start_combat`
  path with the real model. Everything else - tool loop, validation,
  outcome rendering, all routes, SSE events, cascade delete - ran against
  scripted generators and the dev DB.

Observed in the live check, for real-play tuning rather than code: the
narrative DM invented a third enemy where its own prior narration had
described two. The handoff prompt says "every enemy as the players can see
them"; if this recurs, tighten it.

## 1. The problem, and what the Situation system already does about it

Stated problem:

1. Combat is many messages — turns, OOC positioning questions, dice rolls,
   tactical actions.
2. That volume bloats the context the narrative DM and the Situation pass
   read, so details get missed.
3. Only a combat's *outcome* matters to the campaign.
4. Running combat is a distinct skill with a tighter workflow; mixing its
   instructions into the narrative DM's prompt makes both worse.

What's already true after the Situation work, stated honestly so this spec
only builds what's still missing:

- **(3) is handled.** The Situation pass prompt already records combat by
  outcome only, never blow-by-blow.
- **(2) is half-handled, and the other half got *worse*.** The Situation
  pass no longer reads a raw window, so combat noise doesn't reach it
  anymore. But the narration call now sends a bounded window (30–40
  messages). A 10-round fight with two players, rolls, and OOC questions is
  easily 40–60 rows — enough to evict *every* pre-combat narrative message
  from the window. When the fight ends, the narrative DM resumes with a
  window that is entirely combat and a Situation record for everything
  else. The compressed facts survive; the scene's texture, tone, and
  in-progress dialogue don't. Before the window existed, this couldn't
  happen. So isolation is now protecting narrative continuity, not just
  cost.
- **(4) is not handled at all.** During a fight the DM still carries the
  full narrative prompt, the premise, the milestone-steering instructions
  ("drive toward the milestone" is actively wrong mid-fight), and every
  lore tool. `combat.md` is one on-demand doc competing with all of that.
- **Cost** is now a secondary benefit, not the primary one. Per combat turn
  today: narration model (Opus in prod) with four system tiers and the
  window, plus a Haiku Situation pass, plus a Haiku leak-check. Isolation
  lets combat turns run on a smaller prompt, a cheaper model, and no per-turn
  passes.

So the feature is justified — for (2) and (4) — but the design has to be
judged against those two, not against "cost" or "outcome-only," which are
already solved.

## 2. Where the original proposal has holes

Taking the proposal point by point. Each of these is fixed in the design
below; they're listed here so the reasoning is visible.

1. **"A new conversation is branched off" can't literally be a
   `conversations` row.** `groupConversations` treats every conversation
   with a `storyId` as a chapter, so a combat row would appear in the left
   panel as "Chapter N+1," and `hasLaterChapter` would immediately *lock the
   real chapter* (the combat row is newer). It would also count toward the
   chapter numbering in `/new-chapter`, show up in the cost aggregate, and
   inherit edit/delete/lock rules written for player messages. The branch
   has to be a **combat record attached to the chapter**, with its own
   message storage — a logical branch, not a conversation. Everything the
   proposal wants from "a separate conversation" (fresh context, own
   prompt, deletable transcript) comes from that; none of the chapter
   machinery gets involved.

2. **"Combat begins" detection has an ordering problem, not just an
   accuracy problem.** If the narrative DM decides mid-response that
   combat has started, it has usually already narrated the first exchange
   of violence in the same response — resolving an attack the combat DM
   was supposed to resolve. The detection mechanism must be *terminal*:
   the moment the narrative DM signals combat, its own narration ends at
   the cut, and the players' declared action (the shot, the lunge) is
   passed across *unresolved* for the combat DM to open with.

3. **Detection will sometimes be wrong in both directions**, and the
   proposal has no backstop. A DM that narrates a whole brawl without
   flagging it, or flags a tense standoff as combat, is a certainty over
   enough sessions. Same for "combat over." Manual admin overrides (start
   combat / end combat) cost almost nothing to build, mirror the milestone
   advance/revert precedent, and turn a detection miss from "broken
   session" into "one click."

4. **The handoff is missing the two things the combat DM most needs to
   run the fight *well*:** the players' objective in this fight (escape,
   capture alive, protect someone, hold the door) and the exact action they
   just declared. Location, enemies, and circumstances describe the
   *start*; the objective is what tells the combat DM what's actually at
   stake each round (who the enemies target, what a "bad" outcome looks
   like, what to report at the end), and the opening action is what makes
   the first turn correct. The objective is deliberately **not** an exit
   condition — see §5.4 for why, and for the `combat.md` line that got
   that wrong.

5. **Enemy stat consistency is a persistence problem, not a tooling
   problem.** The proposal's "MCP API tools for creating basic enemy
   stats" has two ways to fail silently: the combat DM might not *call*
   the generator, and it might not *remember* the result across turns.
   The real invariant is: **every enemy number comes from a deterministic
   table, and is persisted the first time it's derived, so the model never
   invents one and never has to remember one.** Two mechanisms satisfy
   that, and both are needed: the small set of stats every fight uses
   (attack, defense, damage, the status ladder) is computed
   **server-side at handoff time** from per-game inputs the narrative DM
   supplies in `start_combat`, stored in the combat record, and injected
   every turn. The long tail — a specific skill bonus, a save, a special
   ability — is derived **on demand by a model-callable lookup tool that
   persists what it derives** into the same record, so the second time
   anyone needs that enemy's Stealth, it's already there and identical.
   Precomputing all ~18 D&D skills for every enemy would be waste; deriving
   one when it's actually needed, once, is not. (Phase 2; the framework
   doesn't depend on it. See §6 for the per-app contract.)

6. **HP was my earlier worry and this design dissolves it.** `characterHp`
   /`characterSp` live on the *conversation* row and are player-edited via
   `PATCH /:id/hp`. Because combat is not a separate conversation, the
   trackers keep working exactly as today — no copy-across, no sync.

7. **Not addressed by the proposal: what happens to the Situation pass and
   leak-check during combat, mid-combat reload, new-chapter during combat,
   Discord notifications, the "DM is rolling…" status, and the fact that
   Laria has no combat rules doc at all.** All covered below; the last one
   is a prerequisite, not a design point.

## 3. The design in one paragraph

Combat is a **mode of the active chapter**, backed by a `combats` record
and its own `combat_messages`. The narrative DM enters it by calling a
terminal `start_combat` tool whose structured input *is* the handoff; the
server persists that handoff (plus deterministic enemy stats, Phase 2) and
switches the chapter into combat mode. While active, every player message,
roll, and "Ask the DM" routes to the combat, and the reply comes from a
**combat DM**: same model client, a different and much smaller system
prompt (a shared combat-values core + the app's own combat procedure, with
the always-needed mechanical docs baked directly in rather than fetched —
see §5.3), the handoff as a cached tier, the roster, and the combat's own
short transcript — no Blueprint, no Situation, no milestone, no window, no
per-turn passes.
The combat DM exits by calling a terminal `end_combat` tool whose structured
input is the outcome. The server renders that into one ordinary DM message
in the main chapter, deletes the combat transcript, runs the Situation pass
once over the outcome, and the chapter is back in narrative mode. The UI
renders the whole thing inline in the same chat, visually set off, and
replaces it with the outcome message when it ends.

## 4. Data model

Two new tables in both apps' `schema.js` (shape identical across apps —
game-specific content lives inside `context` jsonb):

```
combats
  id            uuid pk
  conversationId uuid fk -> conversations   (the chapter it belongs to)
  status        text  'active' | 'resolved'
  context       jsonb (the handoff, §5.2)
  summary       jsonb null (the end_combat input, §5.4)
  createdAt, resolvedAt

combat_messages
  id, combatId fk -> combats, sender, role, content, authorUsername, createdAt
```

Why a separate message table rather than a `combatId` column on
`messages`: the existing message routes carry subtle rules (chapter lock,
edit/delete lock-once-DM-replied, the cost aggregate,
last-message checks) that would all need a `combatId IS NULL` filter. Combat
messages need none of those rules — they're ephemeral and never edited — so
giving them their own table leaves every existing query untouched.

Invariants: at most one `active` combat per conversation; combat can only
start in the active (unlocked) chapter; `/new-chapter` and the main
`/respond` are refused (409) while a combat is active.

The resolved `combats` row is **kept** (context + summary, a few KB) after
its messages are deleted — it's the admin's only way to answer "why did the
DM decide the fight went that way," and it costs nothing. Only the
transcript is deleted, which is what the proposal actually cared about.

## 5. Workflow

### 5.1 Entering combat — `start_combat` (narrative DM)

`generateReply`'s tool list gains `start_combat`. The core prompt's Combat
section changes from "determine whether they are in combat" to: *the moment
violence actually begins — a weapon is used, or anyone takes a hostile
physical action — call `start_combat`. Not for threats, standoffs, or
posturing. Your text before the call is the cut-in only: narrate up to the
instant it breaks out and stop; do not resolve any attack.* The tool is
**terminal**: when the loop sees it, the accompanying text blocks become the
DM's message, the loop does not continue, and `generateReply` returns
`{ text, combatHandoff }` instead of a bare string (both call sites per app
updated; `/new-chapter`'s intro call ignores a handoff — a chapter can't
open into a fight).

The `/respond` route then: persists the cut-in as a normal DM message
(so the chapter transcript reads "…his hand goes to the holster—" then, later,
the outcome), creates the `combats` row with the handoff, runs Phase 2's stat
generation into it, publishes `combat-started`, and runs the Situation pass
on this exchange as usual (the cut-in is a real narrative event).

**Manual fallback**: admin-only "Start combat" in the chapter's menu, which
calls a dedicated narrative-DM call whose *only* job is to produce the
handoff from the current scene (same schema, forced tool choice). Used when
the DM narrated a fight without flagging it.

### 5.2 The handoff (`start_combat` input schema)

- `cutIn` — implicit: the text blocks in the same response.
- `location` — rich physical description: layout, cover, exits, light,
  distances. This is the battlefield; `combat.md` is theatre-of-the-mind
  and needs it stated once, well.
- `enemies[]` — `{ name, description, motive?, notes?, statInputs }`.
  `statInputs` is a **per-app sub-schema**, not a fixed shape: each app's
  enemy-stat module (§6) contributes its own JSON-schema fragment, and
  `start_combat`'s tool schema is composed from the shared fields plus
  that fragment at startup. Cyberpunk's is likely `{ archetype, tier }`
  (`"thug"`, `"solo"`, `"drone"` / tiers 1–5, straight from
  `npc-modifier-lookup.md`); Laria's will be whatever its combat docs
  eventually define (creature type, threat tier, size…) — deliberately not
  decided here. The narrative DM fills it from the scene; the server turns
  it into numbers. Named NPCs get `motive`/`notes` (personality, known
  abilities). *No unrevealed campaign secrets* — the narrative DM is told
  the handoff is scoped to what the fight needs, and Fourth Wall rules
  apply to it.
- `circumstances` — time pressure, noise/attention risk, reinforcements
  possible, environmental hazards, or "isolated, inconsequential."
- `objective` — what the players are trying to achieve in this fight, as
  best the narrative DM can tell (escape / kill / capture / protect / hold).
  Shapes how the fight runs (what enemies press on, what the stakes are
  each round) and what the outcome reports. **Not an exit condition**: an
  objective can be met with hostiles still engaged — the civilian reaches
  safety while the thugs are still swinging — and combat continues until
  hostilities actually end (§5.4). When that happens the players' goal
  usually *shifts* (now: get out), and the combat DM should run the
  remaining rounds against the shifted goal, not the original one.
- `openingAction` — the players' declared action that started it, verbatim
  intent, **unresolved**. The combat DM's first turn resolves it.

Persisted as `combats.context`. Phase 2 adds `enemies[i].stats` — seeded
with the core stats at handoff, and grown in place by the ad hoc lookup
tools as the fight needs them (§6). The record is the single source of
truth for every enemy number for the life of the combat.

### 5.3 Combat turns — the combat DM

While a combat is active, the UI routes traffic to:

- `POST /combats/:id/messages` — player message (same `insertUserMessage`
  shape, into `combat_messages`; Discord notify reused).
- `POST /combats/:id/roll` — the dice roller (same roll math and message
  format as `/:id/roll`; posts into `combat_messages`).
- `POST /combats/:id/respond` — the combat DM. Same `pendingReplies` guard
  keyed by the *conversation* id, so main and combat can't generate
  concurrently.

#### 5.3.1 Prompt split — shared procedure *and* values, per-app mechanics

**Correction from this section's first draft**: it assumed Laria would run
initiative-order combat, making the turn structure itself game-specific and
therefore per-app. That's not the near-term plan. **Laria will run the same
Player Phase / Enemy Phase framework Cyberpunk already uses** — no
initiative, no per-creature turn order — specifically because it's simpler
for the combat DM to track reliably. Initiative order is a later, separate
feature (an actual initiative roller + turn tracker), not something this
spec should assume. That changes where the line sits:

- **Shared**: `packages/server-core/prompts/combat-dm-core.md` now carries
  the **procedural backbone itself**, not just abstract values — because
  right now it genuinely is identical across both games: the phase
  structure (Player Phase, then Enemy Phase, repeat), one-move-one-action
  per creature per phase, request-and-wait for player rolls, `roll_dice`
  for every NPC roll, enemy status tracked as a narrative ladder rather
  than HP, "keep tactical state legible every turn" (true today because
  neither app has a visual board), the **exit rule** (hostilities end
  combat, the objective doesn't — §5.4), OOC handling, fail-forward,
  player agency, narration economy. This is `combat.md`'s procedure
  section almost verbatim — it was never actually Cyberpunk-specific, it
  just hadn't been shared yet.
- **Per-app**: a new `cyberpunk-combat-system-prompt.md` /
  `laria-combat-system-prompt.md` now carries only the **game-specific
  numbers and roll mechanics** that plug into the shared phase structure:
  which die (1d10 vs d20), what a crit is and how it resolves, weapon/attack
  math (Combat Number vs. attack bonus/AC), and the status-ladder thresholds
  for that game. Much thinner than originally scoped — Laria's version no
  longer needs to invent a whole competing procedure, just its own numbers
  inside the shared one.

**This split is provisional, not structural**, and should be revisited the
moment an initiative roller/tracker exists for Laria: at that point the
phase-vs-initiative choice becomes a real per-app (or even per-combat)
difference again, and the procedural backbone currently living in
`combat-dm-core.md` would need to move to a per-app "combat mode" file, with
only the genuinely universal values (dice discipline, exit rule, OOC,
fail-forward, player agency) staying shared. Noted here so that future work
doesn't have to rediscover this — see §9.

#### 5.3.2 Docs — baked in, not a conditional list

The narrative DM's reference-files list works because most entries are
*conditional* — a given scene needs at most one or two of them. Combat is
different: `combat.md`, `npc-modifier-lookup.md`, `weapon-damage-reference.md`,
and `player-damage-healing.md` aren't sometimes relevant during a fight,
they're needed on essentially every combat turn. A conditional MCP list
(fetch-on-demand, one decision + one round-trip per doc) is the wrong shape
for something with a ~100% hit rate — same reasoning that retired Laria's
`index.md` in favor of always-present hooks. So none of these are left as
`read_lore_file` targets; all get baked directly into cached prompt content
— just split across the two tiers per §5.3.1, not all dumped into one file:
`combat.md`'s *procedural* sections (phases, one-action-per-turn, request-
and-wait, tactical-clarity) move into the shared `combat-dm-core.md`, since
that's exactly the content that's now common to both games. Its CPR-specific
mechanical sections (the crit-exploding rule, how a phase resolves a
specific roll), plus the wholly-mechanical `npc-modifier-lookup.md`,
`weapon-damage-reference.md`, and `player-damage-healing.md` (Combat
Numbers, weapon damage dice, Cyberpunk's Wound State thresholds — none of
this has a shared analogue) go into `cyberpunk-combat-system-prompt.md`.
Laria's equivalent per-app file (§9) needs only its own numbers slotted into
the same shared procedure, not a competing structure.

The combat DM still has `read_lore_file`/`read_doc` available as a rare
escape hatch for a genuinely occasional sub-rule the baked-in docs don't
cover — but starts with no curated "load when relevant" list pointing it
there, unlike the narrative DM. If a real recurring occasional-lookup need
shows up in play, that's the signal to bake it in too, not to build a
second conditional list.

**Consequence for the narrative side**: once this ships, the narrative DM
no longer runs combat turns itself, so `cyberpunk-reference-files.md` should
drop `combat.md`, `npc-modifier-lookup.md`, and `weapon-damage-reference.md`
— dead weight in a prompt that no longer needs them. `player-damage-healing.md`
likely stays in the narrative list (narrating a wound days later, outside a
fight, is still a narrative-mode thing) in addition to being baked into
combat's core.

#### 5.3.3 The generator

The combat generator (`packages/server-core/src/combat.js`,
`createCombatGenerator({ client, model, gameLabel, getMcpTools, callMcpTool,
loadCombatSystemPrompt })`) builds:

1. **Cached**: the shared `combat-dm-core.md` (5.3.1 — the phase procedure
   + values) + the app's `<app>-combat-system-prompt.md` (5.3.1/5.3.2 — tone
   + this game's numbers/mechanics + the always-needed mechanical docs, all
   in one file's content).
2. **Cached**: the handoff, rendered (location / enemies with their stat
   blocks / circumstances / objective / opening action). Note the stat
   blocks can *grow* mid-combat as ad hoc lookups (§6) persist new values,
   which invalidates this tier's cache on that turn. That's fine: lookups
   are rare by design (only when a number is actually needed), the tier is
   small, and a stale-but-cached stat block would be worse than a
   re-cached one.
3. **Uncached**: the player roster (`buildPlayerRoster` reused — wound
   state, gear, descriptions).
4. **Messages**: the combat's own transcript, **unwindowed**. A combat is
   short-lived and bounded by design; losing the opening positions to a
   window would be worse than the tokens. If real fights routinely exceed
   ~60 rows, that's the signal to add a small mid-combat state record — not
   built now.

Tools: `roll_dice`, `end_combat`, (Phase 2) the app's ad hoc enemy-stat
lookup tools (§6), and `read_lore_file`/`read_doc` as the rare escape hatch
(5.3.2) — no curated combat reference-files list backing it. **No**
Blueprint, Situation, or milestone tiers — that's the whole point.
`onDiceRoll` → the existing "DM is rolling…" status. **Model**: a new
`COMBAT_MODEL`, Sonnet always (env-overridable). Tactical narration is more
structured than open narrative; Opus-in-prod isn't buying anything here, and
combat turns are the most frequent calls in a session.

No Situation pass and no leak-check per combat turn. The handoff is already
scoped; the Situation is updated once at the end.

### 5.4 Leaving combat — `end_combat` (combat DM)

The combat core's exit rule is about **hostilities, never the objective**:
*call `end_combat` only when no one is left both able and willing to fight
the players — every enemy is dead, incapacitated, fled, or surrendered — or
the players themselves have disengaged (escaped, out of reach) or are all
down, or both sides have genuinely stopped (a standoff or truce). Meeting
the players' objective does not end combat: if the civilian reaches safety
while thugs are still swinging, note that the objective is met, the
players' goal might shift, and keep running rounds
until hostilities actually end. Don't grind out the last helpless enemy —
narrate the wrap in your final text.* Terminal, like `start_combat`.

(`combat.md`'s own "Ending Combat" section lists "or the objective is met"
as an end condition — that's the line this spec's first draft inherited and
that the civilian-reaches-safety case breaks. `combat.md` is out of scope
here, but it should get the same one-line correction so the two don't
disagree; see Open Questions.)

Input schema:

- `outcome` — how hostilities ended: `victory | defeat | escaped |
  enemiesFled | enemiesSurrendered | standoff`
- `objectiveAchieved` — `true | false | partial`, reported *separately*
  from `outcome` because the two are independent: a victory can leave the
  objective failed (the civilian died anyway), and an escape can leave it
  achieved (they got the leader out and then ran).
- `narrative` — 3–5 sentences, player-facing and narrative-tone: states that a combat occurred, gives any key moments of the battle, how it ended and where everyone stands. This becomes the outcome message's prose.
- `partyStatus[]` — per player: condition in words (the DM doesn't own HP
  numbers; players do).
- `enemyStatus[]` — per enemy: dead / fled / captured / unconscious /
  unharmed-and-gone.
- `consequences[]` — the circumstances that fired: alarm raised, noise
  heard, reinforcements inbound, time lost, a named NPC's fate. This is
  what the campaign actually needs.

The server then, in order: renders `narrative` + a compact status block into
one **ordinary DM message in the main chapter**; marks the combat
`resolved` and stores the input as `summary`; deletes `combat_messages`;
publishes `combat-ended` with the new message; runs `maybeUpdateSituation`
with the outcome message as the DM reply (the Situation pass prompt already
knows to record fights by outcome — this is the one exchange where it sees
one) and `maybeCheckLeak` on it. Two consecutive DM messages (cut-in, then
outcome) are fine — `toAnthropicMessages` already merges same-role rows —
and the existing "DM already replied, send a message first" guard correctly
makes the players react before the narrative DM speaks again.

**Manual fallback**: admin-only "End combat", which runs a dedicated
combat-DM call with `end_combat` forced, for the DM that keeps fighting past
the point of sense.

### 5.5 UI

`ChatView` gets an `activeCombat` (id, context, messages) from the messages
fetch and from `combat-started`/`combat-message`/`combat-ended` SSE events on
the *parent conversation's* channel — no new subscription. While active:

- The combat's messages render after the main messages inside a visually
  distinct block (darker-tinted background, a thin "⚔ Combat" divider top and
  bottom). Same message components; no edit/delete affordances.
- The composer, the dice roller, and "Ask the DM" post to the combat
  routes. The roller is the only piece outside `ChatView` that needs the
  active combat id; it comes down through `App.jsx` like `conversationId`
  does today.
- "+ New Chapter" is disabled with a tooltip while a combat is active.
- Admin menu gains "Start combat" / "End combat".

On `combat-ended`, the block is removed and the outcome message appears as
a normal DM message in its place. Reload mid-combat restores the block from
the fetch.

## 6. Phase 2 — deterministic enemy stats: core at handoff, the rest on demand

The game systems differ too much for one fixed stat shape or one fixed
input shape, so this section defines a **per-app contract** and leaves the
content open. One invariant holds everywhere: *every enemy number is
derived from a deterministic table and persisted into `context.enemies[i]
.stats` the first time it's derived; the combat DM only ever reads.*

Per app, the combat game module (`server/combat/`, see the Status section
for the as-built layout — this section keeps the original design language,
where the game's fields were a nested `statInputs` object; as built they are
flat on the enemy) exports three things:

- **`statInputsSchema`** — the JSON-schema fragment for `enemies[].statInputs`
  in `start_combat` (§5.2). Whatever the narrative DM can name from the
  scene that the tables need: Cyberpunk probably `{ archetype, tier }`;
  Laria whatever its combat docs define. Composed into the `start_combat`
  tool schema at startup, so the narrative DM is asked for exactly the
  inputs this game's tables consume, no more.
- **`generateCoreStats(statInputs)`** → the small set every fight uses,
  computed **server-side at handoff** and stored before the first combat
  turn. Pure table lookup, no model. Cyberpunk: Combat Number by tier and
  damage dice by archetype (`npc-modifier-lookup.md` /
  `weapon-damage-reference.md` encoded), plus the status ladder `combat.md`
  already defines. Laria: attack / AC / damage / HP-equivalent by tier — but
  which fields, and from what tables, is decided when its combat docs exist,
  not here.
- **`adHocLookups[]`** — zero or more **model-callable lookup tools** for
  the long tail: a specific skill bonus, a save, a special ability's
  numbers. Each is `{ name, description, input_schema, resolve(enemy,
  input) → { path, value } }`. The combat generator registers them as
  tools alongside `roll_dice`; when the combat DM calls one, the server
  runs `resolve` deterministically from that enemy's stored core stats and
  inputs, **persists the result at `path` in the enemy's stat block**, and
  returns it. Idempotent by construction: the same enemy + the same skill
  always yields the same number, and after the first call it's already in
  the injected stat block so no second call is needed. This is the D&D
  case the fixed-shape design got wrong — ~18 skills per enemy is waste to
  precompute and trivial to derive once when Stealth actually comes up.
  Example: a Laria `lookup_enemy_skill({ enemy, skill })` → proficiency +
  ability modifier from the stored tier/type. In practice neither game
  uses one yet: both route skill-shaped checks through an MCP `npc_check`
  tool shared by the narrative and combat DMs instead (see §9), because a
  lookup here is reachable only from inside a fight.

The handoff render prints each enemy's stat block as it currently stands;
it grows as lookups land (see the cache note in §5.3). The combat core's
rule mirrors the dice rule: *never state an enemy number you weren't given;
if the block doesn't have it, look it up first.* The narrative DM never sees
stats — it names inputs, the server does the math.

Deferred from Phase 1 only because the framework is independently useful
and the tables are content work; the contract is fixed now so Phase 2 is
additive, and each app can fill it in at its own pace.

## 7. What changes where

As built (after the 2026-09-14 reorganization — see the Status section):

| Area | Change |
|---|---|
| `schema.js` (both apps) | `combats`, `combat_messages`; one migration each (+ a follow-up adding `combat_messages.edited`) |
| `packages/server-core/src/combat/` (new) — **the engine** | `tools.js` (`buildStartCombatTool`, `END_COMBAT_TOOL`, validators, `withBaseEnemyFields`), `context.js` (`buildCombatContext`, `renderCombatOutcome`), `generator.js` (`createCombatGenerator`), `router.js` (`createCombatsRouter`: `/combats/:id/messages`, `/roll`, `/respond`, message `PATCH`/`DELETE`, `/end`), `index.js`, and a `README.md` mapping the flow and the game-module contract |
| `packages/server-core/prompts/combat-dm-core.md` (new) | shared phase-based **procedure** (both games use it for now) + values (dice discipline, exit rule, OOC, fail-forward, player agency) — see §5.3.1. Provisional: reverts to per-app if/when Laria gets initiative |
| `packages/server-core/prompts/combat-handoff.md` (new) | what a good handoff contains, incl. "transcribe the scene, invent nothing"; becomes `start_combat`'s tool description |
| `apps/<app>/server/combat/` (new, per app) — **the game module** | `index.js` exports `{ enemySchema, generateCoreStats, adHocLookups, buildRollMessage, loadSystemPrompt }`; `enemy-schema.js` (what the narrative DM is asked per enemy, composed onto the engine's base fields); `enemy-stats.js` (core stats + tables, §6); `lookups/` (one file per ad hoc lookup); `roll-message.js` (the game's dice validation + message text, shared with the narrative `/roll`); `system-prompt.md` (per-app combat **mechanics only**, §5.3.1/§5.3.2 — Laria's needs its own numbers authored first, §9) |
| `<app>/server/config/<app>-reference-files.md` | drop `combat.md`, `npc-modifier-lookup.md`, `weapon-damage-reference.md` — the narrative DM no longer runs combat turns (§5.3.2) |
| `dm-system-prompt-core.md` | Combat section rewritten around `start_combat` (terminal, cut-in only) |
| `lib/claude.js` (both apps) | `start_combat` in the narration tool list (schema from the game module); `generateReply` returns `{ text, combatHandoff }`; `COMBAT_MODEL`; `generateCombatReply`/`generateCombatEnd`/`generateCombatHandoff` bindings |
| `routes/conversations.js` (both apps) | `/respond` handles a handoff; messages/roll/respond/new-chapter 409 while combat active; `GET /:id/combat`; admin `/combat/start` |
| `packages/core/src/api/` | `combats.js` client calls |
| `packages/ui/src/ChatView.jsx`, both apps' `App.jsx`/`RightPanel.jsx`/`DiceRoller` | combat block (with edit/delete), routing, active-combat plumbing |
| `LeftPanel.jsx` | New Chapter disabled during combat; admin Start combat |

## 8. Phases

- **Phase 1 — the mode.** Tables, router, generator, prompts, both tools,
  manual overrides, UI block. Combat DM looks stats up in the docs itself,
  as today. Measure: does detection fire at the right moments (both
  directions); does the outcome message carry what the next narrative turn
  needs; does the narrative DM's window survive a fight intact.
- **Phase 2 — deterministic stats.** The per-app module contract (§6):
  core stats at handoff plus ad hoc, persisted lookups for the long tail.
  Cyberpunk first (its docs exist, and it may need no lookups at all);
  Laria when its combat docs do, which is also when its lookup set
  (skills, saves) gets decided.
- **Phase 3 — tune.** Combat-turn cost from real `usage`; whether long
  fights need a mid-combat state record; whether leak-check should run on
  combat turns.

## 9. Prerequisites and honest caveats

- **Laria's stat tables are groundwork with placeholder values**
  (2026-09-16). The shape is settled in `apps/laria5e/server/combat/enemy-stats.js`:
  six abilities held at a *tier* (untrained / trained / expert / master, one
  bonus each) rather than a granular score; a class (the eleven 5e classes
  plus the homebrew Shaman) sets ability tiers, standout skills, which of the three
  classic saves (fortitude/CON, reflex/DEX, will/WIS) it's proficient in, a
  passive AC bonus, and behavior; a power level 1–5 sets
  the proficiency bonus, a small AC bonus, a shift along the tier ladder,
  and durability; melee/ranged weapons carry damage dice. Abilities and
  saves are precomputed into the block; skills are not — as in Cyberpunk,
  `npc_check` in Laria's MCP server (class + power level + skill / ability
  / save → lookup and roll in one call) serves both DMs, the combat DM
  passing class and power level from the enemy's block. A combat-only
  `lookup_enemy_skill` was built first and replaced by this the same day. Every number in the tables is a stand-in —
  with the illustrative +0/+5/+10/+15 tier bonuses a boss's attack sits
  around +20 against a d20, so tuning is the next step, not more structure.
  Laria still has no combat rules doc; the combat prompt describes how the
  block is used and leaves the values to the tables.
- **The "shared phase procedure for now" choice is deliberately temporary**
  (§5.3.1) — it's simplicity for the combat DM to track reliably, not a
  claim that Cyberpunk and D&D combat are the same thing. An initiative
  roller + turn tracker is a separate, later feature; when it lands for
  Laria, `combat-dm-core.md` needs to shed the procedural content back down
  to per-app, keeping only the genuinely universal values.
- **Detection is the crux and can't be verified without real play.** The
  tool-based trigger is the same decision point the core prompt already
  asks for every turn, made terminal and structured; the manual overrides
  are the backstop. If real sessions show frequent misses, the next lever
  is a cheap post-narration detector pass (Haiku, "did violence begin in
  this response?") — not built now.
- **No player-side OOC channel to the narrative DM during combat.** All
  traffic goes to the combat DM, which handles OOC per the shared rule.
  Simpler than two live channels; revisit only if it bites.
- **The combat transcript is gone once it ends**, by design. The kept
  `combats` row (handoff + outcome) is the audit trail.

## Open Questions

- Should the outcome message be visually marked (e.g. a "⚔ Outcome" label)
  or read as ordinary narration? Answer: YES. Mark outcome messages visually, for players' reference.
- `COMBAT_MODEL`: Sonnet always, or follow `MODEL`'s dev/prod tiering?
  Answer: Sonnet always.
- Whether `end_combat`'s `partyStatus` should be allowed to *suggest* HP
  changes the players then confirm, or stay words-only. Answer: NO. Players own their HP numbers.
- Discord: notify on every combat DM turn, or only start/end? Leaning
  every turn (a fight is exactly when the other player wants a ping). Answer: Every DM turn, including combat.
- The one risk the ad hoc lookups don't eliminate: the combat DM needing a
  long-tail number and *not calling the lookup*, fabricating instead. The
  "never state a number you weren't given" rule is the same mitigation the
  dice tool relies on today, and it has held up there. Worth checking in
  real play whether it holds as well for stats as it does for rolls; if
  not, the fallback is to pre-derive the handful of lookups an archetype
  most plausibly needs at handoff (still deterministic, still persisted —
  just eager for a few, lazy for the rest).
