# Spec: Campaign Bible

## Status

Phases 1-3 implemented; Phase 4 implemented in a deliberately narrowed
first form — detection only, checking only the active beat's own content
(see Phases below for what that covers and what's still pending). This
doc is the working reference for the whole build; update each phase's
status as work lands rather than treating this as a fire-and-forget plan.

Adapted from an external third-party technical spec (kept at the user's
Desktop as the original source of truth for the underlying idea) — that
version doesn't know this codebase's conventions and was never meant to
be followed literally. This doc is the version that actually governs
implementation; where the two differ, this one wins. Three material
departures from the original, decided before writing this doc:

1. **Shared architecture, not per-app.** Everything except each app's own
   MCP server registration lives in `packages/server-core`, following the
   same `createX({...})` factory pattern as `chapterSummary.js`.
2. **Tool-use/forced JSON schema for Bible creation, not prose-then-parse.**
   The original spec has Claude generate labeled markdown prose, then a
   backend deterministic parser extracts the Beats/Villain-Plan trackers
   from it — with no retry path if parsing fails. Since this app's
   `generateReply` already runs a tool-use loop every DM turn (`roll_dice`),
   Bible creation reuses that same mechanism: one call, forced tool-use
   with a JSON schema covering both the narrative prose fields and the
   trackers, so Claude emits valid structured data directly. Same goal as
   the original (one generation, no prose/tracker drift), no new fragile
   pattern.
3. **Admin review/edit step before the Bible persists.** The original goes
   straight from generate → parse → persist. This instead mirrors
   `story-chapters.md`'s chapter-summary flow: the admin reviews (and can
   edit) the generated content before anything is created. Because
   generation now produces structured fields directly (point 2), the
   review UI edits those fields directly (per-section text, not one flat
   textarea) rather than re-parsing edited prose.

## Villain's Plan Deferred

The Villain's Plan (independent antagonist agency, adapting to player
interference) has been pulled out of this spec entirely — generation,
storage, injection, and UI all removed — and moved to its own dedicated
doc: `specs/future-features/campaign-bible-villain-plan.md`. It surfaced a real, unsolved
problem while planning Phase 3 (no grounded way to measure narrative time
passing, which its "acts on its own timeline" design depends on) that
deserves focused design attention on its own, not layered onto an
unproven beats-only foundation. See that doc for the full problem
writeup, the candidate solutions considered, and everything already
drafted (prompt text preserved verbatim, not lost). Everything below now
describes the beats-only feature as it actually stands.

## Secondary NPC Agendas Deferred

Secondary NPC Agendas (2-4 NPCs connected to the Central Conflict, each
with their own goal/knowledge/reaction) have also been pulled out
entirely — generation, storage, and admin review UI all removed — moved
to its own dedicated doc: `specs/future-features/
campaign-bible-secondary-npcs.md`. Unlike Villain's Plan, this wasn't a
build-then-revert: these NPCs were generated and admin-reviewable but
never actually wired into gameplay in the first place (nothing ever read
them back into a prompt), so removing them doesn't change any actual
play behavior. Surfaced by a real, unaddressed gap in the original
design itself — an on-demand fetch mechanism that presupposes Claude
already knows an NPC exists, with no mechanism ever proposed for how
Claude would learn that in the first place. See that doc for the full
writeup and the sketched (not built) fix. Everything below now describes
the feature with NPCs fully out of scope too.

## Phases

- [x] **Phase 1 — Data model + creation flow.** Schema, the admin-triggered
  creation flow (campaign input → generate → review/edit → persist).
  Ship and validate generation reliability across several real runs
  before touching anything live. Implemented: `stories.campaignBible`/
  `beatsTracker` columns (both apps; `villainPlanTracker` column also
  exists but is unused — see "Villain's Plan Deferred" above),
  `campaignBible.js` (shared generator + `initializeTrackers`), the
  generate/approve/get routes on `storiesRouter.js`, and
  `CampaignManagementModal.jsx`'s Generate tab + the two read-only
  "danger zone" tabs (Bible Text, Beats — live tracker viewing,
  admin-only, red-styled per the spoiler risk).
  One real bug hit and fixed during testing: `max_tokens: 4096` was too low
  — a detailed Central Conflict + up to 4 NPCs + up to 5 beats (at the time,
  a villainPlan field too, since removed) routinely consumed the whole
  budget before the schema's last field was ever reached, so it silently
  came back `undefined` every time rather than malformed — confirmed via
  `stop_reason: "max_tokens"` logging, not just inferred. Fixed by raising
  `max_tokens` to 16000 (confirmed clean on the first attempt after) and
  adding `findMissingFields` validation with a retry-with-feedback loop as
  defense in depth, so a future truncation (or any other incomplete tool
  call) can never again reach the frontend as silently-broken data — it
  previously crashed `BibleDraftEditor` outright.
- [x] **Phase 2 — Per-request context injection + caching tiers.** Claude
  *reads* current beat state every turn; nothing writes yet. Isolates
  "does this change narration quality or cost" from "does mutation logic
  work."
- [x] **Phase 3 — MCP write tools + update decision logic.** `update_beats`,
  and the system-prompt/MCP-doc logic that decides when to call it (draft
  prompts already exist: `campaign-tracker-update-pass.md` +
  `campaign-tracker-update-instructions.md`, both beats-only now).
  Highest risk — a bad tool call now mutates campaign state mid-session.
  Design decisions made while planning this, before any code was
  written:

  (1) Runs as a **separate dedicated pass** after narration is drafted,
  not folded into the same tool-use loop as the narration call — keeps
  the update-judgment task from competing for attention with narration
  quality in one generation.

  (2) This pass and Phase 4's leak-check pass both **block the
  player-facing response** — neither is fire-and-forget after the
  response is already shown. For leak-check this is required (it can
  request a rewrite, which has to happen before players see anything);
  for the tracker-update pass it's a deliberate choice, not a
  requirement — beat-advancement doesn't affect what the player sees
  this turn, only what's injected into future turns, so it *could* run
  after the response is sent. Blocking anyway ensures the latest beat
  state is available for the very next turn, biasing the system toward
  timely forward motion rather than a lagging tracker. Since the two
  passes are logically independent (both read the same drafted response,
  neither needs the other's output), run them **in parallel** rather
  than sequentially — same latency-blocking outcome, roughly half the
  added wait. Neither pass needs the full cached system-prompt/tool-
  definition tier the narration call carries — just the drafted response
  plus whichever slice of state each actually needs.

  (3) `update_beats` lives as a **shared, plain tool schema in
  `packages/server-core`** — not registered on either app's own
  `mcp/server.js`. Mirrors how `create_campaign_bible` actually got
  built (a plain tool object passed directly in its own
  `client.messages.create` call, never an MCP-server-registered tool)
  rather than the "MCP Tools" framing §5.2 below still uses from the
  original spec — same reasoning as the rest of this feature: shared
  where the logic has zero per-app coupling.

  (4) The tracker-update pass needs more than just the single latest
  response to judge beat advancement correctly — a beat's narrative is
  often satisfied cumulatively across several turns (e.g. two
  independent facts revealed several turns apart, where neither turn
  alone contains both), not always by one self-contained scene.
  Single-turn isolation would systematically under-trigger on exactly
  this shape of beat, which turned out to be the common case, not an
  edge case, once real Bible generations were inspected. Fixed by giving
  the pass a window of recent history instead: the last 20 messages, or
  fewer if the conversation doesn't have that many yet — no attempt to
  bound the window by when the beat became `active` (that would need a
  timestamp nothing in the current data model stores; simpler to always
  use a flat, fixed-size window and accept the tradeoff below).
  Conservative by design, tune later only if real behavior shows it's
  actually needed, not preemptively. `campaign-tracker-update-pass.md`
  describes the windowing concept and the chapter-boundary caveat below,
  but deliberately doesn't state the exact count — that's a call-site
  config value, tunable without touching the prompt (the `20`/`19` in
  `maybeAdvanceBeat`, below). This doc is the one place the current
  actual number is recorded.

  **Implemented as**: `packages/server-core/src/campaignTrackerUpdate.js`'s
  `createTrackerUpdatePass({ client, model })` — one plain (unforced,
  `tool_choice: "auto"`) API call per turn with the `update_beats` tool
  available; "no tool call at all" is the expected common outcome, not a
  failure to retry against (unlike Bible creation, there's no
  `findMissingFields`-style validation loop here — nothing to validate
  when the response is legitimately empty).

  **Model, revised after Phase 4 shipped**: originally bound to `MODEL`
  (Sonnet-dev/Opus-prod, same as narration) — moved to the same
  `REVIEW_PASS_MODEL` constant as the leak-check pass (always Haiku, see
  §6/Phase 4 above) once real usage made it clear that was adding a full
  Sonnet/Opus-tier call to every single DM turn just to re-read a
  20-message window and judge one true/false-shaped question (advance or
  don't, plus a one-sentence reason) — not meaningfully harder than the
  leak-check judgment Haiku already handles. Considered (and set aside for
  now) building a cheaper-by-design alternative first: a persisted,
  chapter-scoped plot-summary bullet log, regenerated every 4 DM
  responses instead of every 1, with beat-advancement judged against the
  compressed bullets instead of raw messages. That idea has real merit
  independent of cost — it would also fix the chapter-boundary window
  reset and the compound/cumulative-fact-beat gap noted above — but
  trades away decision (2)'s "advance as soon as possible" bias (a
  4-response check cadence means players could see 1-3 replies narrated
  against an already-satisfied beat) and reintroduces the lossy-
  compression risk villain-plan's time-buckets were declined over: the
  advancement judgment would only ever see a cheap model's bullet
  summary, never the DM's actual words. Tried the free lever (Haiku swap)
  first since it's reversible and required no new persisted state;
  revisit the bullet-log design only if Haiku's judgment quality or
  latency/cost at this window size proves insufficient in practice.
  Re-verified end-to-end against the live API on Haiku specifically (not
  assumed from the leak-check pass's own verification) with the same
  shape of scenarios as the original test below — both passed.

  `update_beats` takes one
  required `reason` string (logged server-side for admin review via the
  Beats tab, never shown to players) — its only real effect is fixed and
  mechanical: `campaignBible.js`'s `advanceBeatsTracker` marks the
  current active beat `complete` and the next `pending` beat `active`,
  a pure function the caller persists. Wired into both apps'
  `routes/conversations.js` via a local `maybeAdvanceBeat` helper, called
  from both `/respond` and `/new-chapter`'s intro-generation site,
  *before* the narration message is saved/published (blocking, per
  decision (2) above) — no-ops immediately (no API call at all) if the
  Story has no active beat. Wrapped in try/catch: a tracker-update
  failure is logged and swallowed, never breaks the player's turn.
  `campaign-tracker-update-instructions.md` ended up not wired into the
  running code at all — once villain-plan was removed, its remaining
  content (advance at most one beat per pass) was already fully covered
  by `campaign-tracker-update-pass.md`'s own Output contract, so loading
  a second doc for zero additional guidance wasn't worth doing. Left in
  the repo as historical/reference material, not deleted.
  Verified with a real end-to-end test against the live API: a scenario
  with clear, undeniable in-fiction proof correctly called `update_beats`
  with a sensible reason; an unrelated side-content scenario correctly
  produced no tool call; a no-active-beat case correctly short-circuited
  before ever calling the API; `advanceBeatsTracker` verified directly
  for both a mid-tracker advance and a last-beat-in-the-arc case.

  **Chapter-boundary caveat, not yet resolved**: this window can't span
  a chapter boundary — starting a new chapter (`story-chapters.md`)
  begins a genuinely fresh `conversations` row with its own message
  history, seeded only with the AI-generated recap + intro. Early in a
  new chapter, the window is simply shorter than 20 messages, not a
  lookback into the outgoing chapter's history. The chapter's own recap
  message (already a condensed summary of everything that mattered in
  the outgoing chapter) is the closest thing to a mitigation here, since
  it naturally becomes part of the new chapter's early window - but it's
  a narrative-continuity summary written for the DM's own restart
  context, not engineered to preserve the specific granular signal a
  beat-advancement judgment needs. This is a known gap, not a solved one
  — revisit if real play shows beats stalling across chapter transitions
  specifically.

  **Candidate escalation, not built**: a persistent, per-turn bullet log
  of events (big and small), carried across chapters, could solve both
  gaps above at once — more information-dense than raw messages, and
  unlike the message window, doesn't reset at chapter boundaries. Not
  pursued now for the same reason villain-plan's time-bucket idea
  wasn't: new persisted state, a new per-turn generation obligation, and
  a new lossy-compression layer between what happened and what the
  judgment reads — real cost for a problem only hypothetical so far.
  Revisit only if real play shows the window approach actually failing,
  not preemptively.
- [x] **Phase 4 — Leak-prevention pass (narrowed first form).** Real,
  concrete motivation for this, not just the original spec's abstract
  worry: inspecting actual test-generated Bibles surfaced a beat whose
  `narrative` text named an antagonist ("Reiko Ishida") directly — proof
  that active-beat text, sitting in every turn's injected context (Phase
  2), can itself be a live spoiler, not just Central Conflict facts as
  the original framing assumed. Built narrower than §6 below originally
  specified: **detection only** (no automatic rewrite loop yet — see Open
  Questions), and checks the drafted response **in isolation against only
  the active beat's own narrative** — no Central Conflict identity/
  motivation, no villain plan (still deferred, see above). Shipping the
  narrowest, best-understood risk first and expanding once it's proven
  in real play, same discipline as every other phase here.

  **Implemented as**: `packages/server-core/prompts/leak-check-pass.md` +
  `packages/server-core/src/leakCheck.js`'s `createLeakCheckPass({ client,
  model })` — one forced tool call (`tool_choice` pinned to
  `leak_check_result`, unlike the tracker-update pass's `"auto"`, since
  this pass always owes a true/false answer, never a legitimate silence)
  with a single `leaked: boolean` field. The prompt frames the judgment as
  one true/false question sized for Haiku: a beat describes a destination,
  not an already-true fact, so a specific secret (a name, identity,
  discovery) stated as background color or an aside — unconnected to any
  investigative action the response itself depicts — is a leak; that same
  fact surfacing as the direct, in-fiction result of something players are
  shown doing this response is not a leak, it's the beat's own intended
  payoff (and the tracker-update pass, running in parallel, is what
  advances the beat when that happens — the two passes can legitimately
  read the same content differently without contradicting each other).
  Ambiguous cases default to `false` (no cost to waiting; a false positive
  would block a legitimate response for nothing).

  Model is **always Haiku** (`claude-haiku-4-5-20251001`, no dev/prod
  branch, unlike the narration call's `MODEL` constant — the user
  confirmed this explicitly) — cheap and fast on purpose for a single
  bounded judgment, not narration. Shares the same `REVIEW_PASS_MODEL`
  constant with the tracker-update pass, which was also moved onto it
  shortly after (see Phase 3's "Model, revised after Phase 4 shipped"
  note above) — both apps' `claude.js` bind both review passes to one
  constant, not two separately-named ones, since there's currently no
  reason for them to ever differ. The "switch to Sonnet if a beat was
  updated this turn" escalation from the original spec (§6 below) was
  dropped for this first pass: tracker-update and leak-check run in
  parallel (decision (2) above), so leak-check has no way to know the
  tracker-update outcome before it starts — the two would need to run
  sequentially to support that escalation, which conflicts with the
  parallel-latency design. Revisit only if Haiku's judgment quality proves
  insufficient in practice.

  Wired into both apps' `routes/conversations.js` via a local
  `maybeCheckLeak` helper — same shape as `maybeAdvanceBeat`, no-ops
  immediately if the Story has no active beat, wrapped in try/catch so a
  leak-check failure never breaks the player's turn — called via
  `Promise.all` alongside `maybeAdvanceBeat` at both call sites
  (`/respond` and `/new-chapter`'s intro-generation site), per decision
  (2)'s parallel-execution design. Currently **detection only**: a
  flagged response is logged server-side, not rewritten or blocked — see
  Open Questions for what's still missing before this can act on a leak
  rather than just report it.

## 1. Purpose & Context

The DM (Claude) currently improvises entirely beat-by-beat within a
single conversation's context. Without persistent long-term structure,
new plot threads and NPC reveals feel disconnected from any wider arc,
and the antagonist has no independent agency — it only reacts to what's
immediately in front of it.

The Campaign Bible is a hidden document generated once per Story,
containing a central conflict and a rough narrative arc ("beats"). It
gives Claude durable context to draw on across an entire Story —
including across separate conversations/chapters — without ever
exposing that context to players, preserving in-fiction discovery. (Two
pieces of the original design aren't part of this spec right now — an
antagonist's own independent plan, and secondary NPC agendas — see
"Villain's Plan Deferred" and "Secondary NPC Agendas Deferred" above for
why.)

**Out of scope for this spec:** the literal wording of any system prompt
addition or MCP doc. These are called out below by name/purpose only, as
`(LLM instructions — out of scope)`, wherever the workflow depends on one
existing.

## 2. Data Model (Phase 1)

### 2.1 Bible Text (immutable narrative content)

Generated once at Story creation, admin-reviewed before persisting (see
§3). Stored per-Story, organized into named sections (originally meant
to also support piecemeal fetching, §5.1 — superseded, see that section):

- **Campaign Inputs** — player text input; tone, themes, threat
  preference, desired storylines
- **Central Conflict** — Type (Person / Faction / System / Force /
  Hybrid), Identity, Motivation or Nature, Public Face, Resources
- **Beats** — 3–5 entries, each: `Beat ID`, `Title`, `Narrative`
  (describes a state the story should reach, not a scripted trigger —
  intentionally non-prescriptive)

This text is not edited during regular play. Mutable state lives only in
the tracker below.

### 2.2 Beats Tracker (mutable, structured)

One row/array entry per beat:

```json
[
  {
    "id": "beat_1",
    "title": "The Depot Job",
    "narrative": "A routine-seeming heist that's actually the players' first unknowing contact with Ozuna's operation...",
    "status": "active"
  },
  {
    "id": "beat_2",
    "title": "Loose Threads",
    "narrative": "Players start noticing the job doesn't add up...",
    "status": "pending"
  }
]
```

- `status`: `pending | active | complete`
- Exactly one beat `active` at a time (zero once the arc is exhausted)
- Deliberately holds no separate `trigger`/`consequence` field — a beat's
  completion condition is judged qualitatively against its `narrative`
  prose (a state to reach), not matched against a discrete string

## 3. Bible Creation Flow (Phase 1)

1. Admin clicks the ellipsis menu on an existing Story, then "Create
   Campaign Bible."
2. A modal collects campaign input (tone, themes, threat preference,
   desired storylines).
3. Backend calls Claude with: campaign input + bible-creation prompt
   (shared `.md` file, LLM instructions, per §Status point 1's
   architecture) + fetched lore/player-backstory context (existing MCP
   resources). Lore access at this step is required — it's how the
   generated Central Conflict and beats end up grounded in the actual
   world instead of generic placeholders.
4. Claude generates the full Bible Text (§2.1) **and** the initial
   beats tracker (§2.2) in one call, via forced tool-use with a JSON
   schema (see Status point 2) — not free prose requiring a second parse
   step.
5. **Admin review step**: the generated content is shown to the admin,
   editable per-section (Central Conflict fields, each beat's
   title/narrative) — same review-before-create UX as
   `story-chapters.md`'s chapter-summary modal. Canceling creates nothing
   at all.
6. On approval: Bible Text + the beats tracker are persisted, associated
   with the Story. Tracker defaults: `beat_1` → `active`, all other beats
   → `pending`.
7. The active beat becomes part of standard per-request metadata for all
   future calls on this Story (§4).

## 4. Per-Request Context Injection (Phase 2)

**Implemented as**: `packages/server-core/src/campaignBible.js`'s
`buildCampaignBibleContext({ campaignBible, beatsTracker })` — returns
`null` (no injection at all) if the Story has no Bible yet, otherwise a
text block with Central Conflict + the active beat, prefixed with an
explicit never-mention-this-to-players instruction. Wired into both apps'
`generateReply` (new trailing params) and called from both `/respond` and
`/new-chapter`'s intro-generation call site in `routes/conversations.js`.

**Fourth-wall precaution is defense in depth, not single-layered**: the
instruction lives both in the injected tier-2 block itself (present only
when a Bible exists) *and* as a standalone `# Fourth Wall & Hidden Campaign
Context` section added to each app's static `dm-system-prompt.md` (tier 1,
always present, harmless no-op for Stories without a Bible) — added
specifically because this is a structural leak risk (literally naming a
beat or tracker status) distinct from the semantic leak-check Phase 4
covers (revealing a secret *fact*, like the antagonist's true identity
early). Cheap enough to guard against directly rather than waiting on
Phase 4 to exist.

### 4.1 What's sent every call

Alongside existing metadata (character names, appearances, health
states):

- **Current beat**: `{id, title, narrative, status}` — the active beat's
  full record, narrative included. Safe to send every turn since it
  describes the *current* state of play, not a future spoiler.

### 4.2 Prompt Caching Strategy

Don't invalidate/rebuild the cached system prompt on every tracker
update — split the `system` parameter into cache tiers instead of one
monolithic cached block:

1. **Global static tier** (longest-lived cache) — general DM
   instructions, continuity-check rules, output format rules. Identical
   across all Stories and requests.
2. **Session/state tier** (cached, invalidated on actual change) —
   Central Conflict and current beat `{id, title, narrative, status}`.
   Only changes when a session starts or when `update_beats` actually
   fires — not on a fixed per-turn basis — so it stays cached across the
   (typically many) turns in between. ("Tone Guardrails," mentioned in
   the original third-party spec, was never actually part of the §2.1
   data model Phase 1 built — omitted here rather than invented on the
   spot; add it as a real field later if wanted.)
3. **Per-request tier** (uncached) — character metadata: health,
   position, and other combat/scene state that can plausibly change on
   every single response. Placed after tier 2 so its volatility doesn't
   force tier 2's larger, more stable block to be recomputed.

Only tier 3 is rebuilt every call. Tiers 1–2 persist across many calls
and are invalidated only when their underlying content actually changes
(a beat transition, a new session).

**Implemented as**: `generateReply`'s `system` param is now an array of
up to 3 blocks instead of one concatenated string — tier 1
(`loadSystemPrompt()`) and tier 2 (`buildCampaignBibleContext(...)`, when
non-null) each get their own `cache_control: { type: "ephemeral" }`
breakpoint; tier 3 (`buildPlayerRoster(...)`) has none, so it's always
sent fresh. For a Story with no Bible, this is just the pre-existing
2-block shape (tier 1 + tier 3) — no behavior change from before Phase 2.

## 5. MCP Interface (Phase 3, except 5.1 which Phase 2 also depends on)

Despite the section name (kept from the original third-party spec this
doc is adapted from), not everything here is necessarily a literal
MCP-server-registered tool/resource — see 5.2's note on `update_beats`,
which deviates from that framing the same way `create_campaign_bible`
already did.

### 5.1 MCP Resource (read-only) — planned, never built, superseded

The original spec's plan: a Claude-initiated `getBibleSection(section,
id?)` fetch, for three targets. Of those three, none ended up built as
originally specified: `central_conflict` was superseded by a simpler
design — Phase 2's `buildCampaignBibleContext` (§4) unconditionally
injects Central Conflict + the active beat into every turn instead of
fetching it on demand; `tone_guardrails` was never actually part of the
§2.1 data model Phase 1 built (see §4.2's note); and `npc:<name>` — the
only target this resource still had a real reason to exist for — is now
entirely out of scope, see "Secondary NPC Agendas Deferred" above and
`specs/future-features/campaign-bible-secondary-npcs.md` for the full
writeup of why (a real bootstrapping gap in the original design, not
just an unbuilt feature).

### 5.2 MCP Tools (write) — implemented, see Phase 3 above

**`update_beats`** is fully implemented — see Phase 3's "Implemented as"
above for the actual shape (`packages/server-core/src/
campaignTrackerUpdate.js`, wired into both apps' `routes/
conversations.js` via `maybeAdvanceBeat`, verified against the live API).
Confirms the framing call made before writing any code: it lives as a
**shared, plain tool schema in `packages/server-core`**, not registered
on either app's own `mcp/server.js` — mirroring how `create_campaign_bible`
was built, not a true MCP-server tool, despite this section's inherited
"MCP Tools" name.

### 5.3 Update decision logic — implemented, see Phase 3 above

- **System prompt**: `campaign-tracker-update-pass.md` — see Phase 3's
  "Implemented as" above for the actual decision logic (a 20-message
  window, not single-turn isolation — a deliberate departure from this
  section's original "every response" framing, made once real Bible
  generations showed compound/cumulative-fact beats were the common case).
- **`campaign-tracker-update-instructions.md`**: drafted but never
  wired into any running code — see Phase 3's note above on why (its
  guidance ended up fully redundant with the main prompt's Output
  contract once villain-plan was removed). Left in the repo as
  historical/reference material.

## 6. Leak Prevention Pass (Phase 4)

**What's actually built** (see Phase 4's "Implemented as" above for the
full writeup): a cheap, Haiku-only, detection-only pass that checks the
drafted response in isolation against only the active beat's own
narrative, and logs (doesn't act on) a leak. The rest of this section is
the original, broader design — kept here as the intended destination,
not the current state, since the pieces below are still real gaps:

1. Run a separate, cheap-model pass with: the drafted response + the
   current set of "secret facts" (Central Conflict identity/motivation
   not yet revealed to players, and any pending beat/step content not
   yet reached). **Not yet built**: Central Conflict identity/motivation
   has the exact same structural leak risk as active-beat text (it's
   injected into every turn's context the same way, per Phase 2) but
   isn't checked yet — the current pass only covers the active beat.
   "Pending beat/step content" was never actually at risk the way this
   line implies — pending beats aren't injected into context at all
   (only the active one is), so there's nothing there for this pass to
   catch; this line describes a risk that doesn't exist in the current
   data-injection design.
2. Prompt: "does this response reveal any of these facts, directly or by
   clear implication?" **Refined for the built pass**: framed instead as
   whether a specific secret surfaces incidentally/offhand versus as the
   earned result of depicted player action this same response — see
   `leak-check-pass.md` for the actual wording, which resolves the
   original framing's tension with legitimate, intended beat payoffs
   (a beat's content *should* eventually surface through play; naively
   flagging any match would fight the story's own designed progression).
3. If yes: feed back to the DM generation with the flagged text
   highlighted, request a rewrite, then re-run the check. **Not built.**
   The current pass only detects and logs — no rewrite loop exists. This
   needs the retry-bound question below resolved first.
4. If no: response is released to players as-is. **True today** — since
   there's no rewrite step yet, this is actually the only outcome for
   both `true` and `false` results; a `true` result just logs a warning
   before falling through to the same "release as-is" path.

Models: Haiku as default, switch to Sonnet if a beat was updated this
turn. **Simplified for the built pass**: always Haiku, no escalation —
see Phase 4's "Implemented as" above for why the escalation doesn't fit
the parallel-execution design as it stands.

## Open Questions

- **Leak-check rewrite/retry loop, not built**: the pass currently only
  detects and logs (§6/Phase 4 above) — a flagged response still reaches
  players unchanged. Still needs: how a flagged response gets fed back to
  `generateReply` for a rewrite (its current signature has no "revise
  this, avoiding X" entry point), a max-retry count, and a defined
  fallback (serve a stripped-down safe response? flag for manual review?)
  if the check keeps failing — an unbounded regenerate-and-recheck loop
  is a real risk without one. Worth watching how often real play actually
  flags a leak before designing this — no evidence yet on false-positive
  rate.
- **Central Conflict leak-checking, not built**: the built pass only
  covers the active beat. Central Conflict identity/motivation is
  injected into context the same way (Phase 2) and has the same
  structural risk, but isn't checked. If added, the "already revealed"
  question resurfaces here: the banned-facts list would need to shrink as
  the campaign progresses (e.g. once the reveal beat completes, the
  antagonist's identity is no longer secret and shouldn't block the DM
  from naming them) — likely tied to specific beat-completion flags
  rather than a manually maintained list. Not a problem for the
  beat-only pass as built: an active beat's content is secret by
  definition (it stops being "active" the moment it's earned and
  advances), so there's no shrinking-list problem to solve yet.
- **Review-step UI granularity**: §3.5 says per-section editable fields,
  not one flat textarea — exact modal layout (one big form vs. several
  smaller per-entity modals for NPCs/beats) not yet designed.
- **Admin/dev visibility**: DB-level access by the developer is a soft
  boundary, not a hard one — worth a one-line note in any internal
  documentation of this feature, not a design change.
