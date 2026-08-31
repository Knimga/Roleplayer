# Spec: Campaign Bible — Villain's Plan (Deferred)

## Status

Deferred, not scheduled. Pulled out of the main Campaign Bible feature
(`specs/campaign-bible.md`) after Phase 1-2 shipped and Phase 3 planning
surfaced a real, unsolved problem — see "The Problem" below. This doc
exists so villain-plan design work can happen in its own focused pass
later, without cluttering the beats-only Campaign Bible spec/prompts that
are actively being iterated on now.

**What's still live vs. what's frozen here**: `campaignBible.js`,
`storiesRouter.js`, the Bible-creation tool schema, and the Campaign
Management UI no longer generate, store, inject, or display a villain's
plan at all as of the commit that created this doc — see "Removal" below
for exactly what got stripped. This doc is the frozen record of the
design work already done, kept as a starting point for whenever this
gets picked back up, not a description of current behavior.

## The Problem

The villain's plan is meant to represent "an ongoing, independent pursuit
of a goal... progressing whether or not players ever engage with it"
(original design intent, preserved below). That requires the tracker-
update pass to sometimes advance a step just because *time passed*, with
no player interference at all — this is what makes the antagonist feel
like a real actor instead of something that only ever reacts to players.

But nothing in the system tracks time at all. Narration constantly
implies time passing ("the sun sets," "you spend that evening," "three
days later") with no calendar, no dates, and no consistent granularity —
the DM's prose was never precise about this and was never going to be.
So "did meaningful narrative time pass" as a trigger condition has no
grounding: nothing distinguishes a deliberate narrative skip from ambient
scene-time flavor, and nothing measures how much passed relative to how
long a given step should plausibly take. Beats don't have this problem
(they're judged by story *state*, not elapsed time) — this is specific to
villain-plan's "acts on its own timeline" design goal.

## Candidate Solution A: categorical time-skip buckets

Proposed by a separate Claude session consulted on this feature. Not
adopted, not rejected — a real candidate, recorded here for whenever this
work resumes.

Don't build a literal calendar (unreliable — requires the DM to narrate
consistent, trackable dates every time, which prose-driven improvisation
won't do). Instead:

- **Detection criterion**: an *explicit, deliberate* narrative transition
  ("the next morning," "three days later," "you spend the following week
  laying low") as opposed to ambient scene-time within a continuous
  sequence ("as the sun sets," "an hour into the stakeout"). The first is
  a distinct authorial device; the second is just prose describing a
  scene in progress. Skips are a choice a writer makes, not something
  that happens accidentally, so this stays detectable from text alone
  without needing exact dates.
- **Bucket classification, not day-counts**: when a skip is detected,
  classify it as `none | short (hours-1 day) | medium (2-6 days) | long
  (1-4 weeks) | extended (month+)` rather than extracting a precise
  number — forcing "3.5 days" out of "a tense week or so" invents false
  precision that isn't in the text.
- **Per-step effort estimate, assigned once**: when a step becomes
  `underway` (at creation or when appended as an adapted step), tag it
  with the same bucket vocabulary: `estimated_effort:
  short|medium|long|extended` — a one-time judgment made when the step is
  written, not re-derived from scratch every turn.
- **Structure**:
  ```json
  {
    "step": 2,
    "description": "Quietly re-route Militech manifests to disguise shipment volume",
    "status": "underway",
    "estimated_effort": "medium",
    "elapsed_since_active": "short"
  }
  ```
  `elapsed_since_active` accumulates upward through the bucket scale
  (`none → short → medium → long → extended`) as skips are detected
  while the step remains underway. Passive progress becomes a simple
  comparison — has `elapsed_since_active` reached or exceeded
  `estimated_effort` — rather than an open judgment call re-litigated
  from nothing each response.
- **Where it would live**: a small `advance_story_clock(bucket)` tool
  alongside `update_beats`/`update_villain_plan` in the same dedicated
  tracker-update pass — same shape of task (narrow, text-grounded
  extraction), not a reason for a third pass.
- This also resolves the "days and days constantly passing" worry
  directly: since the trigger requires a *deliberate* skip device rather
  than any time-related language, ambient flavor text stops being a
  false-positive source entirely — it was never a skip to begin with, so
  it was never eligible to advance the clock.

## Candidate Solution B: single qualitative judgment (no persisted state)

Not designed in detail — recorded as the simpler alternative worth ruling
out before committing to Solution A's added data-model surface (two new
per-step fields, a new tool, an accumulator-comparison mechanism). Closer
to how beats already work: a single per-check judgment ("has this step
had enough uninterrupted time to plausibly have progressed, given what it
actually is") with no `estimated_effort`/`elapsed_since_active` bookkeeping
at all. Worth real comparison against Solution A once there's actual
signal from how the simpler beats-only tracker-update mechanism performs
in play — that signal doesn't exist yet, which is a first-order reason
this whole thing is deferred rather than decided now.

## Original Design Intent (preserved from specs/campaign-bible.md)

### Data model

```json
{
  "goal": "Complete a black-market cyberware shipment large enough to prove Ozuna's old division was worthless without him",
  "awareness_of_players": "unaware",
  "steps": [
    { "step": 1, "description": "Secure a second depot floor to increase shipment capacity", "status": "complete" },
    { "step": 2, "description": "Quietly re-route Militech manifests to disguise shipment volume", "status": "underway" }
  ]
}
```

- `awareness_of_players`: `unaware | suspects | aware | hunting`
- `status`: `pending | underway | complete | disrupted`
- `resolution` (optional) — populated on `disrupted`, describing what
  players did
- `adapted_from` (optional) — populated on a newly appended step,
  pointing at the disrupted step it responds to
- New steps always append at the next integer; existing step numbers are
  never reordered or reused
- `goal` was DB-only — never sent in per-request payloads (redundant
  with Central Conflict's motivation/nature, and forward-looking/
  spoiler-adjacent)

### Bible-creation content guidance (from campaign-bible-prompt.md)

> This is not a countdown to a fixed doomsday. It represents the ongoing,
> independent pursuit of the goal established in Central Conflict above —
> whether that conflict is a person, faction, system, or force, it is
> capable of acting on its own initiative, progressing whether or not
> players ever engage with it, and adapting cunningly if it becomes aware
> of the players and their interference.
>
> Provide a `goal` (one sentence, in the antagonist's own terms,
> independent of the players) and 3-6 sequential `steps`, each a concrete
> move (not a vague escalation). Step 1 should be something already
> underway. Write these as a sequence of moves a cunning actor would
> actually take, not a uniform ramp-up in danger — an early step might be
> quiet consolidation rather than an aggressive one.
>
> **IMPORTANT**: This plan is not fixed once written. If players disrupt
> or expose a step, or the antagonist reacts with a new one, that happens
> later during play via separate tracker updates — do not pre-write those
> reactions now; they only make sense in light of what players actually
> do. Do not frame this plan as a ticking clock or fixed deadline.

### Update decision logic (drafted, from campaign-tracker-update-pass.md)

> The villain plan represents an independent, intelligent actor pursuing
> its own goal. Your job is to judge whether *this specific response*
> gives it a reason to react — not to advance it on a fixed schedule.
>
> Two failure modes are equally bad here: advancing on speculative or
> minor player activity makes the antagonist read as erratic and
> overreactive; never advancing even when players take a clearly
> disruptive action makes it read as inert and defeats the reason this
> system exists. Weigh each active step independently against what
> actually happened in the response.
>
> For each currently `underway` step, ask in order:
>
> 1. **Did players take a concrete, in-fiction action this response that
>    plausibly exposes, blocks, or undermines this step?**
>    Concrete means something actually done — not discussed, planned, or
>    merely intended. If yes: this is disruption. Consult the MCP
>    procedure doc to determine exact handling (mark disrupted vs.
>    append an adapted step).
>
> 2. **If not disrupted — did meaningful narrative time pass (an
>    explicit time skip or session boundary) with no player interference
>    at all toward this step?**
>    If yes: this step may advance on its own passive timeline (see MCP
>    doc). Do not advance a step this way if the response was focused on
>    player activity elsewhere in the same scene/session — passive
>    progress applies to genuine downtime, not "players were busy with
>    something else this exact response." *(This step is exactly the
>    ungrounded check described in "The Problem" above.)*
>
> 3. **Did this response cause the antagonist, in-world, to learn
>    something new and specific about the players' identity, methods, or
>    goals** (not simply "players did something risky nearby")?
>    If yes: this may warrant advancing `awareness_of_players` by one
>    level. See MCP doc for exact handling.
>
> If none of the above apply to any active step: take no action on the
> villain plan this turn.

### Update procedure detail (drafted, from campaign-tracker-update-instructions.md)

> **Villain Plan — Disruption vs. Adaptation**
>
> When a step is disrupted:
> - Set that step's `status` to `disrupted`.
> - Write a short `resolution` describing what the players actually did,
>   specific enough that a future read of this record makes sense without
>   needing the original conversation.
> - Then decide: does the plan simply absorb this loss (nothing further
>   happens right now), or does the antagonist visibly adapt?
>   - Absorb when the disruption is minor or easily worked around by a
>     resourceful actor — not every setback demands an immediate
>     countermove.
>   - Adapt when the disruption is significant enough that a competent,
>     intelligent opponent doing nothing would strain plausibility.
>   - When adapting: append a new step at the next sequential integer
>     (never reuse or reorder existing step numbers), with `adapted_from`
>     pointing at the disrupted step, and set its `status` to `underway`.
>     Write its `description` as a concrete, specific reaction to what
>     players actually did — not a generic escalation ("send more
>     guards") that could apply to any disruption in any campaign.
>
> Do not mark a step `disrupted` for discussion, planning, or stated
> intent alone — only for something players actually did.
>
> **Villain Plan — Passive Progress**
>
> - When time genuinely passed without player interference, you may
>   advance one underway step to `complete` (if its description has
>   naturally run its course) or leave it `underway` and let it continue
>   — not every time-skip requires a state change. *(This is the same
>   ungrounded-duration problem — "naturally run its course" has no
>   mechanism behind it either.)*
> - Never combine passive-progress advancement and disruption-driven
>   adaptation for the same step in the same pass — resolve whichever
>   condition actually applies to that step; they are mutually exclusive
>   outcomes for a single step.
>
> **Awareness of Players**
>
> - Advance `awareness_of_players` one level at a time: `unaware →
>   suspects → aware → hunting`.
> - Exception: an unambiguous, overt event (players directly identified,
>   caught, or confronted by the antagonist's own people) can justify
>   skipping a level. Use this exception sparingly — bias toward the
>   single-step default.
> - Once `hunting`, any newly adapted steps should read as deliberate
>   counter-play targeted at these specific players — not a generic
>   increase in danger level.

## Removal (what got stripped and when)

Removed from all active code/prompts in the same commit that created
this doc:
- `campaignBible.js`: `villainPlan` from the Bible-creation tool schema,
  `findMissingFields`, `buildCampaignBibleContext`, `initializeTrackers`
- `storiesRouter.js`: `villainPlanTracker` from the approve/get routes
- Both apps' `claude.js`/`routes/conversations.js`: `villainPlanTracker`
  param and its two call sites
- `CampaignManagementModal.jsx`: villain's-plan fields/section, tab
  renamed from "Beats & Villain Plan" to "Beats"
- `campaign-bible-prompt.md`: the "Villain's Plan" content-guidance
  section
- `dm-system-prompt-core.md`: "Villain's Plan" mention in the Fourth Wall
  section (kept for Current Beat)
- `campaign-tracker-update-pass.md` / `campaign-tracker-update-instructions.md`:
  all villain-plan sections (preserved above verbatim)

**Left alone deliberately**: the `stories.villainPlanTracker` DB column
(both apps) — nullable, never migrated to production, harmless to leave
unused rather than writing a drop migration for a column with nothing to
lose either way. Reclaim or repurpose it when this feature resumes.
