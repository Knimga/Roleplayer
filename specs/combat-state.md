# Spec: Combat State

## Status
Planned (2026-09-25). Nothing implemented. Builds on [combat-encounters.md](combat-encounters.md) (the combat mode itself) and supersedes parts of it as each phase lands: its status-ladder tracking (§5.3) is replaced by HP in Phase 3, and its Player/Enemy Phase procedure is reworked in Phase 5. Applies to both games through the shared engine (`packages/server-core/src/combat/`); game-specific numbers come from each app's combat module.

## Summary
Move combat bookkeeping out of the combat DM's memory and into structured state the engine owns: who is fighting, their HP and lasting effects, what round and phase it is, and which actions are declared, resolved, or waiting on a roll. The engine renders that state into the DM's prompt every turn, and advances it deterministically: it rolls ongoing damage, counts durations, resolves spell saves, applies damage. The model keeps the judgment calls (targets, tactics, plausibility, narration). Code keeps the books.

A compact tracker at the top of the combat block in the chat shows players the round, the phase, the party's HP, and each enemy's visible condition, without adding anything to the right panel.

## Why
Every combat failure measured in live testing so far was bookkeeping done by the model:

| Failure | Rate | Cause |
|---|---|---|
| Spell save re-rolled next turn, effect re-applied | 3/3 runs | Tool results vanish from the transcript; the next turn re-resolves a `CAST:` it already resolved |
| Lasting effect not recorded when the spell lands | ~1 in 3 | Relies on the model remembering a tool call mid-sequence |
| Ongoing-damage tick skipped or late | ~1 in 3 | Relies on the model starting every Enemy Phase with a call |
| Countdown not advanced after a tick | ~1 in 3 | Multi-step arithmetic the model runs by hand |

A mechanics log replayed into the transcript would patch the first row only. Structured state fixes all four, and it is the foundation for real HP, initiative, and a visible tracker anyway, so the log is not built.

## Principles
1. **The state is the truth; the transcript is the story.** Anything a later turn needs to know (HP, effects, what's resolved, what's owed, whose turn) lives in state and is rendered fresh each turn. Nothing mechanical has to be recovered from prose.
2. **The model decides; the engine computes.** The DM chooses targets, rules on what's plausible, plays enemies, and narrates. Rolls it doesn't need to see, counts, comparisons, HP arithmetic, and expiry are code.
3. **Every state change is reversible with the message that caused it.** Admin delete-to-retry must keep working, so a DM message's state changes roll back with it.
4. **No new judgment from the engine.** It never decides whether an enemy is in range, who an area spell catches, or whether a desperate move works. Those stay the DM's calls, passed to the engine as arguments.

## Data model

### `combats.state` (new jsonb column)
`combats.context` stays the immutable handoff: location, circumstances, objective, opening action, and each enemy's static fields and stat block. Everything that changes during the fight moves to a new `state` column:

```
state {
  round:       int, starts at 1
  mode:        "phases" | "initiative"         // "phases" until Phase 5
  phase:       "player" | "enemy"              // mode "phases"
  turnOrder?:  combatantId[]                   // mode "initiative" (Phase 5)
  activeIndex?: int                            // mode "initiative"
  combatants: {
    [id]: {
      id, kind: "player" | "enemy",
      name,
      username?:  string                        // players: links to the conversation's character fields
      enemyIndex?: int                          // enemies: index into context.enemies (static stats)
      hp?:        { current, max }              // enemies from Phase 3; players read characterHp (see below)
      effects:    Effect[]                      // lasting effects - today's enemy.effects, generalized
      note?:      string                        // the DM's position/behavior note (today's update_enemy_status note)
      down?:      "dead" | "unconscious" | "fled" | "surrendered"
      initiative?: int                          // Phase 5
    }
  }
  ledger: Entry[]                               // this round only; cleared at the round boundary
  history: string[]                             // one line per finished round, e.g. "Round 1: Kael burned the captain; the archer hit Kael for 3"
}

Effect { name, effect, ongoing?, roundsLeft | null, source? }   // as in effects.js today
Entry  {
  id, round, phase, actor: combatantId,
  kind: "cast" | "attack" | "action",
  summary,                                      // "Immolate on Bandit Captain"
  messageId?,                                   // the player message that declared it (casts)
  spell?,                                       // casts: the full spell, copied at cast time
  targets?: combatantId[],
  status: "pending" | "awaiting" | "resolved",
  awaiting?: { from: combatantId, roll: "attack" | "damage" | "save" | ... }[],
  outcome?:  string,                            // "save failed (9 vs 13); burning 3 rounds; 7 fire damage"
  mechanics?: object                            // engine-computed results: per-target save outcomes, damage applied
}
```

Enemies move out of `context.enemies[].condition` / `.effects` into `state.combatants`. Their static fields and stats stay in `context`, and the combatant points at them by `enemyIndex`.

**Players' HP stays in `conversations.characterHp`.** That's the one source of truth the right panel already edits, and the combatant reads it rather than copying it. Until Phase 6 players keep applying their own damage; the state only displays and reports it.

**Backfill:** when a combat is loaded with `state` null (any fight active at deploy time), the engine builds `state` from `context`: round 1, phase "player", combatants from the players and `context.enemies`, carrying any existing `condition` / `effects` across. No data migration beyond the column.

### `combat_messages.state_before` (new jsonb column)
The state as it was immediately before a DM message was generated, stored on that assistant row. See Rollback.

Migrations: one per app (`combats.state`, `combat_messages.state_before`), both nullable. Both apps, since both host the engine's tables.

## The ledger

A list of what's been declared this round, and whether it's resolved.

**How entries are created:**
- **Casts, exactly and for free.** `POST /cast` during a fight creates a `pending` entry with the full spell copied in and `messageId` set (Phase 2). The route knows everything at intake.
- **Free-text actions at resolution, not intake.** "I shove the archer off the cart" is only an action once the DM interprets it, so the DM records it when it settles it: `resolve_action` creates the entry already `resolved`. The ledger's job is marking what's done, and that happens at resolution. A structured action composer in the UI (the player picks Attack / Cast / Move / Other and a target) is the upgrade path if free text proves the weak link; it is not in this spec.
- **Roll messages are matched, not interpreted.** When a player posts a roll whose type matches something the ledger is `awaiting` from them (an attack roll for their attack spell, a damage roll), the engine attaches it to that entry. Rolls with no match are left for the DM to read as today.

**What it prevents:** the ledger is rendered into the prompt every turn, so the DM sees "Kael: Immolate on Bandit Captain, resolved (save failed 9 vs 13; burning 3 rounds); awaiting Kael's damage roll" rather than inferring it from prose. Resolving an entry twice is a tool error that names the existing outcome, so a double roll can't happen even if the model tries.

**What it enables:**
- The end-of-response list of outstanding rolls comes from `awaiting`, so the DM doesn't have to remember it.
- Phase completion is a lookup: every player has a resolved entry this phase (or has explicitly passed).
- `end_combat`'s `enemyStatus` can be prefilled from state.

## Tools

The combat DM's tools after all phases. Each phase lists which it adds.

| Tool | Phase | Does | Replaces |
|---|---|---|---|
| `advance_phase {}` | 1 | Player → Enemy Phase, or Enemy → Player (round + 1). At the Player → Enemy boundary the engine ticks every lasting effect: rolls ongoing damage, applies it (as HP from Phase 3), counts down, expires. Returns what happened. Refuses with a reason if a player's action this phase is still `pending`. | `tick_effects` |
| `resolve_action { actor, summary, targets?, outcome }` | 1 | Records a free-text action as resolved. | - |
| `apply_effect { target, name, effect, ongoing?, rounds? }` | 1 | Effects the DM originates (an enemy ability, a shove leaving someone prone). Spell effects are applied by the engine from Phase 2. Now works on players too. | today's `apply_effect` |
| `note { target, note }` | 1 | Position and behavior. The status ladder leaves in Phase 3. | `update_enemy_status` |
| `resolve_cast { entry, targets }` | 2 | The DM supplies only the targets it judged in range and inside the area. The engine does the rest: for a save spell it rolls each target's save from their stats (game hook `rollSave`), applies the effect and ongoing damage to failures, and marks the entry `awaiting` the caster's damage roll. For an attack spell it marks the entry `awaiting` the attack roll. | the DM calling `npc_check` + `apply_effect` for spells |
| `apply_damage { target, amount, entry? }` | 3 | Subtracts HP, clamps, and derives the condition word from the HP ratio. With an `entry`, it applies that entry's save outcome itself: half for a target that saved against a half-on-save spell, none for one that negated it. | the status ladder |
| `end_turn {}` | 5 | Initiative mode: advances `activeIndex`, skips anyone `down`, ticks the next combatant's effects at the start of their turn, and increments the round on wrap. | `advance_phase` in initiative mode |

Unchanged: `roll_dice`, `npc_check` (non-spell checks), MCP doc tools, `end_combat`.

Attack spells: when the matched attack roll arrives, the engine compares it with the target's AC (Laria) or defense (Cyberpunk), using the game's beat-the-number rule. It then resolves the hit or miss and moves to `awaiting` damage. The DM narrates what the engine reports.

## Prompt

A new **uncached** system tier, `## Combat State`, placed after the cached handoff tier, rendered from `state`:
- The round and phase (or whose turn it is).
- Each combatant on one line: HP, condition word, lasting effects with rounds left, and the note.
- This round's ledger.
- What's awaited, and from whom.

Mutable data moving out of the cached handoff tier into this uncached one is also a caching win. Today every note or effect change invalidates the handoff cache; after this, the handoff tier changes only when an ad hoc lookup lands.

`combat-dm-core.md` gains a short "Combat State" section:
- The state tier is authoritative. Read it; don't reconstruct from the transcript.
- An entry marked resolved is done.
- Call `advance_phase` at each phase boundary, and narrate what it reports first.
- Engine-computed results (saves, ticks, damage) are narrated, never re-rolled.

The per-game spell sections shrink to "call `resolve_cast` with the targets you judged in range". The Phase 5 initiative rework replaces the Player/Enemy Phase procedure in `combat-dm-core.md`.

## Rollback (admin delete-to-retry)

Deleting a message must undo what it did to state:
- **Deleting the latest DM message** restores `combats.state` from that message's `state_before`. Every change the DM's tools made during that message is undone together, whether HP, effects, the ledger, or the round.
- **Deleting a player's `CAST:` message** (allowed until the DM replies, as for any player message) removes its `pending` ledger entry and refunds the MP to `characterMp`. Found via the entry's `messageId`.
- **Deleting a player's roll message** detaches it from any `awaiting` entry it satisfied, so the entry goes back to awaiting.
- **Edits** to message text never touch state.

## UI: the combat tracker

**Placement: the existing "⚔ Combat" divider becomes the tracker, pinned to the top of the chat while the fight is on.** Today the divider sits at the top of `li.combat-block` inside `#messages` (the chat's scroll container) and holds the "End combat" button. Making it `position: sticky; top: 0` keeps it in view while scrolling through the fight. Because sticky elements are bounded by their containing block, it scrolls away naturally once the player scrolls up past the fight into the chapter. The right panel is untouched, and the tracker exists only during combat.

One row, ~52px, across the 700px chat column:

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ⚔ ROUND 2 · ENEMY PHASE │ Kael ▮▮▮▮▯ 28/32 │ Bram ▮▮▮▮▮ 35/38 ║ Captain  injured 🔥2 │ Archer  unharmed │ End combat │
└──────────────────────────────────────────────────────────────────────────┘
```

- **Left:** the round and phase, or whose turn it is in Phase 5, with the active combatant's chip highlighted.
- **Party chips:** name and HP bar, colored with the existing wound-state classes, since it's the same data the right panel shows.
- **Enemy chips:** name, the condition word, and a small icon with rounds left for each visible effect. **No enemy numbers** (see Open Questions).
- **Overflow:** past four enemies the rest collapse into a `+3` chip that opens a popover with the full list. Clicking any chip opens the same popover focused on that combatant, with fuller detail: effects spelled out, the DM's public-facing note if we choose to expose one (Open Questions).
- **Live:** updates arrive on the chapter's SSE channel as a new `combat-state` event after every DM message and state change.
- The final visual design comes from a mockup in `ui-handoff/`, per `steering/structure.md`.

**Alternatives considered:**
- **Swap the left panel during combat.** The story list isn't needed mid-fight, so the sidebar could show the tracker vertically. There's room for fuller combatant cards. But it hides chapter navigation and the admin's menus during a fight, and moves the fight's status away from where the fight is read. It's a reasonable second choice if the strip proves too cramped.
- **The chat's side margins.** On wide screens there's space on either side of the 700px column, but it disappears on narrower windows. Rejected.
- **The right panel.** Ruled out: it's full, and a scrolling column is not wanted.

## Phases

Each phase ships and is useful on its own.

1. **State core.** Includes:
   - The `combats.state` column, the backfill, and `state_before` with rollback.
   - Combatants (enemies move out of `context`), round and phase, and the ledger with `resolve_action`.
   - `advance_phase` with automatic effect ticks, `note`, and `apply_effect` generalized to players.
   - The Combat State prompt tier and the `combat-dm-core.md` section.

   Removes `tick_effects` and `update_enemy_status`.

   *Fixes: re-resolution, skipped ticks, manual countdowns.*

   Both games.
2. **Engine-resolved spells.** Includes:
   - `/cast` creating ledger entries, and `resolve_cast`.
   - Roll matching to `awaiting` entries, and the attack-spell comparison.
   - The `rollSave` game hook.

   *Fixes: effects not recorded on landing.* Laria only; Cyberpunk has no spells.
3. **Enemy HP.** Includes:
   - An HP max per tier and archetype (Cyberpunk) or per power level and class (Laria) in each game's stat tables. Values authored by the user; placeholders until then. Laria's stat block already carries `hp` (a flat 20 for every enemy, 2026-09-25).
   - `apply_damage` with save-aware halving.
   - The condition word derived from the HP ratio; the status ladder retires.

   Both games.
4. **Tracker UI.** The sticky strip, the `combat-state` SSE event, and the popover. A minimal version (round, phase, effects) could ship right after Phase 1 if wanted.
5. **Initiative and turn order.** Includes:
   - An Initiative option in both dice rollers; enemies' initiative rolled by the engine from their stats (game hook). Laria players' initiative bonus is already stored (`conversations.characterInitiative`, the "Ini" box in the right panel, 2026-09-25), so the engine could also roll it for them. Laria enemies already carry an `initiative` bonus in their stat block (+3/+6/+9/+12 by DEX tier).
   - `turnOrder`, `end_turn`, and per-turn effect ticks.
   - The `combat-dm-core.md` rework.
6. **Later.** The engine applying enemy damage to player HP. That needs a game hook, since Cyberpunk subtracts SP and ablates armor, and it changes a player-owned value. Also: engine-resolved enemy attacks against player AC or DV; player stat blocks as data; enemy armor (Cyberpunk SP).

## Verification

No model calls are needed for most of each phase: engine functions over fixture states, routes through in-process Express against the dev DB, and the generator with a stubbed client (as in the effects tests). All of these run freely.

Live-model runs follow `steering/tech.md`: ask first with the call count and model, keep them lean, and repeat only when measuring consistency. The success criteria are the rows in Why, measured on the same two-turn Immolate scenario used for the baseline:

| Criterion | Baseline (prompt-only / effects tools) | Target |
|---|---|---|
| Save not re-rolled on turn 2 | 1/3 / 0/3 | 3/3 (guarded by the ledger) |
| Effect recorded when the spell lands | 3/5 / 2/3 | 3/3 (engine-applied, Phase 2) |
| Tick happens at the Enemy Phase boundary | 4/5 / 2/3 | 3/3 (`advance_phase`, Phase 1) |
| Countdown correct | 3/5 / 2/3 | deterministic |

The one remaining model-dependent step is calling `advance_phase` at the right moment. The live test measures that directly.

## Open Questions
1. **What do players see about enemies?** The recommendation is condition words and visible effects, never numbers, keeping `combat-dm-core.md`'s "reveal status only through description". Should the admin see real HP (a DM view)? Should the tracker popover show the DM's position note?
2. **Should enemy turns run automatically in initiative mode (Phase 5)?** When the next combatant is an enemy, the engine could call the DM without waiting for a player post. That's faster, but it changes the "you speak once per prompt" rhythm and costs a call per enemy turn unless enemies are batched.
3. **Should the engine apply damage to player HP (Phase 6)?** It's more automatic, but players lose direct ownership of a number they edit today.
4. **Enemy HP values.** The Cyberpunk and Laria tables need authored HP by tier and archetype, or power level and class.
5. **Where should the tracker go?** Is the sticky strip in the chat the right home, or the left-panel swap?
6. **Should effects on players be engine-tracked?** Phase 1 generalizes `apply_effect` to players, but the right panel has no place to show them. Should they appear only in the tracker?
