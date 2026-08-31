# Spec: Campaign Bible

## Status

Phases 1-2 implemented (see Phases below for what that covers and what's
still pending). This doc is the working reference for the whole build;
update each phase's status as work lands rather than treating this as a
fire-and-forget plan.

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
doc: `specs/campaign-bible-villain-plan.md`. It surfaced a real, unsolved
problem while planning Phase 3 (no grounded way to measure narrative time
passing, which its "acts on its own timeline" design depends on) that
deserves focused design attention on its own, not layered onto an
unproven beats-only foundation. See that doc for the full problem
writeup, the candidate solutions considered, and everything already
drafted (prompt text preserved verbatim, not lost). Everything below now
describes the beats-only feature as it actually stands.

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
- [ ] **Phase 3 — MCP write tools + update decision logic.** `update_beats`,
  and the system-prompt/MCP-doc logic that decides when to call it (draft
  prompts already exist: `campaign-tracker-update-pass.md` +
  `campaign-tracker-update-instructions.md`, both beats-only now).
  Highest risk — a bad tool call now mutates campaign state mid-session.
  Two design decisions made while planning this, before any code was
  written: (1) run as a **separate dedicated pass** after narration is
  drafted, not folded into the same tool-use loop as the narration call —
  keeps the update-judgment task from competing for attention with
  narration quality in one generation; (2) this pass and Phase 4's
  leak-check pass are logically independent (both read the same drafted
  response, neither needs the other's output) and should run **in
  parallel**, not sequentially, to roughly halve the added per-turn
  latency versus running them one after another. Neither pass needs the
  full cached system-prompt/tool-definition tier the narration call
  carries — just the drafted response plus whichever slice of state each
  actually needs.

  (3) The tracker-update pass needs more than just the single latest
  response to judge beat advancement correctly — a beat's narrative is
  often satisfied cumulatively across several turns (e.g. two
  independent facts revealed several turns apart, where neither turn
  alone contains both), not always by one self-contained scene.
  Single-turn isolation would systematically under-trigger on exactly
  this shape of beat, which turned out to be the common case, not an
  edge case, once real Bible generations were inspected. Fixed by giving
  the pass a window of recent history instead: the last 20 messages, or
  everything since the active beat became `active` if fewer than 20 -
  conservative by design, tune later only if real behavior shows it's
  actually needed, not preemptively. `campaign-tracker-update-pass.md`
  describes the windowing concept and the chapter-boundary caveat below,
  but deliberately doesn't state the exact count — that's a call-site
  config value (not yet implemented; Phase 3 hasn't been built), tunable
  without touching the prompt. This doc is the one place the current
  actual number is recorded.

  **Chapter-boundary caveat, not yet resolved**: this window can't span
  a chapter boundary — starting a new chapter (`story-chapters.md`)
  begins a genuinely fresh `conversations` row with its own message
  history, seeded only with the AI-generated recap + intro. If a beat
  has been active since before the current chapter started, "the last
  20 messages" is whatever exists so far in the *new* chapter, however
  short — not a true 20-message lookback into the outgoing chapter's
  history. The chapter's own recap message (already a condensed summary
  of everything that mattered in the outgoing chapter) is the closest
  thing to a mitigation here, since it naturally becomes part of the new
  chapter's early window - but it's a narrative-continuity summary
  written for the DM's own restart context, not engineered to preserve
  the specific granular signal a beat-advancement judgment needs. This
  is a known gap, not a solved one — revisit if real play shows beats
  stalling across chapter transitions specifically.
- [ ] **Phase 4 — Leak-prevention pass.** Layered on last: depends on
  Phase 1's secret-fact data, and adds a second LLM call to every DM
  turn's latency/cost budget — worth measuring in isolation before it's
  always-on. See Phase 3's note above on running this in parallel with
  the tracker-update pass, once both exist.

## 1. Purpose & Context

The DM (Claude) currently improvises entirely beat-by-beat within a
single conversation's context. Without persistent long-term structure,
new plot threads and NPC reveals feel disconnected from any wider arc,
and the antagonist has no independent agency — it only reacts to what's
immediately in front of it.

The Campaign Bible is a hidden document generated once per Story,
containing a central conflict, a rough narrative arc ("beats"), and
secondary NPC agendas. It gives Claude durable context to draw on across
an entire Story — including across separate conversations/chapters —
without ever exposing that context to players, preserving in-fiction
discovery. (An antagonist's own independent plan was part of the
original design — see "Villain's Plan Deferred" above for why it's not
part of this spec right now.)

**Out of scope for this spec:** the literal wording of any system prompt
addition or MCP doc. These are called out below by name/purpose only, as
`(LLM instructions — out of scope)`, wherever the workflow depends on one
existing.

## 2. Data Model (Phase 1)

### 2.1 Bible Text (immutable narrative content)

Generated once at Story creation, admin-reviewed before persisting (see
§3). Stored per-Story, organized into named sections so it can be fetched
piecemeal (§5.1) rather than as one document:

- **Campaign Inputs** — player text input; tone, themes, threat
  preference, desired storylines
- **Central Conflict** — Type (Person / Faction / System / Force /
  Hybrid), Identity, Motivation or Nature, Public Face, Resources
- **Secondary NPC Agendas** — 2–4 entries, each with what they want, what
  they know/don't know, how they react if players get close
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
   generated Central Conflict, NPCs, and beats end up grounded in the
   actual world instead of generic placeholders.
4. Claude generates the full Bible Text (§2.1) **and** the initial
   beats tracker (§2.2) in one call, via forced tool-use with a JSON
   schema (see Status point 2) — not free prose requiring a second parse
   step.
5. **Admin review step**: the generated content is shown to the admin,
   editable per-section (Central Conflict fields, each NPC entry, each
   beat's title/narrative) — same review-before-create UX as
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

Registered per-app (each app's own `mcp/server.js`), calling shared
handler functions from `packages/server-core` — thin registration, not
separate per-app logic, same reasoning as this codebase's other shared
server-core pieces.

### 5.1 MCP Resource (read-only)

**`getBibleSection(section, id?)`**
Fetches one named section of Bible Text — never the whole document.
Valid sections: `central_conflict`, `npc:<name>`, `tone_guardrails`.
(Beat narratives are not fetched through this resource — they arrive via
per-request metadata, §4.1.)

Claude-initiated fetch triggers *(system prompt — LLM instructions, out
of scope; named here only)*:

- **New conversation start** → fetch `central_conflict` +
  `tone_guardrails`, once, to reorient tone for a fresh session.
- **Secondary NPC acting independently** → fetch that NPC's entry.

### 5.2 MCP Tools (write)

**`update_beats`**
Marks the current beat `complete` and advances the next beat to
`active`. Returns the new active beat as `{id, title, narrative,
status}` (narrative joined server-side from Bible Text) so the app can
attach it to future request metadata without a separate fetch.

Draft prompts already exist for this — `packages/server-core/prompts/
campaign-tracker-update-pass.md` (the decision of *whether* to call it)
and `campaign-tracker-update-instructions.md` (the procedure for *how* to
fill it in) — written as their own dedicated pass, not folded into the
narration call's tool-use loop. Not yet wired into any code.

### 5.3 Update decision logic

- **System prompt** *(drafted — `campaign-tracker-update-pass.md`)*:
  cheap true/false check run every response — did the active beat's
  implied state get reached.
- **MCP doc** *(drafted — `campaign-tracker-update-instructions.md`)*:
  once the check fires, governs exactly how to fill in the resulting
  `update_beats` call.

## 6. Leak Prevention Pass (Phase 4)

After the DM response is drafted:

1. Run a separate, cheap-model pass with: the drafted response + the
   current set of "secret facts" (Central Conflict identity/motivation
   not yet revealed to players, and any pending beat/step content not
   yet reached).
2. Prompt *(LLM instructions — out of scope)*: "does this response reveal
   any of these facts, directly or by clear implication?"
3. If yes: feed back to the DM generation with the flagged text
   highlighted, request a rewrite, then re-run the check.
4. If no: response is released to players as-is.

Models: Haiku as default, switch to Sonnet if a beat was updated this
turn.

## Open Questions

- **Leak-check retry bound**: needs a max-retry count and a defined
  fallback (serve a stripped-down safe response? flag for manual
  review?) if the check keeps failing — an unbounded regenerate-and-
  recheck loop is a real risk without one.
- **"Already revealed" tracking for leak-check**: the banned-facts list
  passed to the leak check needs to shrink as the campaign progresses
  (e.g., once the reveal beat completes, the antagonist's identity is no
  longer secret and shouldn't block the DM from naming them). Likely tied
  to specific beat-completion flags rather than a manually maintained
  list — not yet designed in detail.
- **Review-step UI granularity**: §3.5 says per-section editable fields,
  not one flat textarea — exact modal layout (one big form vs. several
  smaller per-entity modals for NPCs/beats) not yet designed.
- **Admin/dev visibility**: DB-level access by the developer is a soft
  boundary, not a hard one — worth a one-line note in any internal
  documentation of this feature, not a design change.
