# Spec: Campaign Situation — DM working memory

## Status

**Implemented (Phases A–C in one pass, 2026-09-12).** Decisions settled at
implementation time: `facts` cap 12; window 30 (trim target) / 40 (trigger);
the Situation pass escalates to Sonnet to confirm a milestone advance (Haiku
proposes, Sonnet's full rewrite is what's used); the pass never sees the next
milestone; the objective is surfaced only in the Campaign Management modal's
Situation tab, not the right panel. The Situation pass prompt also carries
three rules the spec below didn't spell out, from real-play patterns: the
"latest exchange" is *every* player message since the DM's previous reply
(players roleplay back and forth before prompting), OOC exchanges don't
advance the world, and combat is recorded by outcome only. Phase D items
(combat hop re-evaluation, leak-check scope extension) remain open.
The old Campaign Bible spec and the villain-plan spec it deferred to are
deleted (2026-09-13) — both fully superseded, nothing in them left to build;
see git history if the original design reasoning is ever needed. Prod needs
`db:migrate` run for both apps (drops `beats_tracker` / `villain_plan_tracker`,
adds `situation`), and still holds a pre-Situation Bible to be replaced by
regenerating — see §9 for that cutover and the cleanup it unblocks.

This spec supersedes the *role* of the old Campaign Bible spec — it keeps
the parts that work (a generated premise, an arc of waypoints, admin review
before persisting, cheap Haiku review passes, the 3-tier cached system
prompt) and replaces the part that doesn't: the idea that the only mutable
narrative state the DM needs is "which waypoint is active." It also
supersedes the deferred Villain's Plan spec outright: the antagonist line
below (§3.2, `antagonist.move` + `awareness`) does what that spec set out to
do, without the step-ledger/narrative-time design that spec never resolved.

Terminology is deliberately revamped. Old → new:

| Old | New | Why |
|---|---|---|
| Campaign Bible | **Blueprint** | "Bible" implies a big static text the DM reads. The static layer is a small premise + arc, not a reference book. |
| Central Conflict | **Premise** (contains the antagonist) | Same fields, but it now has a live counterpart in the Situation. |
| Beats | **Milestones** | Same idea (a destination state), but explicitly demoted to "skeleton" — the path lives elsewhere. |
| Beats Tracker | *(folded into the Situation)* | One mutable record, one rewrite pass, one source of truth. |
| Villain's Plan | **Antagonist line** in the Situation | One sentence, updated every turn, advances on player-visible events, no timers. |
| Tracker-update pass | **Situation pass** | Absorbs milestone advancement as one field of a broader rewrite. |
| *(nothing)* | **Situation** | The new thing: the DM's private, mutable, forward-looking working memory. |

Everything in this doc is scoped to shared DM behavior (`packages/server-core`
prompts/code, the per-turn workflow, the admin modal). Lore, rules, and combat
docs are untouched.

## 1. The problem, stated properly

Observed in real play: no coherent arc, complications that obscure the goal,
no trackable quest, no independently acting antagonist, and a cost curve that
grows with every turn. These were being treated as five problems. They are one.

**The app treats the transcript as the DM's memory. A transcript is a record,
not a memory.** Every turn, the narration call reconstructs "what is going on"
from the entire chapter transcript (35k+ tokens in the real Cyberpunk chapter)
plus one static destination (the active beat). Between turns, the only mutable
narrative state in the whole system is a single integer: the active beat's
index. Nothing records the players' current objective, the DM's intended next
setup, or what the antagonist is doing. All of that is re-derived from raw text
every turn, and re-derivation from a large noisy transcript biases toward
*adding* (the next interesting complication) over *converging* (the next step
toward the goal).

A human DM runs on a small private plan: what the players are trying to do,
what I'm setting up next, what the villain is doing right now, what the players
know versus don't. It's short, mutable, and forward-looking. The app has no slot
for it. Each listed symptom maps directly to that missing slot:

- **No clear quest** → beats are end states, and `campaign-bible-prompt.md`
  forbids them from containing a path. No field anywhere holds "the players'
  current objective." A quest can't exist because nothing stores one.
- **Complications obscure the goal** → with no recorded objective, "add" is the
  safest generative move. The Narrative Momentum / Active Beat Steering
  sections in the core prompt are behavioral exhortations patching a state gap.
  They help at the margin; they cannot substitute for the missing state.
- **No coherent arc** → arc = destination + current position + trajectory. The
  app supplies only the destination.
- **No independent antagonist** → the villain-plan spec stalled on measuring
  narrative time. The real blocker was simpler: nowhere to store "what the
  antagonist is doing right now."
- **Beats stall** → the tracker pass judges a distant end state, binary,
  retrospective, conservative-by-design. It can answer "did we arrive," never
  "are we moving."

One assumption in the current design was also wrong: "outcomes not paths"
conflated two things. Dictating the *method* is railroading. Stating the
*problem* is not. "DM presents the problem, players choose how to solve it" is
exactly a visible objective with an open method. The beats rule discarded the
objective along with the method.

## 2. The design in one paragraph

Two layers. A static **Blueprint** (premise + milestones), generated once and
admin-reviewed, exactly like the Bible today. A mutable **Situation** — four
short fields plus milestone progress — rewritten after every DM response by a
cheap Haiku pass that reads the previous Situation and only the latest
exchange. The narration call reads the Blueprint's premise, the active
milestone, and the Situation every turn. Once the Situation exists and is
trusted, the narration call stops receiving the full chapter transcript and
receives a bounded recent window instead. Net effect: the DM has a memory, a
quest, an intention, and a live antagonist, and per-turn cost goes down.

## 3. Data model

Two jsonb columns on `stories` (both apps' `schema.js`):

- `campaign_bible` — **kept as the column name**, now storing the Blueprint.
  Renaming a column buys nothing; the code-level name becomes `blueprint`.
- `situation` — **new**. The mutable record.
- `beats_tracker` and `villain_plan_tracker` — **dropped** in the same
  migration. Milestone progress moves into `situation`. No prod Story has a
  Bible/beats yet (confirmed: the live Cyberpunk campaign had none active), so
  this is a clean break, not a data migration.

### 3.1 Blueprint (static, immutable after approval)

```json
{
  "campaignInput": "…player-provided tone/themes/threats…",
  "premise": {
    "type": "Person | Faction/Organization | System | Force | Hybrid",
    "identity": "…",
    "motivationOrNature": "…",
    "publicFace": "…",
    "resources": "…"
  },
  "milestones": [
    { "id": "m1", "title": "…", "narrative": "…what is TRUE once reached…" }
  ],
  "openingSituation": { …same shape as §3.2 minus milestone fields… }
}
```

`premise` is the current `centralConflict`, unchanged in content. `milestones`
are the current beats, unchanged in content and still 3–5, still described as
destination states. `openingSituation` is **new**: the generator also writes
the campaign's opening Situation (the first problem presented, the DM's first
intended setup, the antagonist's opening posture). Today a Bible creates no
first quest at all — the campaign starts with a destination and no hook. The
admin reviews `openingSituation` alongside everything else; on approval it
seeds `situation`.

### 3.2 Situation (mutable, rewritten every turn)

```json
{
  "objective": "What the players are currently trying to do, as they'd understand it.",
  "nextMove": "What the DM is setting up next to move the story toward the active milestone.",
  "antagonist": {
    "move": "What the premise's antagonist is doing right now / about to do.",
    "awareness": "unaware | suspects | aware | hunting"
  },
  "facts": [
    "Rolling, capped list of established facts and what the players know."
  ],
  "activeMilestoneId": "m2",
  "revision": 41
}
```

Field semantics, precisely:

- **`objective`** — the quest. Stated as the *problem in front of the players*
  or *the goal they chose*, never a required solution. Allowed to be visible
  in-fiction (NPCs can say it, the world can pose it). This is the field that
  turns a distant milestone into something players can pursue right now.
- **`nextMove`** — the DM's private intention. Prospective. The single field
  no current mechanism has: every existing pass judges the past; nothing
  records what the DM *means to do next*. Never surfaced to players.
- **`antagonist.move`** — the villain plan, reduced to its essential. One
  sentence, rewritten each turn in light of what players just did. Advances on
  player-visible events, not on a clock — which sidesteps the narrative-time
  problem that stalled the villain-plan spec entirely. **`awareness`** keeps
  the one villain-plan field that carried real weight, as a plain enum.
- **`facts`** — the bounded memory. Capped (start at 12 bullets). The pass
  *rewrites* the list — merging, dropping resolved items, keeping what still
  matters — rather than appending, so drift and growth are both bounded. This
  is the per-turn bullet log idea from the Phase 3 discussion, made safe by
  the cap and the rewrite-not-append rule.
- **`activeMilestoneId`** — replaces the beats tracker. `null` once the arc is
  exhausted. Milestone *status* is derived: everything before it in the
  Blueprint's array is complete, everything after is pending.
- **`revision`** — monotonic counter, bumped on every rewrite. Lets the admin
  tab and logs show "rewritten N times," and lets a failed rewrite be detected
  (see §5.3).

**Precedence rule, stated for the DM**: the recent transcript window is ground
truth for what just happened; the Situation is ground truth for everything
older than the window. Where they conflict, the transcript wins for recent
events and the Situation wins for compressed history. The core prompt says
this explicitly (Appendix A).

## 4. Per-turn workflow

```
player "Ask the DM"
  → narration call  (system: core | premise+milestone | situation | roster;
                     messages: recent window, or full history in Phase A)
  → in parallel, both blocking (unchanged from today's pattern):
      Situation pass   (Haiku)  → rewrites `situation`, may advance milestone
      Leak-check pass  (Haiku)  → unchanged
  → persist + publish the DM message
```

### 4.1 Narration call — system prompt tiers

Today: `[core (cached) | bible: premise+beat (cached) | roster (uncached)]`.

Proposed: `[core (cached) | premise + active milestone (cached) | situation (uncached) | roster (uncached)]`.

The Situation changes every turn, so it **must not** share a cache breakpoint
with the premise/milestone block — a per-turn change there would invalidate the
whole tier every turn. It gets its own uncached block *after* the cached ones
and before the roster. It's ~300–500 tokens; uncached is fine. The premise +
milestone block keeps today's stability (invalidates only on milestone
advance). No cache regression versus today.

Injected text shape (replaces `buildCampaignBibleContext`):

```
# Hidden Campaign Context
…secrecy preamble, as today…

## Premise
Type / Identity / Motivation / Public Face / Resources

## Milestone to Steer Toward: <title>
A destination, not a fact that's already true.
<narrative>
```
then, as its own block:
```
# Current Situation (your working memory — rewritten after every turn)
Objective (what the players are pursuing; may surface in the fiction): …
Your next move (private): …
Antagonist right now (private): … — awareness: <enum>
Established facts:
- …
```

### 4.2 Situation pass

Runs after narration is drafted, in parallel with leak-check, blocking (same
reasoning as today's Phase 3 decision (2): the very next turn must see the
updated Situation). Replaces the tracker-update pass outright.

- **Model**: Haiku (`REVIEW_PASS_MODEL`). Same model as the pass it replaces.
- **Inputs**: the previous Situation, the premise, the active milestone
  (title + narrative — *not* future milestones), and the latest exchange only
  (the player message(s) that triggered this turn plus the drafted DM
  response). Not a 20-message window. The previous Situation *is* the window's
  job now; that's the whole point.
- **Output**: one **forced** tool call, `update_situation`, carrying the
  complete new record (`objective`, `nextMove`, `antagonist`, `facts`,
  `milestoneReached: boolean`). Forced, not `auto`, because the record always
  needs a rewrite — unlike `update_beats`, "no call" is never a valid outcome.
  The server advances `activeMilestoneId` when `milestoneReached` is true
  (server stays the sole mutator of milestone index, as today).
- **Milestone judgment** keeps the current tracker pass's conservatism
  (irreversible, so "when ambiguous, don't advance") but now judges against
  the previous Situation + latest exchange rather than a raw window — the
  `facts` list already carries the cumulative evidence the 20-message window
  existed to provide, and it carries it *across chapter boundaries*, which the
  window never could (closes the Phase 3 "chapter-boundary caveat").
- **Cost**: premise (~300 tok) + milestone (~100) + previous Situation
  (~400) + latest exchange (~1–2k) ≈ 2–3k input tokens on Haiku. Today's
  tracker pass reads ~20 messages ≈ 5–10k. Cheaper, and it does more.

### 4.3 Transcript window (Phase B)

Once the Situation is trusted, `generateReply` sends a bounded recent window
instead of the full chapter history.

**Caching interacts with this and it matters.** Today's full-history approach
caches the entire prefix through the prior exchange, so a cache *hit* turn only
pays cache-read price (~10% of input) on the old messages. A naive sliding
window (drop one message per turn) changes the prefix every turn and busts that
cache — it would cost *more* per turn than full history, not less. So the
window uses **hysteresis**: keep the last `WINDOW_MAX` (start: 40) messages;
when the count exceeds it, trim to `WINDOW_MIN` (start: 30). The prefix is then
stable for ~10 turns at a time, and caching works on the turns in between.

Where the real cost win actually is — stated honestly, because the cost dot's
"137k characters" overstates the *typical* turn:

1. **The 5-minute cache TTL.** When players take longer than that between
   turns (normal for an async two-player game), the entire history reprocesses
   at full input price. That, not the cached steady state, is what makes long
   chapters expensive. A bounded window caps that worst case at ~40 messages
   forever instead of "the whole chapter."
2. **Quality, not just money.** Less noise in context is the same lever that
   fixes "complications obscure the goal." Truncation is a quality change that
   happens to save money, not the reverse.

The chapter recap ("Story So Far") is the first message of a chapter and will
eventually fall out of the window. That's fine: its continuity role is now the
Situation's, which persists per-Story across chapters. The recap stays because
it's *player-facing* — it's for the humans reading the chat, not the DM.

Your combat-hop idea becomes a special case of this mechanism: with a bounded
window plus a Situation, combat turns roll off the window and compress into
`facts` ("two dead guards in the cargo bay; Null lightly wounded") without a
second conversation, a hand-off protocol, or a delete step. Recommend
re-evaluating the hop *after* Phase B lands rather than building it first.

### 4.4 Chapter transitions

Unchanged mechanically (summary → admin review → new chapter → recap + intro).
Two improvements fall out for free: the Situation carries across the boundary
untouched (it's per-Story), and the chapter-summary prompt can drop its "Open
Plot Threads" section eventually, since the Situation is now the authoritative
open-threads record — but leave that for a later cleanup, not this spec.

## 5. Failure modes and how each is contained

### 5.1 A bad rewrite corrupts later turns

The central risk of any compressed state, and the reason the bullet-log idea
was declined earlier. Containment, in layers:

- **Capped `facts`**, rewritten not appended, so drift is bounded in size.
- **Recent window in the narration call**: nothing recent is ever lost to a
  bad compression — only old detail is compressed, the same bargain the chapter
  recap already makes and that real play has accepted.
- **Admin-visible and editable**: the Situation gets its own tab in the
  Campaign Management modal, editable per-field, same review pattern as the
  Blueprint. A drifting Situation can be corrected by hand in under a minute.
- **Rewrite validation**: the server rejects a rewrite that empties
  `objective`, exceeds the `facts` cap, or emits an invalid `awareness`; on
  rejection it keeps the previous Situation and logs (fail-open, same posture
  as `maybeAdvanceBeat` today). `revision` not incrementing is the tell.

### 5.2 The objective becomes a railroad

The prompt distinction is precise: `objective` records *the problem presented
or the goal the players chose*, never a *method*. The Situation pass is told to
rewrite the objective to match what players actually decided to pursue — if
they walk away from the presented problem toward something else, the objective
follows them, it doesn't drag them back. The DM prompt says: present problems,
not solutions; the players' chosen approach is theirs. A visible objective with
an open method is agency, not its opposite.

### 5.3 The antagonist line goes inert or goes rogue

Inert (never changes): the pass is explicitly asked each turn "given what the
players just did, what does the antagonist do next?" and the DM prompt says to
show that move in the world whenever the fiction gives an opening. Rogue (acts
on players it couldn't know about): `awareness` gates what the antagonist can
plausibly do, and the pass is told awareness only rises on events the
antagonist could actually observe. Both are testable in play, and both are
correctable by hand from the Situation tab — which is more than the deferred
villain-plan design could ever offer.

### 5.4 Spoilers via the Situation

`nextMove` and `antagonist` are private; the Fourth Wall rules cover them
exactly as they cover the milestone. Leak-check continues to run against the
active milestone; extending it to also check `nextMove`/`antagonist` is a
one-line change to its input, deferred until the base mechanism is proven.

## 6. What changes where

| Area | Change |
|---|---|
| `schema.js` (both apps) | add `situation` jsonb; drop `beats_tracker`, `villain_plan_tracker`; one migration each |
| `campaignBible.js` → `blueprint.js` | generator schema adds `openingSituation`; `buildCampaignBibleContext` → `buildBlueprintContext` + new `buildSituationContext`; `advance/revertBeatsTracker` → operate on `situation.activeMilestoneId` |
| `campaignTrackerUpdate.js` | **retired**, replaced by `situationPass.js` (`createSituationPass`) |
| `campaign-tracker-update-pass.md` / `-instructions.md` | **retired**, replaced by `situation-pass.md` (Appendix B) |
| `campaign-bible-prompt.md` → `blueprint-prompt.md` | terminology; adds `openingSituation` guidance |
| `dm-system-prompt-core.md` | Fourth Wall + Active Beat Steering → one section, "Working the Situation" (Appendix A). Narrative Momentum stays. |
| `lib/claude.js` (both apps) | 4-tier system array; `runSituationPass` replaces `runTrackerUpdatePass`; Phase B: windowed `toAnthropicMessages` |
| `routes/conversations.js` (both apps) | `maybeAdvanceBeat` → `maybeUpdateSituation`; window trimming in Phase B |
| `storiesRouter.js` | approve seeds `situation` from `openingSituation`; new `PATCH /:id/situation` (admin edit); advance/revert routes move to `activeMilestoneId` |
| `CampaignManagementModal.jsx` | tabs: Generate · Blueprint · Milestones · **Situation** (editable) |
| `leakCheck.js` | unchanged |
| `chapterSummary.js` | unchanged |
| old Campaign Bible spec, villain-plan spec | deleted — fully superseded, see git history |

## 7. Phases

Each phase is independently shippable and independently measurable — the
point is to learn whether the Situation actually changes DM behavior before
touching the transcript, not to ship a big-bang rewrite.

- **Phase A — Situation exists.** Schema, generator's `openingSituation`,
  Situation pass (replacing the tracker pass), injection, admin tab. **Full
  transcript retained.** Measures: does the DM's narration now reference a
  consistent objective; does the antagonist act; do complications converge.
  Judged on real play, not test scripts.
- **Phase B — Bounded window.** Hysteresis window in `generateReply`.
  Measures: per-turn cost (real `usage` numbers, not character counts), and
  any continuity regressions that the Situation failed to cover.
- **Phase C — Terminology + cleanup.** Rename prompts/UI to Blueprint /
  Milestones / Situation, mark old specs superseded, drop the `beats_tracker`
  reference from the cost-dot spec, decide whether chapter-summary's "Open
  Plot Threads" section is now redundant.
- **Phase D — Re-evaluate deferred ideas against the new baseline.** Combat
  hop (probably unnecessary), leak-check scope extension, Central Conflict
  leak-checking, Sonnet escalation on milestone-advance turns.

## 8. How we'll know it worked

Concrete, observable in real play, no instrumentation needed:

- A player asked "what are we trying to do right now?" can answer in one
  sentence, and it matches `objective`.
- A concrete lead, once delivered, is still the lead three turns later.
- The antagonist does something the players didn't cause at least once every
  N turns (pick N; 8–10 is a reasonable start), and it's consistent with
  `awareness`.
- Milestones advance. If the arc hasn't moved in a full chapter, something is
  wrong and the Situation tab should show why.
- Per-turn cost stops growing with chapter length after Phase B.

## 9. Cleanup owed once prod is migrated

The migration drops `beats_tracker` / `villain_plan_tracker` but deliberately
does **not** touch the `campaign_bible` column, so a pre-Situation Bible
survives it in place. Approving a newly generated Blueprint overwrites that
column outright, which is the intended recovery path — no data migration was
written because nothing in a legacy Bible is convertible (its arc lived in
the dropped tracker column). Dev's Bible was cleared manually on 2026-09-13;
prod's is still there pending the migrate + regenerate.

Until every environment has a real Blueprint, the admin modal carries code
that exists **only** to survive that legacy shape. Remove it once prod is
migrated and its Bible replaced:

- `legacyBlueprint` and the `LegacyBlueprintNotice` component
  (`packages/ui/src/CampaignManagementModal.jsx`). Pure legacy-shape handling,
  no other purpose.
- The `.premise` half of `hasBlueprint`'s shape check is the cheap part of
  this and can stay; it costs nothing and is a sane guard on server data.

**`ErrorBoundary.jsx` is not part of that cleanup.** It was added in the same
pass, but it isn't coupled to the legacy Bible — the Bible only *triggered* a
crash that the Generate tab could still produce on its own, since
`BlueprintDraftEditor` dereferences `draft.premise.*`, `draft.milestones[]`
and `draft.openingSituation.*` with no fallbacks, and that tab is the one
screen where a crash destroys a paid-for model run. Its money-protection
value is nonetheless weaker than it looks, because the localStorage draft
mirror added alongside it already prevents the loss on its own; what the
boundary adds is a readable error and a still-usable modal instead of a blank
app.

That makes "a boundary around one modal's tab content" the weakest of the
three options. The real choice, to make deliberately rather than by default:

- **Promote it to the app root**, where it earns its keep generically and
  turns every remaining white screen in either app into a readable error.
- **Delete it** and accept blank screens, relying on the draft mirror for the
  part that costs money.

Keeping it scoped to just this modal is the option to avoid. Undecided;
revisit with the prod cutover.

## Open Questions

- **`facts` cap**: 12 is a guess. Too small loses continuity; too large
  reintroduces noise. Tune from real play.
- **Window sizes**: 30/40 is a guess, calibrated only against "20 was enough
  for the tracker pass." Tune from real cost numbers.
- **Should the objective be shown in the UI?** It's player-facing in-fiction
  by design, so a small "current objective" line in the right panel is
  plausible and cheap. Not in scope here — product call, not a DM-behavior
  one.
- **Escalate the Situation pass to Sonnet on milestone-advance turns?** The
  original Bible spec wanted this for leak-check; it's more defensible here
  since advancement is irreversible. Deferred until Haiku's judgment is
  observed.
- **Should the pass see the *next* milestone's title** (not narrative) so
  `nextMove` can aim at it? Cheap and useful, but it's a spoiler surface in a
  field the DM reads. Start without it.

---

## Appendix A — Core prompt section (replaces Fourth Wall + Active Beat Steering)

```
# Working the Situation
If this session includes hidden campaign context, it arrives in two parts: a
Premise and a Milestone (the arc's next destination), and a Current Situation
(your working memory, rewritten after every turn). Treat them differently.

- The Situation is authoritative for everything older than the recent
  messages you can see. The recent messages are authoritative for what just
  happened. Where they disagree, trust the messages for recent events and the
  Situation for older history.
- **Objective**: this is the problem in front of the players, or the goal they
  chose. Present it, keep it present, let NPCs and the world refer to it — but
  never dictate how it gets solved. The players' approach is theirs.
- **Your next move**: this is what you intended to set up. Do it when the
  fiction gives you an opening. Don't announce it; make it happen.
- **Antagonist**: this is what the opposition is doing right now. Show it in
  the world when there's an opening — an NPC changes posture, a door that was
  open is now watched, a message arrives — scaled to its awareness of the
  players. The antagonist acts whether or not the players are looking.
- **Milestone**: the destination. Steer toward it through the objective and
  your next move; never state it, name it, or narrate it as already true.

Never mention any of this mechanism to players: no "objective," "milestone,"
"situation," or bookkeeping language in narration. Players only ever
experience a world that moves this way, never the machinery moving it.
```

## Appendix B — Situation pass prompt (replaces campaign-tracker-update-pass.md)

```
# Situation Pass — System Prompt

You are a dedicated review pass, not the DM. You run once, after a DM response
has been drafted. Players never see your output. You always call
`update_situation` exactly once, with the complete new Situation.

## Inputs
- The Premise (the campaign's antagonist and stakes).
- The active Milestone: `{id, title, narrative}` — a destination state. You
  do not see future milestones; do not speculate about them.
- The previous Situation: objective, next move, antagonist move + awareness,
  facts, revision.
- The latest exchange only: the player message(s) that triggered this turn
  and the DM's drafted response. You do not see older history — the previous
  Situation is your memory of it. Trust it.

## Rewrite every field
- **objective** — What are the players trying to do now, as they'd say it?
  If they pursued the existing objective, keep it (tighten wording if the
  goal sharpened). If they chose something else, follow them: record what
  they actually chose. Never write a method; write the problem or goal.
- **nextMove** — Given the objective and the milestone, what should the DM
  set up next to move the story toward the milestone? One concrete thing:
  an NPC, a complication, a discovery, an opportunity. If the previous next
  move happened this turn, replace it. If it hasn't happened yet and still
  fits, keep it.
- **antagonist.move** — Given what the players just did, what does the
  antagonist do next? It acts on its own goals, at a pace fitting its
  resources, and only on information it could plausibly have. If nothing the
  players did reaches it, it continues its previous move.
- **antagonist.awareness** — Raise only when the antagonist could actually
  have observed something (a witness, a trace, a report, a public act).
  Never lower it.
- **facts** — Rewrite the list, max {{FACTS_CAP}} entries: merge duplicates,
  drop resolved or superseded items, keep what a DM must remember (names,
  promises, injuries, what players know vs. don't). Newest, most relevant
  first. Concrete: names, places, objects — not summary.
- **milestoneReached** — true only if the state the milestone's `narrative`
  describes is now actually true, judged against the facts plus this
  exchange — not gestured toward, not likely soon. Advancement is
  irreversible: when in doubt, false.

## Output contract
Exactly one `update_situation` call. No prose.
```
